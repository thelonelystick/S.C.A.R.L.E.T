import { crc32, inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

const XML_LIMIT = 3 * 1024 * 1024;
const EXPANDED_LIMIT = 16 * 1024 * 1024;
const badZip = () => new Error("Unsupported or invalid Office archive.");

type Entry = { method: number; size: number; packed: Buffer; crc: number };

/** Read the central directory without extracting paths to disk. Enforce both the declared and actual output size. */
function directory(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (
    end < 0 ||
    end + 22 > bytes.length ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0 ||
    end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
  )
    throw badZip();
  const count = bytes.readUInt16LE(end + 10);
  if (count > 512 || bytes.readUInt16LE(end + 8) !== count)
    throw new Error("Office document contains too many parts.");
  let cursor = bytes.readUInt32LE(end + 16);
  const centralStart = cursor;
  if (cursor + bytes.readUInt32LE(end + 12) !== end) throw badZip();
  let expanded = 0;
  const entries = new Map<string, Entry>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw badZip();
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42),
      crc = bytes.readUInt32LE(cursor + 16);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    cursor += 46 + nameLength + extra + comment;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      cursor > end ||
      local + 30 > centralStart ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) !== flags ||
      !name ||
      /^[/.\\]|[\\:\x00-\x1f]/.test(name) ||
      name.split("/").includes("..") ||
      entries.has(name)
    )
      throw badZip();
    const localNameLength = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (
      start + compressed > centralStart ||
      bytes
        .subarray(local + 30, local + 30 + localNameLength)
        .toString("utf8") !== name
    )
      throw badZip();
    if (/vbaProject\.bin$|(?:^|\/)(?:activeX|embeddings)\//i.test(name))
      throw new Error(
        "Embedded executables, controls, and macros are unsupported.",
      );
    expanded += size;
    if (
      expanded > EXPANDED_LIMIT ||
      (name.endsWith(".xml") && size > XML_LIMIT)
    )
      throw new Error("Office document exceeds the expanded size limit.");
    entries.set(name, {
      method,
      size,
      packed: bytes.subarray(start, start + compressed),
      crc,
    });
  }
  if (cursor !== end) throw badZip();
  return entries;
}

type XmlNode = Record<string, unknown>;
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  ignoreDeclaration: true,
  removeNSPrefix: true,
  maxNestedTags: 96,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
});
const tag = (node: XmlNode): string =>
  Object.keys(node).find((k) => k !== ":@") ?? "";
const children = (node: XmlNode): XmlNode[] =>
  Array.isArray(node[tag(node)]) ? (node[tag(node)] as XmlNode[]) : [];
const attr = (node: XmlNode, key: string): string =>
  String(
    (node[":@"] as Record<string, string> | undefined)?.[`@_${key}`] ?? "",
  );
function nodes(tree: XmlNode[], name: string) {
  const result: XmlNode[] = [];
  const walk = (list: XmlNode[], depth: number) => {
    if (depth > 96)
      throw new Error("Office document exceeds the nesting limit.");
    for (const n of list) {
      if (tag(n) === name) result.push(n);
      else walk(children(n), depth + 1);
    }
  };
  walk(tree, 0);
  return result;
}
function decode(value: string) {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#x[0-9a-f]{1,6}|#[0-9]{1,7});/gi,
    (_, entity: string) => {
      if (entity[0] !== "#")
        return (
          (
            { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<
              string,
              string
            >
          )[entity] ?? ""
        );
      const n =
        entity[1] === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : "";
    },
  );
}
function content(n: XmlNode) {
  return decode(
    nodes(children(n), "#text")
      .map((t) => String(t["#text"]))
      .join(""),
  );
}
function xml(entries: Map<string, Entry>, name: string): XmlNode[] {
  const e = entries.get(name);
  if (!e || e.size > XML_LIMIT) throw badZip();
  const data =
    e.method === 0
      ? e.packed
      : inflateRawSync(e.packed, { maxOutputLength: Math.max(1, e.size) });
  if (data.length !== e.size || crc32(data) !== e.crc) throw badZip();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("Custom XML entities are unsupported.");
  return parser.parse(text, true) as XmlNode[];
}

export function extractOffice(
  ext: string,
  bytes: Buffer,
  limit: number,
): string {
  const entries = directory(bytes);
  if (!entries.has("[Content_Types].xml")) throw badZip();
  if (ext === "docx") {
    const tree = xml(entries, "word/document.xml");
    return nodes(tree, "p")
      .map((p) =>
        nodes(children(p), "r")
          .map((r) =>
            children(r)
              .map((n) => {
                if (tag(n) === "t") return content(n);
                if (tag(n) === "tab") return "\t";
                if (tag(n) === "br" || tag(n) === "cr") return "\n";
                return "";
              })
              .join(""),
          )
          .join(""),
      )
      .join("\n")
      .slice(0, limit);
  }
  const sheets = nodes(xml(entries, "xl/workbook.xml"), "sheet");
  const relationships = nodes(
    xml(entries, "xl/_rels/workbook.xml.rels"),
    "Relationship",
  );
  const shared = entries.has("xl/sharedStrings.xml")
    ? nodes(xml(entries, "xl/sharedStrings.xml"), "si").map((si) =>
        nodes(children(si), "t").map(content).join(""),
      )
    : [];
  const out: string[] = [];
  let length = 0;
  for (const sheet of sheets) {
    const relationship = relationships.find(
      (r) =>
        attr(r, "Id") === attr(sheet, "id") &&
        attr(r, "Type").endsWith("/worksheet") &&
        attr(r, "TargetMode") !== "External",
    );
    if (!relationship) continue;
    const target = attr(relationship, "Target");
    const file = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(file)) throw badZip();
    const label = `[${decode(attr(sheet, "name"))}]`;
    out.push(label);
    length += label.length + 1;
    for (const c of nodes(xml(entries, file), "c")) {
      if (length >= limit) break;
      const valueNode = children(c).find((n) => tag(n) === "v"),
        type = attr(c, "t");
      let value = valueNode ? content(valueNode) : "";
      if (type === "s") value = shared[Number(value)] ?? "";
      if (type === "inlineStr")
        value = nodes(children(c), "t").map(content).join("");
      const formula = children(c).find((n) => tag(n) === "f");
      if (formula) value = `${value} [formula: ${content(formula)}]`.trim();
      if (!value) continue;
      const line = `${attr(c, "r")}\t${value}`;
      out.push(line);
      length += line.length + 1;
    }
    if (length >= limit) break;
  }
  return out.join("\n").slice(0, limit);
}
