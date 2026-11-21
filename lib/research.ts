import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { isIPv4, isIP } from "node:net";
import { chromium } from "playwright-core";

const MAX_HTML = 768 * 1024;
const MAX_TEXT = 20_000;
let inspections = 0;

/** Only IPv4 is dialled. DNS results are pinned for the lifetime of each GET. */
export function isPublicIPv4(value: string) {
  if (!isIPv4(value)) return false;
  const [a, b, c] = value.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 ||
        (b === 0 && (c === 0 || c === 2)) ||
        (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function allowedSource(
  input: string,
  hosts = process.env.RESEARCH_HOSTS ?? "",
) {
  if (input.length > 2048) throw new Error("Source URL is too long.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid HTTPS source URL.");
  }
  const allowed = hosts
    .toLowerCase()
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (!allowed.length)
    throw new Error("Configure RESEARCH_HOSTS to enable the research viewer.");
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    isIP(host) ||
    !/^[a-z0-9.-]+\.[a-z]{2,63}$/.test(host) ||
    !allowed.includes(host)
  ) {
    throw new Error(
      "This HTTPS source is outside the configured research hosts.",
    );
  }
  url.hash = "";
  return url;
}

async function fetchSource(
  url: URL,
  remainingHops: number,
  deadline: number,
): Promise<{ url: string; html: string }> {
  const remaining = Math.max(1, deadline - Date.now());
  const signal = AbortSignal.timeout(remaining);
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new Error("Source lookup timed out.")),
        { once: true },
      ),
    ),
  ]);
  if (
    !addresses.length ||
    addresses.some((record) => !isPublicIPv4(record.address))
  )
    throw new Error(
      "Source did not resolve exclusively to public IPv4 addresses.",
    );
  const result = await new Promise<{ location?: string; html?: string }>(
    (resolve, reject) => {
      const request = get(
        {
          hostname: addresses[0].address,
          servername: url.hostname,
          port: 443,
          agent: false,
          path: url.pathname + url.search,
          family: 4,
          signal,
          maxHeaderSize: 16384,
          headers: {
            host: url.hostname,
            accept: "text/html",
            "accept-encoding": "identity",
            "user-agent": "SCARLET-Reader/1.0",
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (
            [301, 302, 303, 307, 308].includes(status) &&
            response.headers.location
          ) {
            resolve({ location: response.headers.location });
            response.destroy();
            return;
          }
          if (
            status !== 200 ||
            !/^text\/html(?:\s*;|$)/i.test(
              response.headers["content-type"] ?? "",
            ) ||
            !["", "identity"].includes(
              response.headers["content-encoding"] ?? "",
            ) ||
            response.headers["content-disposition"]
              ?.toLowerCase()
              .includes("attachment") ||
            Number(response.headers["content-length"] ?? 0) > MAX_HTML
          ) {
            reject(
              new Error(
                "The source must return a small HTML page with a successful status.",
              ),
            );
            response.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          response.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length > MAX_HTML)
              return response.destroy(
                new Error("Source page exceeds the download limit."),
              );
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolve({ html: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      request.on("error", reject);
    },
  );
  if (result.location) {
    if (remainingHops === 0)
      throw new Error("Source redirected too many times.");
    return fetchSource(
      allowedSource(new URL(result.location, url).href),
      remainingHops - 1,
      deadline,
    );
  }
  return { url: url.href, html: result.html ?? "" };
}

export type ResearchSnapshot = {
  url: string;
  title: string;
  text: string;
  links: { label: string; url: string }[];
  screenshot: string;
};

/** Render a downloaded source in an isolated offline reader. Raw site markup never enters its live document. */
export async function renderSource(source: {
  url: string;
  html: string;
}): Promise<ResearchSnapshot> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    chromiumSandbox: true,
    timeout: 12_000,
  });
  const timer = setTimeout(() => {
    void browser.close().catch(() => {});
  }, 12_000);
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
      viewport: { width: 960, height: 620 },
      deviceScaleFactor: 1,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>
      *{box-sizing:border-box}body{margin:0;background:#111015;color:#ede9ed;font:19px/1.5 system-ui,sans-serif}main{max-width:840px;margin:auto;padding:48px 52px}small{font:13px ui-monospace,monospace;color:#ee8993;overflow-wrap:anywhere}h1{font-size:34px;line-height:1.15;margin:18px 0 28px}article{white-space:pre-wrap;overflow-wrap:anywhere;color:#d6d0d7}hr{border:0;border-top:1px solid #40363b;margin:22px 0}</style><main><small></small><h1></h1><hr><article></article></main>`);
    const extracted = await page.evaluate(
      ({ html, url, maxText }) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const title = (doc.title || new URL(url).hostname).trim().slice(0, 180);
        doc
          .querySelectorAll(
            'script,style,template,noscript,iframe,object,embed,svg,canvas,form,nav,footer,[hidden],[aria-hidden="true"]',
          )
          .forEach((node) => node.remove());
        const body = doc.querySelector("main,article") ?? doc.body;
        const links: { label: string; url: string }[] = [];
        for (const anchor of Array.from(body.querySelectorAll("a[href]"))) {
          if (links.length >= 16) break;
          try {
            const target = new URL(anchor.getAttribute("href")!, url);
            if (
              target.protocol !== "https:" ||
              target.username ||
              target.password
            )
              continue;
            const label = anchor.textContent?.trim().slice(0, 160);
            if (label && !links.some((link) => link.url === target.href))
              links.push({ label, url: target.href });
          } catch {
            /* Ignore malformed hyperlinks. */
          }
        }
        const blocks = new Set([
          "P",
          "BR",
          "H1",
          "H2",
          "H3",
          "H4",
          "LI",
          "TR",
          "DIV",
          "SECTION",
          "PRE",
        ]);
        const walker = doc.createTreeWalker(
          body,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        );
        let output = "";
        while (walker.nextNode() && output.length < maxText) {
          const node = walker.currentNode;
          if (node.nodeType === Node.TEXT_NODE)
            output += (node.textContent ?? "").replace(/\s+/g, " ");
          else if (blocks.has(node.nodeName)) output += "\n";
        }
        const text = output
          .replace(/[^\S\n]+/g, " ")
          .replace(/ *\n */g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, maxText);
        document.querySelector("h1")!.textContent = title;
        document.querySelector("small")!.textContent =
          `SOURCE READER  /  ${url}`;
        document.querySelector("article")!.textContent = text;
        return { title, text, links };
      },
      { ...source, maxText: MAX_TEXT },
    );
    const image = await page.screenshot({
      type: "jpeg",
      quality: 72,
      timeout: 5000,
    });
    return {
      url: source.url,
      ...extracted,
      screenshot: `data:image/jpeg;base64,${image.toString("base64")}`,
    };
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
}

export async function inspectWebsite(input: string): Promise<ResearchSnapshot> {
  const url = allowedSource(input);
  if (inspections >= 2)
    throw new Error("Both research slots are busy. Try again shortly.");
  inspections++;
  try {
    return await renderSource(await fetchSource(url, 3, Date.now() + 12_000));
  } finally {
    inspections--;
  }
}
