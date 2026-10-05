// Browser integration against the real migrations in disposable PostgreSQL (PGlite).
// HTTP is intercepted locally; no production account or data is touched.
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const O = "20000000-0000-0000-0000-000000000001",
  E = "20000000-0000-0000-0000-000000000002",
  F = "20000000-0000-0000-0000-000000000003",
  A = "20000000-0000-0000-0000-000000000004";
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${O}','owner@test.invalid',now()),('${E}','employee@test.invalid',now()),('${F}','second@test.invalid',now()),('${A}','admin@test.invalid',now());`,
);
await db.exec(
  readFileSync("supabase/migrations/001_heimfriseur.sql", "utf8").replace(
    "create extension if not exists pgcrypto;",
    "",
  ),
);
await db.exec(readFileSync("supabase/migrations/002_team.sql", "utf8"));
await db.exec(
  readFileSync("supabase/migrations/003_practical_workflow.sql", "utf8"),
);
await db.exec(readFileSync("supabase/migrations/004_app_admin.sql", "utf8"));
await db.exec(
  readFileSync("supabase/migrations/005_clear_workflows.sql", "utf8"),
);
await db.exec(readFileSync("supabase/migrations/006_workday.sql", "utf8"));
await db.exec(
  readFileSync(
    "supabase/migrations/007_employee_financial_privacy.sql",
    "utf8",
  ),
);
await q("select bootstrap_app_admin('admin@test.invalid')");
await q("update app_admins set onboarding_completed=true where user_id=$1", [
  A,
]);
await q("select set_config('request.jwt.claim.sub',$1,false)", [O]);
await q("select initialize_account()");
const facility = (
  await q(
    "insert into facilities(user_id,name,notes) values($1,'Browser-Testheim','Vertraulich') returning id",
    [O],
  )
)[0].id;
const group = (
  await q(
    "insert into groups(user_id,facility_id,name) values($1,$2,'Station Test') returning id",
    [O, facility],
  )
)[0].id;
const service = (
  await q(
    "select id from services where user_id=$1 and name='Herrenhaarschnitt'",
    [O],
  )
)[0].id;
for (const name of ["Test Eins", "Test Zwei"])
  await q("select save_customer($1::jsonb,$2::uuid[])", [
    JSON.stringify({
      facility_id: facility,
      group_id: group,
      first_name: name.split(" ")[0],
      last_name: name.split(" ")[1],
    }),
    [service],
  ]);
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
}).format(new Date());
const visit = (
  await q("select plan_visit($1,$2::date,'09:00',5,true) id", [group, date])
)[0].id;
for (const [id, email, name] of [
  [E, "employee@test.invalid", "Erika Test"],
  [F, "second@test.invalid", "Frida Test"],
]) {
  await q("select set_config('request.jwt.claim.sub',$1,false)", [O]);
  const invite = (await q("select create_team_invite($1) v", [email]))[0].v;
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await q("select accept_team_invite($1,$2)", [invite.token, name]);
}
await q("select set_config('request.jwt.claim.sub',$1,false)", [O]);
await q("select assign_visit($1,$2::uuid[],$3::uuid)", [visit, [E, F], E]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
let queue = Promise.resolve();
let failSave = false,
  failAll = false,
  delaySave = 0;
const errors = [];
async function pageFor(actor, email, setupCompleted = true) {
  await db.exec("reset role");
  await q(
    "update business_memberships set onboarding_completed=true,setup_completed=$2 where user_id=$1",
    [actor, setupCompleted],
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token =
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({ sub: actor, exp, role: "authenticated" }),
    ).toString("base64url") +
    ".fake";
  await context.addInitScript(
    ({ token, actor, email, exp }) => {
      localStorage.setItem(
        "sb-bvqysdiofglgxqtydeko-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test",
          expires_in: 3600,
          expires_at: exp,
          token_type: "bearer",
          user: {
            id: actor,
            email,
            role: "authenticated",
            aud: "authenticated",
          },
        }),
      );
    },
    { token, actor, email, exp },
  );
  await context.route(
    "https://bvqysdiofglgxqtydeko.supabase.co/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const body = request.postDataJSON();
      if (url.pathname.includes("/auth/v1/")) {
        await route.fulfill({ json: { id: actor, email } });
        return;
      }
      if (failAll || (failSave && url.pathname.endsWith("/save_treatment"))) {
        await route.abort("failed");
        return;
      }
      if (delaySave && url.pathname.endsWith("/save_treatment"))
        await new Promise((r) => setTimeout(r, delaySave));
      const work = queue.then(async () => {
        await db.exec("reset role");
        await q(
          "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",
          [
            actor,
            JSON.stringify({ sub: actor }),
            JSON.stringify(request.headers()),
          ],
        );
        await db.exec("set role authenticated");
        try {
          if (url.pathname.includes("/rpc/")) {
            const name = url.pathname.split("/").at(-1);
            assert.match(name, /^[a-z_]+$/);
            const keys = Object.keys(body || {});
            keys.forEach((k) => assert.match(k, /^p_[a-z_]+$/));
            const args = keys.map((k) =>
              typeof body[k] === "object" &&
              !Array.isArray(body[k]) &&
              body[k] !== null
                ? JSON.stringify(body[k])
                : body[k],
            );
            const result = await q(
              `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) value`,
              args,
            );
            await route.fulfill({ json: result[0].value });
          } else {
            const table = url.pathname.split("/").at(-1);
            assert.match(table, /^[a-z_]+$/);
            if (request.method() === "PATCH") {
              const keys = Object.keys(body);
              keys.forEach((k) => assert.match(k, /^[a-z_]+$/));
              const id = url.searchParams.get("id")?.replace(/^eq\./, "");
              const owner = url.searchParams
                .get("user_id")
                ?.replace(/^eq\./, "");
              assert.ok(id && owner);
              if (actor === A) assert.equal(body.user_id, O);
              const values = keys.map((k) => body[k]);
              const saved = await q(
                `update public.${table} set ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")} where id=$${keys.length + 1} and user_id=$${keys.length + 2} returning id`,
                [...values, id, owner],
              );
              await route.fulfill({ json: saved[0] });
              return;
            }
            assert.equal(request.method(), "GET");
            const rows = await q(`select * from public.${table} order by id`);
            await route.fulfill({
              json: rows.map((row) =>
                Object.fromEntries(
                  Object.entries(row).map(([key, value]) => [
                    key,
                    value instanceof Date &&
                    [
                      "appointment_date",
                      "next_due_date",
                      "anchor_date",
                      "formula_date",
                      "followup_date",
                    ].includes(key)
                      ? value.toISOString().slice(0, 10)
                      : value,
                  ]),
                ),
              ),
            });
          }
        } catch (e) {
          await route.fulfill({
            status: 400,
            json: { code: e.code || "P0001", message: e.message },
          });
        }
      });
      queue = work.catch(() => {});
      await work;
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.APP_URL || "http://localhost:5173");
  await page
    .getByRole("heading", {
      name: setupCompleted ? /Guten Tag/ : "Dein Unternehmen einrichten",
      exact: false,
    })
    .waitFor();
  return page;
}
try {
  const employee = await pageFor(E, "employee@test.invalid");
  assert.equal(await employee.getByText("DEIN MONAT IM BLICK").count(), 0);
  assert.equal(await employee.locator(".bottom-nav a").count(), 4);
  await employee
    .getByRole("heading", { name: "Mein Arbeitstag", exact: true })
    .waitFor();
  await employee
    .getByRole("button", { name: "Nächsten Kunden starten", exact: true })
    .click();
  await employee.getByRole("timer").waitFor();
  assert.equal(await employee.getByLabel("Manueller Endpreis (€)").count(), 0);
  if (process.env.QA_SCREENSHOT_DIR)
    await employee.screenshot({
      path: process.env.QA_SCREENSHOT_DIR + "/team-treatment-mobile.png",
      fullPage: true,
    });
  const material = employee.getByLabel("Materialkosten (€)", { exact: true });
  await material.fill("3,50");
  await employee
    .getByText("Alle Änderungen gespeichert", { exact: true })
    .waitFor();
  await employee.reload();
  await employee.getByRole("timer").waitFor();
  assert.equal(await material.inputValue(), "3.5");
  // A newer edit during a slow request must not be marked as saved prematurely.
  delaySave = 1400;
  await material.fill("4");
  await employee
    .locator('p[role="status"]')
    .filter({ hasText: "Wird gespeichert …" })
    .waitFor();
  await material.fill("5");
  await employee
    .getByText("Alle Änderungen gespeichert", { exact: true })
    .waitFor();
  delaySave = 0;
  await employee.reload();
  await employee.getByRole("timer").waitFor();
  assert.equal(await material.inputValue(), "5");
  // Failed saves keep the draft and stop navigation; retry recovers it.
  failSave = true;
  await material.fill("6,20");
  await employee
    .locator(".treatment-costs")
    .getByText(/Keine Verbindung/)
    .waitFor();
  failAll = true;
  await employee.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await employee.locator(".toast.error").waitFor();
  assert.equal(
    await material.inputValue(),
    "6,20",
    "A failed refresh keeps the treatment draft",
  );
  await employee.locator('.bottom-nav a[href="#calendar"]').click();
  await employee.waitForURL(/#treatment\//);
  await employee.getByRole("timer").waitFor();
  assert.equal(await material.inputValue(), "6,20");
  failSave = false;
  failAll = false;
  await employee
    .getByRole("button", { name: "Zwischenstand speichern", exact: true })
    .click();
  await employee
    .getByText("Zwischenstand gespeichert", { exact: true })
    .waitFor();
  await employee
    .getByRole("button", { name: "Behandlung beenden", exact: true })
    .click();
  await employee.getByRole("heading", { name: "Kundenliste" }).waitFor();
  await employee
    .getByRole("button", { name: "Später erfassen", exact: true })
    .click();
  assert.equal(
    await employee
      .locator(".visit-customer.is-done .visit-customer-meta strong")
      .count(),
    0,
    "Completed client amounts are private",
  );
  assert.equal(
    await employee
      .getByText(/Aktueller Umsatz|Geplanter Umsatz|Umsatz nach Material/)
      .count(),
    0,
  );
  await employee.locator(".visit-customer.is-done .name-link").first().click();
  await employee
    .getByRole("heading", { name: "Behandlungshistorie", exact: true })
    .waitFor();
  assert.doesNotMatch(
    await employee
      .locator("section.panel")
      .filter({
        has: employee.getByRole("heading", {
          name: "Behandlungshistorie",
          exact: true,
        }),
      })
      .innerText(),
    /€|Material:/,
    "Historical finances must not appear for employees",
  );
  await employee.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#visit/" + visit,
  );
  await employee.getByRole("heading", { name: "Kundenliste" }).waitFor();
  const second = await pageFor(F, "second@test.invalid");
  await second
    .getByRole("button", { name: "Besuch öffnen", exact: true })
    .click();
  assert.equal(
    await second
      .getByRole("button", { name: "Besuch abschließen", exact: true })
      .count(),
    0,
  );
  await second.getByRole("button", { name: "Start", exact: true }).click();
  await second.getByRole("timer").waitFor();
  await second
    .getByRole("button", { name: "Behandlung beenden", exact: true })
    .click();
  await second.getByRole("heading", { name: "Kundenliste" }).waitFor();
  await second
    .getByRole("button", { name: "Später erfassen", exact: true })
    .click();
  await employee.reload();
  await employee
    .getByRole("button", { name: "Besuch abschließen", exact: true })
    .click();
  await employee
    .getByRole("button", { name: "Besuch endgültig abschließen", exact: true })
    .click();
  await employee.getByText("Besuch abgeschlossen", { exact: true }).waitFor();
  assert.equal(
    await employee.getByRole("button", { name: "PDF herunterladen" }).count(),
    0,
  );
  const owner = await pageFor(O, "owner@test.invalid");
  await owner.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#visit/" + visit,
  );
  await owner.getByRole("button", { name: "PDF herunterladen" }).waitFor();
  const download = owner.waitForEvent("download");
  await owner.getByRole("button", { name: "PDF herunterladen" }).click();
  assert.match((await download).suggestedFilename(), /\.pdf$/);
  await owner.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#settings",
  );
  await owner.getByRole("button", { name: "Team", exact: true }).click();
  await owner
    .getByRole("heading", { name: "Dein Team", exact: true })
    .waitFor();
  await owner
    .getByRole("button", { name: "Berechtigungen", exact: true })
    .first()
    .click();
  await owner
    .getByRole("button", { name: "Vorlage: Nur behandeln", exact: true })
    .click();
  assert.equal(
    await owner
      .getByRole("checkbox", {
        name: "Zugewiesene Termine planen und verschieben",
        exact: true,
      })
      .isChecked(),
    false,
  );
  await owner
    .getByRole("button", {
      name: "Vorlage: Behandeln und Termine planen",
      exact: true,
    })
    .click();
  assert.equal(
    await owner
      .getByRole("checkbox", {
        name: "Zugewiesene Termine planen und verschieben",
        exact: true,
      })
      .isChecked(),
    true,
  );
  await owner
    .getByRole("checkbox", {
      name: "Zugewiesene Termine planen und verschieben",
      exact: true,
    })
    .uncheck();
  await owner
    .getByRole("checkbox", {
      name: "Kundendaten und Kundenrhythmus ändern",
      exact: true,
    })
    .check();
  await owner
    .getByRole("button", { name: "Berechtigungen speichern", exact: true })
    .click();
  await owner.getByRole("dialog").waitFor({ state: "hidden" });
  await db.exec("reset role");
  assert.equal(
    (
      await q("select permissions from business_memberships where user_id=$1", [
        E,
      ])
    )[0].permissions.edit_customers,
    true,
  );
  await owner
    .getByRole("button", { name: "Zugang deaktivieren", exact: true })
    .first()
    .click();
  await owner.getByRole("button", { name: "Bestätigen", exact: true }).click();
  await employee.reload();
  await employee
    .getByRole("heading", { name: "Unternehmenszugang nicht verfügbar" })
    .waitFor();
  const admin = await pageFor(A, "admin@test.invalid");
  assert.equal(await admin.locator(".app-admin-panel").count(), 0);
  await db.exec("reset role");
  const business = (
    await q("select id from businesses where owner_user_id=$1", [O])
  )[0].id;
  assert.equal(
    await admin.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("heimfriseur-admin-business"))
          .businessId,
    ),
    business,
  );
  await admin.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#facility/" + facility,
  );
  await admin
    .getByRole("button", { name: "Bearbeiten", exact: true })
    .first()
    .click();
  await admin
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Vom App-Admin geändert");
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await admin
    .getByRole("heading", { name: "Vom App-Admin geändert", exact: true })
    .waitFor();
  await db.exec("reset role");
  assert.equal(
    (await q("select user_id from facilities where id=$1", [facility]))[0]
      .user_id,
    O,
  );
  await admin.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#settings/App-Admin",
  );
  await admin
    .getByRole("button", {
      name: "App-Admin hinzufügen / aktivieren",
      exact: true,
    })
    .waitFor();
  await admin
    .getByLabel("Bestätigte Konto-E-Mail *", { exact: true })
    .fill("second@test.invalid");
  await admin
    .getByRole("button", {
      name: "App-Admin hinzufügen / aktivieren",
      exact: true,
    })
    .click();
  await admin.getByText("second@test.invalid", { exact: true }).waitFor();
  const setupOwner = await pageFor(O, "owner@test.invalid", false);
  await setupOwner
    .getByLabel("Firmenname", { exact: true })
    .fill("Fiktiver Salon");
  await setupOwner
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await setupOwner
    .getByRole("heading", { name: "Heime", exact: true })
    .waitFor();
  await setupOwner
    .getByRole("button", { name: "5. Preise", exact: true })
    .click();
  await setupOwner
    .getByRole("button", { name: "Einrichtung abschließen", exact: true })
    .click();
  await setupOwner.getByRole("heading", { name: /Guten Tag/ }).waitFor();
  await db.exec("reset role");
  assert.equal(
    (
      await q(
        "select setup_completed from business_memberships where user_id=$1",
        [O],
      )
    )[0].setup_completed,
    true,
  );
  await setupOwner.goto(
    (process.env.APP_URL || "http://localhost:5173") + "/#settings/Team",
  );
  assert.equal(
    await setupOwner
      .getByRole("heading", { name: "Änderungsprotokoll", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await setupOwner
      .getByRole("button", { name: "App-Admin", exact: true })
      .count(),
    0,
  );
  for (const page of [employee, second, owner, admin])
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Mobile overflow",
    );
  assert.deepEqual(errors, []);
  console.log(
    "Team browser passed: employee navigation, shared workflow, autosave/reload/in-flight edits/network failure, responsible close, owner PDF, immediate revocation, global administrator selection, safe owner-scoped editing and admin grant.",
  );
} finally {
  await browser.close();
  await db.close();
}
