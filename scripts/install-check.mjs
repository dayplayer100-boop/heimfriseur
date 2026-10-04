import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const base = process.env.APP_URL || "http://localhost:4173";
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page
  .getByRole("button", { name: "App installieren", exact: true })
  .waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
// Check a user-triggered prompt through the browser's install event contract.
await page.evaluate(() => {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => {
    window.installPromptOpened = true;
  };
  event.userChoice = Promise.resolve({ outcome: "dismissed" });
  window.dispatchEvent(event);
  window.installEventCaptured = event.defaultPrevented;
});
await page
  .getByRole("button", { name: "App installieren", exact: true })
  .click();
assert.equal(await page.evaluate(() => window.installPromptOpened), true);
assert.equal(await page.evaluate(() => window.installEventCaptured), true);
await page
  .getByRole("button", { name: "App installieren", exact: true })
  .click();
await page.getByRole("dialog", { name: "HeimFriseur installieren" }).waitFor();
await page.getByRole("button", { name: "Verstanden", exact: true }).click();
await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
await page
  .getByRole("button", { name: "App installieren", exact: true })
  .waitFor({ state: "hidden" });
const ios = await browser.newPage({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
});
await ios.goto(base);
await ios
  .getByRole("button", { name: "App installieren", exact: true })
  .click();
await ios
  .getByRole("dialog")
  .getByText("Zum Home-Bildschirm", { exact: true })
  .waitFor();
assert.equal(
  await ios.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  "Install checks passed: visible mobile button, deferred native prompt, dismissal fallback, installed state, iPhone instructions and no horizontal overflow. Native OS installation requires verification on the target device.",
);
await browser.close();
