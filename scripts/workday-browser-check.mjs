import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const base = process.env.APP_URL || "http://localhost:4173",
  meta = await (await fetch(base + "/version.json")).json();
assert.equal(meta.version, "6.0.1");
assert.ok(meta.buildId.startsWith(meta.version + "-"));
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let available = meta;
await page.route("**/version.json*", (route) =>
  route.fulfill({ json: available, headers: { "Cache-Control": "no-store" } }),
);
const read = () =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("heimfriseur-demo")));
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: /^(Mit )?Beispieldaten ausprobieren$/ })
    .click();
  await page.getByRole("heading", { name: "Guten Tag, Anna." }).waitFor();
  await page
    .getByRole("button", { name: "Auf Updates prüfen", exact: true })
    .click();
  await page
    .getByText("Website und App sind auf der aktuellen Version 6.0.1", {
      exact: true,
    })
    .waitFor();
  await page.goto(base + "/#calendar");
  await page
    .locator("summary")
    .filter({ hasText: "Wochenplanung je Heim" })
    .click();
  await page.getByLabel("Heim für die Wochenplanung").selectOption("f1");
  await page
    .getByRole("button", { name: "Einmalig ändern", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Datum", { exact: true }).fill("06.10.2027");
  await dialog.getByLabel("Uhrzeit (HHMM oder HH:MM)").fill("0930");
  await dialog
    .getByRole("button", { name: "Einmaligen Termin speichern", exact: true })
    .click();
  await page.getByRole("button", { name: "Start", exact: true }).waitFor();
  let d = await read();
  const target = d.appointments.find(
    (a) => a.appointment_date === "2027-10-06" && a.start_time === "09:30",
  );
  assert.ok(target);
  const c = d.customers.find((c) => c.id === target.selected_customer_id);
  assert.equal(c.temporary_due_date, "2027-10-06");
  assert.ok(c.rhythm_anchor_date);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("timer").waitFor();
  await page.getByLabel("Materialkosten (€)").fill("3,50");
  await page.waitForFunction(() =>
    JSON.parse(sessionStorage.getItem("heimfriseur-demo")).treatments.some(
      (t) => !t.end_time && t.material_cost === 3.5,
    ),
  );
  available = { version: "6.0.1", buildId: "6.0.1-test-deployment" };
  await page
    .getByRole("button", { name: "Auf Updates prüfen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Neue Version laden", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Neue Version laden", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Behandlung beenden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Später erfassen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Neue Version laden", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Neue Version laden", exact: true })
      .isDisabled(),
    false,
  );
  const persisted = await read();
  const t = persisted.treatments.find((t) => t.appointment_id === target.id);
  assert.ok(t.end_time);
  assert.equal(t.material_cost, 3.5);
  available = meta;
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("button", { name: "Neue Version laden", exact: true })
      .click(),
  ]);
  await page
    .getByRole("heading", { name: /Seniorenheim Sonnengarten/ })
    .waitFor();
  assert.equal(
    (await read()).treatments.find((x) => x.id === t.id).material_cost,
    3.5,
  );
  await page.goto(base + "/#settings/Abrechnung");
  await page
    .getByRole("heading", {
      name: "Offene Zahlungen / noch nicht erfasst",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Abrechnung öffnen", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Zahlungsstatus", { exact: true }).inputValue(),
    "Unbekannt",
  );
  await page
    .getByLabel("Zahlungsstatus", { exact: true })
    .selectOption("Offen");
  await page
    .getByRole("button", { name: "Zahlung speichern", exact: true })
    .click();
  assert.equal(
    (await read()).treatment_payments.find((p) => p.treatment_id === t.id)
      .status,
    "Offen",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "V6 browser passed: weekly one-time planning, cadence anchor, unknown/open payments, version discovery, update blocked during treatment, reload with saved treatment data and mobile layout.",
  );
} finally {
  await browser.close();
}
