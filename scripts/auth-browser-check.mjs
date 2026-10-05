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
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let signup = 0,
  resend = 0,
  authorize = null;
await context.route(
  "https://bvqysdiofglgxqtydeko.supabase.co/auth/v1/**",
  async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith("/signup")) {
      signup++;
      const body = route.request().postDataJSON();
      assert.equal(body.code_challenge_method, "s256");
      assert.ok(body.code_challenge);
      await route.fulfill({
        status: 500,
        json: {
          code: "unexpected_failure",
          msg: "Error sending confirmation email",
        },
      });
      return;
    }
    if (u.pathname.endsWith("/resend")) {
      resend++;
      assert.equal(route.request().postDataJSON().type, "signup");
      await route.fulfill({ json: {} });
      return;
    }
    if (u.pathname.endsWith("/authorize")) {
      authorize = u;
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Google-Anmeldung angefordert</h1>",
      });
      return;
    }
    if (u.pathname.endsWith("/logout")) {
      await route.fulfill({ json: {} });
      return;
    }
    throw Error("Unexpected auth request " + u.pathname);
  },
);
try {
  const response = await page.goto(base);
  const headers = response.headers();
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(headers["content-security-policy"], /object-src 'none'/);
  assert.doesNotMatch(headers["content-security-policy"], /'unsafe-eval'/);
  assert.equal(headers["referrer-policy"], "no-referrer");
  await page.goto(
    base + "/?error=access_denied&error_description=private_fixture_detail",
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Google-Anmeldung wurde abgebrochen" })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /private_fixture_detail/,
  );
  assert.equal(new URL(page.url()).searchParams.has("error"), false);
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: /^E-Mail/ })
    .fill("fixture@test.invalid");
  await page
    .getByLabel("Passwort *", { exact: true })
    .fill("SicheresTestPasswort123!");
  await page.getByRole("button", { name: "Registrieren", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Bestätigungsmail konnte nicht versendet" })
    .waitFor();
  assert.equal(signup, 1);
  await page
    .getByRole("button", { name: "Bestätigung erneut senden", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: /^E-Mail/ })
    .fill("fixture@test.invalid");
  await page
    .getByRole("button", { name: "Bestätigung erneut senden", exact: true })
    .click();
  await page
    .getByText(
      "Falls eine Bestätigung aussteht, wurde der Versand angefordert. Bitte Postfach und Spam prüfen.",
      { exact: true },
    )
    .waitFor();
  assert.equal(resend, 1);
  assert.equal(
    await page
      .getByRole("button", { name: "Bitte kurz warten …", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Zur Anmeldung", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mit Google anmelden", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Google-Anmeldung angefordert" })
    .waitFor();
  assert.equal(authorize.searchParams.get("provider"), "google");
  assert.equal(authorize.searchParams.get("redirect_to"), base + "/");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
  assert.ok(authorize.searchParams.get("code_challenge"));
  assert.equal(authorize.searchParams.get("scopes"), "openid email profile");
  // Existing enrolled accounts must complete MFA before any business RPC.
  const mfaContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    mfaPage = await mfaContext.newPage();
  const actor = "80000000-0000-0000-0000-000000000001",
    factor = "80000000-0000-0000-0000-000000000002";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: actor,
    email: "fixture@test.invalid",
    email_confirmed_at: new Date().toISOString(),
    factors: [
      {
        id: factor,
        factor_type: "totp",
        status: "verified",
        friendly_name: "Test",
      },
    ],
  };
  const token = (aal) =>
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({ sub: actor, exp, role: "authenticated", aal }),
    ).toString("base64url") +
    ".fake";
  await mfaContext.addInitScript(
    (session) =>
      localStorage.setItem(
        "sb-bvqysdiofglgxqtydeko-auth-token",
        JSON.stringify(session),
      ),
    {
      access_token: token("aal1"),
      refresh_token: "fake",
      expires_at: exp,
      expires_in: 3600,
      token_type: "bearer",
      user,
    },
  );
  let verified = false,
    businessRequests = 0;
  const mfaRoute = async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith("/user")) {
      await route.fulfill({ json: user });
      return;
    }
    if (
      u.pathname.endsWith("/factors") &&
      route.request().method() === "POST"
    ) {
      await route.fulfill({
        json: {
          id: factor,
          type: "totp",
          totp: {
            qr_code:
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>',
            secret: "FIXTURESECRET",
            uri: "otpauth://totp/fixture?secret=FIXTURESECRET",
          },
        },
      });
      return;
    }
    if (u.pathname.endsWith("/challenge")) {
      await route.fulfill({ json: { id: factor, expires_at: exp } });
      return;
    }
    if (u.pathname.endsWith("/verify")) {
      assert.equal(route.request().postDataJSON().code, "123456");
      verified = true;
      user.factors = [
        {
          id: factor,
          factor_type: "totp",
          status: "verified",
          friendly_name: "Test",
        },
      ];
      await route.fulfill({
        json: {
          access_token: token("aal2"),
          refresh_token: "fake2",
          expires_at: exp,
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      });
      return;
    }
    if (u.pathname.includes("/rpc/")) {
      assert.ok(verified, "Business data must not be fetched before MFA");
      businessRequests++;
      const rpc = u.pathname.split("/").at(-1);
      if (rpc === "initialize_account") {
        await route.fulfill({ json: null });
        return;
      }
      if (rpc === "get_app_admin_context") {
        await route.fulfill({ json: { is_admin: false } });
        return;
      }
      if (rpc === "get_team_context") {
        await route.fulfill({
          json: {
            business: { id: actor, name: "Test", owner_user_id: actor },
            membership: {
              id: actor,
              user_id: actor,
              business_id: actor,
              role: "employee",
              is_active: true,
              display_name: "Test",
              onboarding_completed: true,
              setup_completed: true,
            },
            members: [],
            assignments: [],
            invitations: [],
            audit: [],
          },
        });
        return;
      }
      if (rpc === "employee_snapshot") {
        const tables = [
          "profiles",
          "facilities",
          "groups",
          "customers",
          "services",
          "customer_default_services",
          "appointments",
          "appointment_customers",
          "treatments",
          "treatment_services",
          "color_formulas",
          "cohorts",
          "facility_service_prices",
          "payment_methods",
          "customer_billing",
          "treatment_payments",
          "feedback",
        ];
        await route.fulfill({
          json: Object.fromEntries(tables.map((t) => [t, []])),
        });
        return;
      }
    }
    throw Error("Unexpected MFA request " + u.pathname);
  };
  await mfaContext.route(
    "https://bvqysdiofglgxqtydeko.supabase.co/**",
    mfaRoute,
  );
  await mfaPage.goto(base);
  await mfaPage
    .getByRole("heading", { name: "Zwei-Faktor-Anmeldung", exact: true })
    .waitFor();
  assert.equal(businessRequests, 0);
  assert.equal(await mfaPage.locator(".bottom-nav").count(), 0);
  await mfaPage
    .getByLabel("Sechsstelliger Code", { exact: true })
    .fill("123456");
  await mfaPage
    .getByRole("button", { name: "Code bestätigen", exact: true })
    .click();
  try {
    await mfaPage
      .getByRole("heading", { name: "Mein Arbeitstag", exact: true })
      .waitFor();
  } catch (error) {
    console.log({
      verified,
      businessRequests,
      body: await mfaPage.locator("body").innerText(),
    });
    throw error;
  }
  assert.ok(businessRequests > 0);
  await mfaContext.close();
  user.factors = [];
  verified = true;
  const enrollContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await enrollContext.addInitScript(
    (session) =>
      localStorage.setItem(
        "sb-bvqysdiofglgxqtydeko-auth-token",
        JSON.stringify(session),
      ),
    {
      access_token: token("aal1"),
      refresh_token: "fake",
      expires_at: exp,
      expires_in: 3600,
      token_type: "bearer",
      user,
    },
  );
  await enrollContext.route(
    "https://bvqysdiofglgxqtydeko.supabase.co/**",
    mfaRoute,
  );
  const enrollPage = await enrollContext.newPage();
  await enrollPage.goto(base + "/#settings");
  await enrollPage
    .getByRole("button", { name: "Zwei-Faktor-Schutz einrichten", exact: true })
    .click();
  await enrollPage
    .getByRole("button", { name: "Authenticator verbinden", exact: true })
    .click();
  await enrollPage
    .getByAltText("QR-Code für die Authenticator-Einrichtung", { exact: true })
    .waitFor();
  await enrollPage
    .getByLabel("Sechsstelliger Code", { exact: true })
    .fill("123456");
  await enrollPage
    .getByRole("button", { name: "Code bestätigen", exact: true })
    .click();
  await enrollPage
    .getByText(
      "Zwei-Faktor-Schutz ist eingerichtet. Beim nächsten Anmelden wird ein Code benötigt.",
      { exact: true },
    )
    .waitFor();
  await enrollContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "Auth browser passed: SMTP failure, resend cooldown, Google OAuth PKCE request, MFA gate/challenge and security headers. Real Google/SMTP configuration requires operator setup.",
  );
} finally {
  await browser.close();
}
