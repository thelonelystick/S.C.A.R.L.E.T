import { execFile } from "node:child_process";
import { connect } from "node:net";
import { extname, join } from "node:path";
import sharp from "sharp";
import { extractOffice } from "./extractors/office";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 120000;
const TEXT_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  ts: "text/plain",
  tsx: "text/plain",
  js: "text/javascript",
  jsx: "text/plain",
  py: "text/plain",
  sql: "text/plain",
  css: "text/css",
  go: "text/plain",
  rs: "text/plain",
  java: "text/plain",
  c: "text/plain",
  cpp: "text/plain",
  h: "text/plain",
  sh: "text/plain",
  yaml: "text/yaml",
  yml: "text/yaml",
};
const OFFICE_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const IMAGE_TYPES: Record<string, string> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};
export interface ExtractedDocument {
  name: string;
  mime: string;
  text: string;
  imageDataUrl?: string;
}

async function scan(bytes: Buffer) {
  const path = process.env.CLAMAV_SOCKET;
  if (!path) return;
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ path });
    const timer = setTimeout(
      () => socket.destroy(new Error("Scanner timed out.")),
      8000,
    );
    let reply = "";
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 65536) {
        const chunk = bytes.subarray(i, i + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (data) => {
      reply += data.toString("utf8");
      if (reply.length > 1024)
        socket.destroy(new Error("Invalid scanner reply."));
      else if (reply.includes("\0")) {
        if (reply.trimEnd() === "stream: OK\0") resolve();
        else reject(new Error("Upload rejected by the file scanner."));
        socket.destroy();
      }
    });
    socket.on("error", () =>
      reject(
        new Error("The file scanner is unavailable. Upload was declined."),
      ),
    );
    socket.on("close", () => {
      clearTimeout(timer);
      reject(new Error("File scanner disconnected."));
    });
  });
}

async function pdfText(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const file = join(process.cwd(), "lib", "extractors", "pdf.cjs");
    const child = execFile(
      process.execPath,
      ["--max-old-space-size=192", file],
      {
        timeout: 15000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env: {
          NODE_ENV: process.env.NODE_ENV || "production",
          PATH: process.env.PATH,
          ...(process.platform === "win32" && {
            SystemRoot: process.env.SystemRoot,
          }),
        },
      },
      (error, stdout) => {
        if (error)
          return reject(
            new Error(
              "PDF extraction failed. Check that the document is readable and unlocked.",
            ),
          );
        try {
          const text: unknown = JSON.parse(stdout);
          if (typeof text !== "string") throw new Error();
          resolve(text);
        } catch {
          reject(
            new Error("PDF text extraction produced an unreadable result."),
          );
        }
      },
    );
    child.stdin?.on("error", () => {}); // Early parser exit is reported by the callback.
    child.stdin?.end(bytes);
  });
}

function decodeText(bytes: Buffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Save text documents as UTF-8 and try again.");
  }
  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(text))
    throw new Error("Binary data cannot be uploaded as text.");
  return text.slice(0, MAX_TEXT).replace(/\r\n?/g, "\n");
}

/** Uploads are user input. Call only after authenticating, limiting request size and enforcing user quota. */
async function normalizeDocument(
  name: string,
  bytes: Buffer,
  mime = "",
): Promise<ExtractedDocument> {
  name = name.normalize("NFC").trim();
  if (
    !name ||
    name.length > 160 ||
    /[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(name)
  )
    throw new Error("Invalid document name.");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("Choose a nonempty file up to 5 MiB.");
  const ext = extname(name).toLowerCase().slice(1);
  if (
    ![TEXT_TYPES, OFFICE_TYPES, IMAGE_TYPES].some((group) =>
      Object.hasOwn(group, ext),
    ) &&
    ext !== "pdf"
  )
    throw new Error("This file format is unsupported.");
  const imageFormat = IMAGE_TYPES[ext];
  const expected =
    TEXT_TYPES[ext] ||
    OFFICE_TYPES[ext] ||
    (ext === "pdf"
      ? "application/pdf"
      : imageFormat
        ? `image/${imageFormat}`
        : "");
  if (!expected) throw new Error("This file format is unsupported.");
  const declared = mime.toLowerCase().split(";", 1)[0].trim();
  const generic = !declared || declared === "application/octet-stream";
  const textAlias =
    !!TEXT_TYPES[ext] &&
    (declared.startsWith("text/") ||
      [
        "application/json",
        "application/javascript",
        "application/x-yaml",
        "application/yaml",
      ].includes(declared));
  if (!generic && declared !== expected && !textAlias)
    throw new Error("The upload type does not match its extension.");
  await scan(bytes);
  if (imageFormat) {
    try {
      const input = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: 16_000_000,
      });
      const meta = await input.metadata();
      if (meta.format !== imageFormat || (meta.pages ?? 1) !== 1)
        throw new Error();
      // Fully decode and re-encode to validate pixels and remove metadata before presenting the image.
      const image = await input
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#fff" })
        .jpeg({ quality: 80 })
        .toBuffer();
      return {
        name,
        mime: "image/jpeg",
        text: "",
        imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
      };
    } catch {
      throw new Error(
        "Choose a valid single-frame PNG, JPEG, or WebP image under 16 megapixels.",
      );
    }
  }
  let text: string;
  if (ext === "pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("Invalid PDF header.");
    text = await pdfText(bytes);
  } else if (OFFICE_TYPES[ext]) {
    text = extractOffice(ext, bytes, MAX_TEXT);
  } else {
    text = decodeText(bytes);
  }
  text = text.replace(/\u0000/g, "").trim();
  if (!text)
    throw new Error(
      "This document contains no extractable text. Scanned PDFs require OCR.",
    );
  return { name, mime: expected, text };
}

export async function extractDocument(
  name: string,
  bytes: Buffer,
  mime = "",
): Promise<ExtractedDocument> {
  try {
    return await normalizeDocument(name, bytes, mime);
  } catch (cause) {
    // XML and inflate diagnostics can contain uploaded data. Expose only our own validation messages.
    const detail = cause instanceof Error ? cause.message : "";
    const safe =
      /^(Invalid (document name|PDF header)|Choose a |This (file format|document contains)|The (upload type|file scanner)|Upload rejected|File scanner|Save text documents|Binary data|PDF (extraction failed|text extraction produced)|Unsupported or invalid Office archive|Office document (contains|exceeds)|Embedded executables|Custom XML entities)/.test(
        detail,
      );
    const error = new Error(
      safe
        ? detail
        : "The file could not be read. Check its format and try again.",
    );
    error.name = "DocumentError";
    throw error;
  }
}
