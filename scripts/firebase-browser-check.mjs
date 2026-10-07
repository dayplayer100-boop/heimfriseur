import { chromium } from "playwright";
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
  // Admin fixture is written only to the local demo emulator, never production.
  if (
    await page
      .getByRole("heading", { name: "Benutzer & Rollen", exact: true })
      .count()
  )
    throw Error("Director received administrator UI");
  async function seed(path, fields) {
    const r = await fetch(
      `http://127.0.0.1:8080/v1/projects/demo-heimfriseur/databases/(default)/documents/${path}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer owner",
          "content-type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );
    if (!r.ok) throw Error(`Emulator fixture failed: ${r.status}`);
  }
  await seed(`hf_admins/${session.uid}`, {
    email: { stringValue: email },
    is_active: { booleanValue: true },
  });
  await seed("hf_users/browser-colleague", {
    uid: { stringValue: "browser-colleague" },
    email: { stringValue: "colleague@test.invalid" },
    display_name: { stringValue: "Browser Kollegin" },
    updated_at: { stringValue: new Date().toISOString() },
  });
  await seed("hf_accounts/browser-colleague", {
    business_id: { stringValue: session.uid },
  });
  await page.evaluate(() =>
    sessionStorage.setItem("heimfriseur-invite", "stale-employee-invite"),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Benutzer & Rollen", exact: true })
    .waitFor();
  await page
    .getByText("Browser Kollegin", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "Rolle ändern", exact: true })
    .click();
  await page.getByLabel("Neue Rolle").selectOption("admin");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Rolle speichern", exact: true })
    .click();
  await page
    .getByText("Rolle gespeichert. Die Person muss ihre App neu laden.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByText("Browser Kollegin", { exact: true })
    .locator("..")
    .getByText("Admin ·", { exact: false })
    .waitFor();
  await page.screenshot({
    path: "/tmp/heim-firebase-admin.png",
    fullPage: true,
  });
  if (
    await page.locator("body").evaluate((b) => b.scrollWidth > innerWidth + 1)
  )
    throw Error("Admin mobile horizontal overflow");
  await page.getByLabel("Unternehmen verwalten").selectOption(session.uid);
  await page.getByRole("heading", { name: /Guten/ }).waitFor();
  await page.goto(url + "/#settings");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  const inviteEmail = `invited-${Date.now()}@test.invalid`;
  await page.getByLabel("E-Mail des Mitarbeiters").fill(inviteEmail);
  await page
    .getByRole("button", { name: "Einladungslink erstellen", exact: true })
    .click();
  const inviteField = page.getByLabel("Einladungslink für " + inviteEmail, {
    exact: true,
  });
  await inviteField.waitFor();
  const inviteLink = await inviteField.inputValue();
  if (!new URL(inviteLink).searchParams.get("invite"))
    throw Error("Invitation link missing beside email");
  await page.reload();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  if (
    (await page
      .getByLabel("Einladungslink für " + inviteEmail, { exact: true })
      .inputValue()) !== inviteLink
  )
    throw Error("Invitation link lost after reload");
  if (
    await page.locator("body").evaluate((b) => b.scrollWidth > innerWidth + 1)
  )
    throw Error("Invitation mobile horizontal overflow");
  await page.screenshot({
    path: "/tmp/heim-firebase-invites.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    sessionStorage.removeItem("heimfriseur-admin-business"),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Benutzer & Rollen", exact: true })
    .waitFor();
  // Exercise both providers against Auth emulator, keeping the same UID and admin registry.
  const providerResult = await page.evaluate(
    async ({ email, uid }) => {
      const { firebaseAuth } = await import("/src/firebaseClient.ts");
      const auth = await import("/node_modules/.vite/deps/firebase_auth.js");
      const credential = auth.GoogleAuthProvider.credential(
        JSON.stringify({
          sub: "browser-google-account",
          email,
          email_verified: true,
        }),
      );
      const linked = await auth.linkWithCredential(
        firebaseAuth.currentUser,
        credential,
      );
      await firebaseAuth.signOut();
      const google = await auth.signInWithCredential(firebaseAuth, credential);
      await firebaseAuth.signOut();
      const password = await auth.signInWithEmailAndPassword(
        firebaseAuth,
        email,
        "BrowserTestPasswort2026!",
      );
      return (
        linked.user.uid === uid &&
        google.user.uid === uid &&
        password.user.uid === uid
      );
    },
    { email, uid: session.uid },
  );
  if (!providerResult) throw Error("Provider linking changed the identity");
  await page
    .getByRole("heading", { name: "Benutzer & Rollen", exact: true })
    .waitFor();
  if (await page.evaluate(() => sessionStorage.getItem("heimfriseur-invite")))
    throw Error("Stale invitation still blocks the administrator");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: mobile Firebase registration, genuine emulated verification email, owner initialization, persistence after reload, admin-only user management, actual role save, stale invitation recovery, linked Google/password identity, no overflow",
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
