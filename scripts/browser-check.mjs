import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.APP_URL || "http://localhost:5173";
await page.goto(base);
await page
  .getByRole("button", { name: "Mit Beispieldaten ausprobieren", exact: true })
  .click();
await page.getByRole("heading", { name: "Guten Tag, Anna." }).waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
  "Mobile dashboard overflow",
);
if (process.env.QA_SCREENSHOT_DIR)
  await page.screenshot({
    path: process.env.QA_SCREENSHOT_DIR + "/dashboard-mobile.png",
    fullPage: true,
  });
await page.setViewportSize({ width: 1440, height: 1000 });
if (process.env.QA_SCREENSHOT_DIR)
  await page.screenshot({
    path: process.env.QA_SCREENSHOT_DIR + "/dashboard-desktop.png",
    fullPage: true,
  });
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Besuch öffnen", exact: true }).click();
await page.getByRole("button", { name: "Start", exact: true }).first().click();
await page.getByRole("timer").waitFor();
const initial = await page.getByRole("timer").textContent();
await page.waitForTimeout(1200);
assert.notEqual(
  await page.getByRole("timer").textContent(),
  initial,
  "Timer is ticking",
);
await page.getByLabel("Materialkosten (€)", { exact: true }).fill("8,20");
await page.getByLabel("Manueller Endpreis (€)", { exact: true }).fill("40");
await page
  .getByRole("button", { name: "Zwischenstand speichern", exact: true })
  .click();
await page.getByText("Zwischenstand gespeichert", { exact: true }).waitFor();
await page.reload();
await page.getByRole("timer").waitFor();
assert.equal(
  await page.getByLabel("Materialkosten (€)", { exact: true }).inputValue(),
  "8.2",
);
await page
  .getByRole("button", { name: "Behandlung beenden", exact: true })
  .click();
await page.getByRole("heading", { name: "Kundenliste" }).waitFor();
await page.getByRole("button", { name: "Start", exact: true }).first().click();
await page.getByRole("timer").waitFor();
await page
  .getByRole("button", { name: "Behandlung beenden", exact: true })
  .click();
await page.getByRole("button", { name: /nicht durchgeführt/ }).click();
await page.getByRole("button", { name: "Speichern", exact: true }).click();
await page
  .getByText("Als nicht durchgeführt markiert", { exact: true })
  .waitFor();
await page
  .getByRole("button", { name: "Besuch abschließen", exact: true })
  .click();
await page
  .getByRole("button", { name: "Besuch endgültig abschließen", exact: true })
  .click();
await page
  .getByRole("button", { name: "PDF herunterladen", exact: true })
  .waitFor();
const downloadPromise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "PDF herunterladen", exact: true })
  .click();
const download = await downloadPromise;
assert.match(download.suggestedFilename(), /Besuchsbericht-.*\.pdf/);
if (process.env.QA_SCREENSHOT_DIR)
  await download.saveAs(process.env.QA_SCREENSHOT_DIR + "/report.pdf");
const db = await page.evaluate(() =>
  JSON.parse(sessionStorage.getItem("heimfriseur-demo")),
);
assert.equal(
  db.appointments.find((a) => a.id === "a1").status,
  "Abgeschlossen",
);
assert.equal(db.treatments.filter((t) => t.end_time).length, 2);
assert.equal(
  db.appointments.filter((a) => a.recurrence_series_id === "series1").length,
  2,
);
assert.equal(
  db.treatments.reduce((n, t) => n + t.material_cost, 0),
  8.2,
);
await page.goto(base + "/#reports");
await page.getByRole("heading", { name: "Auswertung", exact: true }).waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
  "Mobile reports overflow",
);
await page.goto(base + "/#facilities");
await page.getByRole("button", { name: "Einrichtung", exact: true }).click();
await page.getByLabel("Name *", { exact: true }).fill("Testeinrichtung");
await page.getByRole("button", { name: "Speichern", exact: true }).click();
await page
  .getByRole("heading", { name: "Testeinrichtung", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Wohnbereich", exact: true }).click();
await page.getByLabel("Gruppenname *", { exact: true }).fill("Testgruppe");
await page.getByRole("button", { name: "Speichern", exact: true }).click();
await page.getByRole("heading", { name: "Testgruppe", exact: true }).waitFor();
await page.getByRole("button", { name: "Kunde", exact: true }).click();
await page.getByLabel("Vorname *", { exact: true }).fill("Test");
await page.getByLabel("Nachname *", { exact: true }).fill("Person");
await page.getByRole("checkbox", { name: /Herrenhaarschnitt/ }).check();
await page.getByRole("button", { name: "Speichern", exact: true }).click();
await page.getByText("Test Person", { exact: true }).waitFor();
await page.getByRole("button", { name: "Besuch planen", exact: true }).click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Besuch planen", exact: true })
  .click();
await page.getByRole("button", { name: "Start", exact: true }).waitFor();
const updated = await page.evaluate(() =>
  JSON.parse(sessionStorage.getItem("heimfriseur-demo")),
);
assert.ok(
  updated.customers.some(
    (c) => c.first_name === "Test" && c.last_name === "Person",
  ),
);
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  "Browser flow passed: mobile + desktop, timer reload, treatment, skip, close, recurrence, reports, PDF, facility/group/customer CRUD.",
);
if (process.env.CHECK_PWA === "1") {
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const manifest = await (
    await page.request.get(base + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons)
    assert.equal((await page.request.get(base + icon.src)).status(), 200);
  await page.context().setOffline(true);
  await page.goto(base + "/offline-check");
  await page
    .getByRole("heading", { name: "Du bist gerade offline." })
    .waitFor();
  await page.context().setOffline(false);
  console.log(
    "PWA checks passed: manifest, icons, active service worker and offline navigation.",
  );
}
await browser.close();
