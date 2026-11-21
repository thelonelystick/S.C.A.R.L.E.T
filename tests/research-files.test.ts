import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import sharp from "sharp";
import { extractDocument, MAX_UPLOAD_BYTES } from "../lib/documents";
import { allowedSource, isPublicIPv4, renderSource } from "../lib/research";

// Tiny real ZIP fixtures keep the test independent of Office and external services.
function archive(files: Record<string, string>) {
  const local: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [path, source] of Object.entries(files)) {
    const name = Buffer.from(path),
      raw = Buffer.from(source),
      compressed = deflateRawSync(raw);
    const head = Buffer.alloc(30),
      record = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(compressed.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc32(raw), 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    local.push(head, name, compressed);
    directory.push(record, name);
    offset += head.length + name.length + compressed.length;
  }
  const dir = Buffer.concat(directory),
    end = Buffer.alloc(22),
    count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}

function pdfFixture() {
  const stream = "BT /F1 14 Tf 20 80 Td (Mission notes) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let file = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, data] of objects.entries()) {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${data}\nendobj\n`;
  }
  const start = file.length;
  file += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((i) => `${i.toString().padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(file);
}

test("reader accepts only exact approved HTTPS origins and canonical URLs", () => {
  assert.equal(
    allowedSource("https://EXAMPLE.ORG/docs#part", "example.org").href,
    "https://example.org/docs",
  );
  for (const url of [
    "http://example.org/a",
    "https://example.org:444/a",
    "https://user@example.org/",
    "https://sub.example.org/",
    "https://127.0.0.1/",
    "file:///tmp/document",
  ]) {
    assert.throws(() => allowedSource(url, "example.org,127.0.0.1"));
  }
  assert.throws(() => allowedSource("https://example.org", ""));
});
test("reader rejects local, reserved and non-IPv4 destinations", () => {
  for (const ip of [
    "0.2.3.4",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.30.1.4",
    "100.64.0.1",
    "192.168.2.1",
    "192.0.2.2",
    "198.18.3.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4("1.1.1.1"), true);
});
test(
  "isolated Chromium produces a real source-reader screenshot",
  { skip: !process.env.CHROMIUM_PATH },
  async () => {
    const result = await renderSource({
      url: "https://example.org/report",
      html: '<title>Field notes</title><main><h1>Quarterly report</h1><p>Delivered <b>on time</b>.</p><a href="/notes">Details</a><form>Hidden form</form><script>void 0</script></main>',
    });
    assert.equal(result.title, "Field notes");
    assert.match(result.text, /Delivered on time/);
    assert.doesNotMatch(result.text, /Hidden form|void 0/);
    assert.equal(result.links[0].url, "https://example.org/notes");
    assert.ok(result.screenshot.startsWith("data:image/jpeg;base64,/9j/"));
  },
);
test("validates names, sizes, MIME, signatures, UTF-8 and text extraction", async () => {
  assert.equal(
    (
      await extractDocument(
        "todo.md",
        Buffer.from("one\r\ntwo\n"),
        "text/markdown",
      )
    ).text,
    "one\ntwo",
  );
  await assert.rejects(
    extractDocument("scan.pdf", Buffer.from("hello")),
    /PDF header/,
  );
  await assert.rejects(
    extractDocument("page.exe", Buffer.from("hello")),
    /unsupported/,
  );
  await assert.rejects(
    extractDocument("file.constructor", Buffer.from("hello")),
    /unsupported/,
  );
  await assert.rejects(
    extractDocument("../todo.txt", Buffer.from("hello")),
    /name/,
  );
  await assert.rejects(
    extractDocument("x.csv", Buffer.alloc(MAX_UPLOAD_BYTES + 1)),
    /5 MiB/,
  );
  await assert.rejects(extractDocument("x.txt", Buffer.from([0, 0])), /Binary/);
  await assert.rejects(
    extractDocument("x.txt", Buffer.from("hey"), "image/png"),
    /type/,
  );
});
test("reads PDF text with a separate, bounded parser process", async () => {
  assert.match(
    (await extractDocument("brief.pdf", pdfFixture())).text,
    /Mission notes/,
  );
});
test("reads DOCX paragraphs, escapes and tabs while enforcing package limits", async () => {
  const files = {
    "[Content_Types].xml": "<Types/>",
    "word/document.xml":
      '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Alpha &amp; Beta</w:t><w:tab/><w:t>Now</w:t></w:r></w:p></w:body></w:document>',
  };
  assert.equal(
    (await extractDocument("brief.docx", archive(files))).text,
    "Alpha & Beta\tNow",
  );
  await assert.rejects(
    extractDocument(
      "macro.docx",
      archive({ ...files, "word/vbaProject.bin": "x" }),
    ),
    /macros/,
  );
  await assert.rejects(
    extractDocument(
      "long.docx",
      archive({ ...files, "word/extra.xml": " ".repeat(3 * 1024 * 1024 + 1) }),
    ),
    /expanded/,
  );
  await assert.rejects(
    extractDocument(
      "declaration.docx",
      archive({ ...files, "word/document.xml": "<!DOCTYPE doc><doc/>" }),
    ),
    /entities/,
  );
});
test("reads workbook sheet names, cells, shared and inline strings and cached formulas", async () => {
  const file = archive({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml":
      '<workbook xmlns:r="urn:rel"><sheets><sheet name="Budget" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Type="urn:office/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Revenue</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Actual</t></is></c><c r="C1"><f>4+5</f><v>9</v></c></row></sheetData></worksheet>',
  });
  const { text } = await extractDocument("numbers.xlsx", file);
  assert.equal(text, "[Budget]\nA1\tRevenue\nB1\tActual\nC1\t9 [formula: 4+5]");
});
test("validates and normalizes image uploads", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#ee0033" },
  })
    .png()
    .toBuffer();
  const result = await extractDocument("pic.png", png, "image/png");
  assert.equal(result.mime, "image/jpeg");
  assert.match(result.imageDataUrl!, /^data:image\/jpeg;base64,\/9j\//);
  await assert.rejects(extractDocument("bad.jpg", png), /valid single-frame/);
});
