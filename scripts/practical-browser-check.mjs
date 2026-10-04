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
const base = process.env.APP_URL || "http://localhost:5173";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("heimfriseur-demo")));
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: /^(Mit )?Beispieldaten ausprobieren$/ })
    .click();
  await page.getByRole("heading", { name: "Guten Tag, Anna." }).waitFor();
  await page.goto(base + "/#facility/f1");
  await page
    .getByRole("button", { name: "Preise & Runden", exact: true })
    .click();
  const price = page.getByLabel(/Herrenhaarschnitt · Standard/);
  await price.fill("24,50");
  await price
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Preis speichern" })
    .click();
  await page.getByText("Heimpreis gespeichert", { exact: true }).waitFor();
  assert.equal((await read()).facility_service_prices[0].price, 24.5);
  await page.getByRole("button", { name: "Untergruppe hinzufügen" }).click();
  await page.getByLabel("Name der Runde").fill("Test-Runde A");
  await page
    .getByRole("dialog")
    .getByLabel("Wohnbereich", { exact: true })
    .selectOption("g1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Untergruppe speichern", exact: true })
    .click();
  await page.getByText("Test-Runde A", { exact: true }).waitFor();
  await page.goto(base + "/#customers");
  await page.getByRole("button", { name: "Kunde", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await page.getByText("Name noch offen", { exact: true }).waitFor();
  assert.ok(
    (await read()).customers.some(
      (c) => !c.first_name && !c.last_name && c.group_id,
    ),
  );
  await page.goto(base + "/#customers");
  await page.getByRole("button", { name: "Kunde", exact: true }).click();
  await page
    .getByRole("button", { name: "Kundenangaben aus Foto übernehmen" })
    .click();
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 700;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 1600, 700);
    x.fillStyle = "black";
    x.font = "48px Arial";
    [
      "Informationen und Auftrag zum Friseur",
      "Bewohner: Beispiel, Erika",
      "Zimmer: 104",
      "Friseur gewünscht: Ja",
    ].forEach((line, i) => x.fillText(line, 60, 110 + i * 130));
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "fiktives-testformular.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("button", { name: "Angaben erkennen", exact: true })
    .click();
  const photoDialog = page.getByRole("dialog").last();
  await photoDialog.getByLabel("Vorname", { exact: true }).waitFor();
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("input")).some(
          (i) => i.value === "Erika",
        ),
      {},
      { timeout: 90000 },
    )
    .catch(async (error) => {
      console.error(await photoDialog.innerText());
      throw error;
    });
  assert.equal(
    await photoDialog.getByLabel("Nachname", { exact: true }).inputValue(),
    "Beispiel",
  );
  assert.equal(
    await photoDialog
      .getByLabel("Zimmer- / Raumnummer", { exact: true })
      .inputValue(),
    "104",
  );
  await photoDialog.getByRole("button", { name: /Geprüfte Angaben/ }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Einrichtung", { exact: true }).selectOption("f1");
  await form.getByLabel("Wohnbereich", { exact: true }).selectOption("g1");
  await form
    .getByLabel("Untergruppe / Besuchsrunde")
    .selectOption(
      (await read()).cohorts.find((c) => c.name === "Test-Runde A").id,
    );
  await form.getByLabel("Kundenrhythmus").selectOption("3");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.getByText("Erika Beispiel", { exact: true }).waitFor();
  const c = (await read()).customers.find((c) => c.last_name === "Beispiel");
  assert.equal(c.recurrence_weeks, 3);
  assert.ok(c.cohort_id);
  assert.equal(c.hair_request, "Ja");
  await page
    .getByRole("button", { name: "Hilfe & Feedback", exact: true })
    .click();
  await page.getByRole("button", { name: "Einführung ansehen" }).click();
  await page
    .getByRole("heading", { name: "Willkommen bei HeimFriseur" })
    .waitFor();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: "Einführung schließen" }).click();
  await page
    .getByRole("button", { name: "Hilfe & Feedback", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Fehler oder Verbesserung melden",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: /Was ist passiert/ })
    .fill("Fiktive Testmeldung: Formular überprüft.");
  await page
    .getByRole("button", { name: "Rückmeldung speichern", exact: true })
    .click();
  await page
    .getByText("Rückmeldung beim Geschäftsführer gespeichert", { exact: true })
    .waitFor();
  assert.equal((await read()).feedback.length, 1);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Practical browser passed: facility pricing, editable subgroup, unknown customer, actual local German OCR, editable import, cadence, repeatable introduction, scoped feedback, mobile layout.",
  );
} finally {
  await browser.close();
}
