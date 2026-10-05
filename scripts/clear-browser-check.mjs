import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  base = process.env.APP_URL || "http://localhost:4173",
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("heimfriseur-demo")));
try {
  await page.goto(base);
  const password = page.getByLabel("Passwort *", { exact: true });
  await password.pressSequentially("Fiktiv7");
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(await page.locator(".password-recent").textContent(), "7");
  await page.waitForTimeout(900);
  assert.equal(await page.locator(".password-recent").count(), 0);
  await page
    .getByRole("button", { name: "Passwort anzeigen", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "text");
  await page
    .getByRole("button", { name: "Passwort verbergen", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "password");
  await page
    .getByRole("button", { name: /^(Mit )?Beispieldaten ausprobieren$/ })
    .click();
  await page.getByRole("heading", { name: "Guten Tag, Anna." }).waitFor();
  await page
    .getByRole("button", { name: "Termin hinzufügen", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Einrichtung", { exact: true }).selectOption("f1");
  await dialog.getByLabel("Gruppe", { exact: true }).selectOption("g1");
  await dialog
    .getByLabel("Kunde (optional)", { exact: true })
    .selectOption("c1");
  await dialog.getByLabel("Datum", { exact: true }).fill("06.10.2027");
  const time = dialog.getByLabel("Uhrzeit (HHMM oder HH:MM)");
  assert.equal(await time.getAttribute("type"), "text");
  assert.equal(await time.getAttribute("inputmode"), "numeric");
  await time.fill("1030");
  await dialog
    .getByRole("button", { name: "Besuch planen", exact: true })
    .click();
  await page.getByRole("button", { name: "Start", exact: true }).waitFor();
  const d = await read(),
    a = d.appointments.find((x) => x.appointment_date === "2027-10-06");
  assert.equal(a.start_time, "10:30");
  assert.equal(a.recurrence_weeks, null);
  assert.deepEqual(
    d.appointment_customers
      .filter((x) => x.appointment_id === a.id)
      .map((x) => x.customer_id),
    ["c1"],
  );
  await page.goto(base + "/#facility/f1");
  await page.getByRole("button", { name: "Gruppen", exact: true }).click();
  await page
    .getByRole("button", { name: "Untergruppe hinzufügen", exact: true })
    .click();
  await page.getByLabel("Name der Runde").fill("Wochenrunde");
  await page
    .getByRole("dialog")
    .getByLabel("Wohnbereich", { exact: true })
    .selectOption("g1");
  await page
    .getByRole("button", { name: "Untergruppe speichern", exact: true })
    .click();
  await page.getByText("Wochenrunde", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Kunden zuordnen", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Hans Schneider/ }).check();
  await page
    .getByRole("button", { name: "Zuordnung speichern", exact: true })
    .click();
  await page.getByText("Kundengruppe gespeichert", { exact: true }).waitFor();
  const assigned = await read();
  assert.equal(
    assigned.customers.find((c) => c.id === "c1").cohort_id,
    assigned.cohorts.find((c) => c.name === "Wochenrunde").id,
  );
  await page.goto(base + "/#settings/services");
  await page.getByLabel("Heim für die Preisliste").selectOption("f2");
  await page.getByLabel("Herrenhaarschnitt (€)", { exact: true }).fill("24");
  await page
    .getByRole("button", { name: "Preisliste speichern", exact: true })
    .click();
  await page.getByText("Preisliste gespeichert", { exact: true }).waitFor();
  await page.getByLabel("Heim für die Preisliste").selectOption("f1");
  await page.getByLabel("Herrenhaarschnitt (€)", { exact: true }).fill("35");
  await page
    .getByRole("button", { name: "Preisliste speichern", exact: true })
    .click();
  await page.getByText("Preisliste gespeichert", { exact: true }).waitFor();
  const prices = await read();
  assert.equal(
    prices.facility_service_prices.find(
      (p) => p.facility_id === "f2" && p.service_id === "s1",
    ).price,
    24,
  );
  await page.goto(base + "/#setup");
  await page
    .getByRole("heading", { name: "Dein Unternehmen einrichten" })
    .waitFor();
  await page.getByRole("button", { name: "2. Heime", exact: true }).click();
  assert.ok(
    await page
      .getByRole("button", { name: /Seniorenheim Sonnengarten · Bearbeiten/ })
      .count(),
  );
  await page.getByRole("button", { name: "Später weiter einrichten" }).click();
  await page.getByRole("heading", { name: "Guten Tag, Anna." }).waitFor();
  await page.goto(base + "/#reports");
  await page.locator(".cost-chart svg").waitFor();
  assert.equal(
    await page.locator(".cost-chart svg").getAttribute("role"),
    "img",
  );
  const help = await page
    .getByRole("button", { name: "Hilfe & Feedback", exact: true })
    .boundingBox();
  assert.ok(help.width <= 48 && help.width >= 44);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "V5 browser passed: masked password preview, numeric date/time, exact single-customer scheduling, direct cohort assignment, independent facility prices, repeatable setup, material chart and small help button.",
  );
} finally {
  await browser.close();
}
