import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const url = process.env.FIREBASE_APP_URL || "http://localhost:5174";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(url);
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .click();
  const email = `firebase-browser-${Date.now()}@test.invalid`;
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("BrowserTestPasswort2026!");
  await page.getByRole("button", { name: "Registrieren", exact: true }).click();
  await page
    .getByRole("heading", { name: "E-Mail bestätigen", exact: true })
    .waitFor();
  let codes;
  for (let n = 0; n < 30; n++) {
    codes = await (
      await fetch(
        "http://127.0.0.1:9099/emulator/v1/projects/demo-heimfriseur/oobCodes",
      )
    ).json();
    if (codes.oobCodes?.some((c) => c.email === email)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const code = codes.oobCodes.find(
    (c) => c.email === email && c.requestType === "VERIFY_EMAIL",
  );
  if (!code) throw Error("Verification email was not sent by Auth emulator");
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oobCode: code.oobCode }),
    },
  );
  if (!response.ok) throw Error("Verification failed");
  await page
    .getByRole("button", {
      name: "Ich habe meine E-Mail bestätigt",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: /Guten/ }).waitFor();
  await page.screenshot({
    path: "/tmp/heim-firebase-dashboard.png",
    fullPage: true,
  });
  if (
    await page.locator("body").evaluate((b) => b.scrollWidth > innerWidth + 1)
  )
    throw Error("Mobile horizontal overflow");
  const session = await page.evaluate(async () => {
    const m = await import("/src/firebaseClient.ts");
    return {
      uid: m.firebaseAuth.currentUser.uid,
      token: await m.firebaseAuth.currentUser.getIdToken(),
    };
  });
  const raw = await (
    await fetch(
      `http://127.0.0.1:8080/v1/projects/demo-heimfriseur/databases/(default)/documents/hf_businesses/${session.uid}`,
      { headers: { authorization: `Bearer ${session.token}` } },
    )
  ).json();
  if (raw.fields?.owner_email?.stringValue !== email)
    throw Error("No real Firestore business created");
  await page.reload();
  await page.getByRole("heading", { name: /Guten/ }).waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: mobile Firebase registration, genuine emulated verification email, owner initialization, persistence after reload, no overflow",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/heim-firebase-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  console.error(errors);
  throw e;
} finally {
  await browser.close();
}
