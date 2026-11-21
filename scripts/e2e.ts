import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:4317";
async function main() {
  const where = resolve(
    process.env.SCREENSHOT_DIR || "test-results/screenshots",
  );
  await mkdir(where, { recursive: true });
  const chrome =
    process.env.CHROMIUM_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/chromium");
  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    chromiumSandbox: true,
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 925 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage(),
      faults: string[] = [];
    page.on("pageerror", (e) => faults.push(e.message));
    page.setDefaultTimeout(65000);
    const shot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(where, name + ".png"),
        fullPage: true,
        animations: "disabled",
      });
    };
    const go = async (name: string) => {
      await page.goto(base + "/" + name, { waitUntil: "domcontentloaded" });
      await page.locator("#main h1").waitFor();
    };
    const a11y = async (name: string) => {
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const serious = r.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      );
      console.log(
        name + " accessibility",
        JSON.stringify(
          serious.map((v) => [v.id, v.nodes.map((n) => n.target)]),
        ),
      );
      return serious.length;
    };
    await page.goto(base);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await shot("01-landing");
    await page.getByRole("link", { name: "Open command center" }).click();
    await page
      .getByRole("heading", { name: "Command center", exact: true })
      .waitFor();
    await page.getByRole("heading", { name: "Neural core" }).waitFor();
    await shot("02-dashboard");
    let issues = await a11y("dashboard");
    await page.getByRole("button", { name: "Search workspace" }).click();
    await page.getByRole("textbox", { name: "Find a module" }).fill("memory");
    await page.getByRole("textbox", { name: "Find a module" }).press("Enter");
    await page.getByRole("heading", { level: 1, name: "Memory" }).waitFor();
    await go("chat");
    const typed = page.getByRole("textbox", { name: "Message", exact: true });
    await typed.fill("Remember that the system review is on Thursday.");
    await page.getByRole("button", { name: "Send message" }).click();
    await page
      .getByText("Saved to your memory.", { exact: false })
      .first()
      .waitFor();
    await typed.fill("Show my memories");
    await page.getByRole("button", { name: "Send message" }).click();
    await page
      .getByText("1. the system review is on Thursday.", { exact: true })
      .waitFor();
    assert.deepEqual(
      await page.locator(".chat-body .bubble b").allTextContents(),
      ["You", "S.C.A.R.L.E.T.", "You", "S.C.A.R.L.E.T."],
      "Conversation turns must keep insertion order",
    );
    await shot("03-chat");
    issues += await a11y("chat");
    await go("voice");
    await page.getByRole("textbox", { name: "Typed voice command" }).waitFor();
    await shot("04-voice");
    issues += await a11y("voice");
    await go("integrations");
    await page.getByText("Gmail", { exact: true }).first().waitFor();
    await shot("05-integrations");
    issues += await a11y("integrations");
    for (const view of [
      "browser",
      "whatsapp",
      "email",
      "calendar",
      "automations",
      "files",
      "memory",
      "activity",
      "settings",
    ]) {
      await go(view);
      assert.ok(await page.locator("#main").innerText());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await go("dashboard");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("link", { name: "Voice assistant", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Voice assistant", level: 1 })
      .waitFor();
    await go("dashboard");
    await shot("06-mobile");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Mobile layout exceeded viewport",
    );
    assert.deepEqual(faults, [], "Uncaught browser errors");
    assert.equal(
      issues,
      0,
      "Resolve serious or critical accessibility findings",
    );
    console.log(
      "All interactive browser, navigation, responsive and accessibility checks passed.",
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
