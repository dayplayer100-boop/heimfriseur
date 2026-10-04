import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const A = "40000000-0000-0000-0000-000000000001",
  O = "40000000-0000-0000-0000-000000000002",
  P = "40000000-0000-0000-0000-000000000003",
  E = "40000000-0000-0000-0000-000000000004";
let b: string,
  c: string,
  facility: string,
  group: string,
  customer: string,
  service: string,
  treatment: string,
  visit: string;
async function q(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows;
}
async function as(user: string, selected?: string) {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",
    [
      user,
      JSON.stringify({ sub: user }),
      JSON.stringify(selected ? { "x-heimfriseur-business-id": selected } : {}),
    ],
  );
  await db.exec("set role authenticated");
}
async function rpc(name: string, p: Record<string, any> = {}) {
  const keys = Object.keys(p);
  return (
    await q(
      `select public.${name}(${keys.map((k, i) => k + " => $" + (i + 1)).join(",")}) value`,
      keys.map((k) =>
        p[k] && typeof p[k] === "object" && !Array.isArray(p[k])
          ? JSON.stringify(p[k])
          : p[k],
      ),
    )
  )[0].value;
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${A}','admin@test.invalid',now()),('${O}','owner@test.invalid',now()),('${P}','second@test.invalid',now()),('${E}','employee@test.invalid',now());`,
  );
  for (const file of [
    "001_heimfriseur.sql",
    "002_team.sql",
    "003_practical_workflow.sql",
    "004_app_admin.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  for (const user of [O, P]) {
    await as(user);
    await rpc("initialize_account");
  }
  await as(O);
  b = (await rpc("get_team_context")).business.id;
  facility = (
    await q("insert into facilities(user_id,name) values($1,$2) returning id", [
      O,
      "Admin-Testheim",
    ])
  )[0].id;
  group = await rpc("save_group_flexible", {
    p_data: { facility_id: facility, name: "Station" },
  });
  service = (
    await q("select id from services where name='Herrenhaarschnitt'")
  )[0].id;
  customer = await rpc("save_customer", {
    p_data: {
      facility_id: facility,
      group_id: group,
      first_name: "Fiktiver",
      last_name: "Kunde",
    },
    p_services: [service],
  });
  visit = await rpc("plan_visit_flexible", {
    p_facility: facility,
    p_group: group,
    p_date: "2027-02-02",
    p_time: "09:00",
    p_weeks: 1,
    p_all: true,
  });
  const invite = await rpc("create_team_invite", {
    p_email: "employee@test.invalid",
  });
  await as(E);
  await rpc("accept_team_invite", {
    p_token: invite.token,
    p_name: "Fiktiver Mitarbeiter",
  });
  await as(P);
  c = (await rpc("get_team_context")).business.id;
  await q("insert into facilities(user_id,name) values($1,$2)", [
    P,
    "Anderes Unternehmen",
  ]);
}, 30000);
afterAll(() => db.close());
describe.sequential("App administrator and tenant boundaries", () => {
  it("prevents owners and employees from granting or bootstrapping app privileges", async () => {
    for (const user of [O, E]) {
      await as(user, b);
      expect((await rpc("get_app_admin_context")).is_admin).toBe(false);
      await expect(
        rpc("set_app_admin", { p_email: "admin@test.invalid" }),
      ).rejects.toThrow("Nur ein App-Admin");
      await expect(
        rpc("bootstrap_app_admin", { p_email: "admin@test.invalid" }),
      ).rejects.toThrow("permission denied");
      await expect(
        q("insert into app_admins(user_id) values($1)", [user]),
      ).rejects.toThrow("permission denied");
    }
  });
  it("bootstraps only an explicitly named verified account via operator SQL", async () => {
    await db.exec("reset role");
    await q("update auth.users set email_confirmed_at=null where id=$1", [A]);
    await expect(
      rpc("bootstrap_app_admin", { p_email: "admin@test.invalid" }),
    ).rejects.toThrow("bestätigt");
    await q("update auth.users set email_confirmed_at=now() where id=$1", [A]);
    await rpc("bootstrap_app_admin", { p_email: "admin@test.invalid" });
    await expect(
      rpc("bootstrap_app_admin", { p_email: "owner@test.invalid" }),
    ).rejects.toThrow("bereits eingerichtet");
    await as(A);
    const ctx = await rpc("get_app_admin_context");
    expect(ctx.businesses).toHaveLength(2);
    expect(ctx.selected_business_id).toBe(null);
    await expect(rpc("get_team_context")).rejects.toThrow(
      "zuerst ein Unternehmen",
    );
    expect(await q("select * from facilities")).toEqual([]);
  });
  it("gives full owner capabilities only inside the selected company without transferring its proprietor", async () => {
    await as(A, b);
    const ctx = await rpc("get_team_context");
    expect(ctx.membership.role).toBe("owner");
    expect(ctx.membership.user_id).toBe(A);
    expect(ctx.business.owner_user_id).toBe(O);
    expect((await q("select * from facilities")).map((f) => f.name)).toEqual([
      "Admin-Testheim",
    ]);
    await q("update facilities set name=$1 where id=$2", [
      "Vom Admin geändert",
      facility,
    ]);
    const second = await rpc("save_customer", {
      p_data: {
        facility_id: facility,
        group_id: group,
        first_name: "Neuer",
        last_name: "Kunde",
      },
      p_services: [],
    });
    expect(second).toBeTruthy();
    await rpc("set_facility_price", {
      p_facility: facility,
      p_service: service,
      p_price: 30,
    });
    const member = (
      await q(
        "select id from appointment_customers where appointment_id=$1 and customer_id=$2",
        [visit, customer],
      )
    )[0].id;
    treatment = await rpc("start_treatment", { p_member: member });
    expect(
      (
        await q("select performed_by from treatments where id=$1", [treatment])
      )[0].performed_by,
    ).toBe(A);
    await rpc("save_treatment", {
      p_treatment: treatment,
      p_services: [service],
      p_price: 35,
      p_material: 1,
      p_notes: "",
      p_finish: true,
    });
    await rpc("record_payment", {
      p_treatment: treatment,
      p_data: { status: "Bezahlt" },
    });
    expect(
      (
        await q("select total_price from treatments where id=$1", [treatment])
      )[0].total_price,
    ).toBe("35.00");
    await rpc("complete_onboarding");
    await db.exec("reset role");
    expect(
      (
        await q(
          "select onboarding_completed from app_admins where user_id=$1",
          [A],
        )
      )[0].onboarding_completed,
    ).toBe(true);
    expect(
      (
        await q(
          "select onboarding_completed from business_memberships where user_id=$1",
          [O],
        )
      )[0].onboarding_completed,
    ).toBe(false);
  });
  it("switches companies while blocking cross-company reads and writes", async () => {
    await as(A, c);
    expect((await q("select * from facilities")).map((f) => f.name)).toEqual([
      "Anderes Unternehmen",
    ]);
    expect(
      await q("update facilities set name=$1 where id=$2 returning id", [
        "Falsch",
        facility,
      ]),
    ).toEqual([]);
    await expect(
      rpc("save_customer", {
        p_data: { facility_id: facility, group_id: group },
        p_services: [],
      }),
    ).rejects.toThrow("nicht gefunden");
    await as(O, c);
    expect((await q("select * from facilities")).map((f) => f.name)).toEqual([
      "Vom Admin geändert",
    ]);
    await as(E, b);
    expect(await q("select * from facilities")).toEqual([]);
  });
  it("logs actual admin changes through legacy owner-claim wrappers without copying private fields", async () => {
    await as(A, b);
    const ctx = await rpc("get_app_admin_context");
    const edits = ctx.audit.filter((a: any) => a.action === "data_changed");
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.every((a: any) => a.actor_id === A)).toBe(true);
    expect(edits.some((a: any) => a.details.table === "treatments")).toBe(true);
    expect(edits.every((a: any) => !("notes" in a.details))).toBe(true);
  });
  it("protects the last admin and immediately revokes access on all request paths", async () => {
    await as(A, b);
    await expect(
      rpc("set_app_admin", { p_email: "admin@test.invalid", p_active: false }),
    ).rejects.toThrow("letzte aktive");
    await rpc("set_app_admin", {
      p_email: "second@test.invalid",
      p_active: true,
    });
    await as(P, c);
    await rpc("set_app_admin", {
      p_email: "admin@test.invalid",
      p_active: false,
    });
    await as(A, b);
    expect((await rpc("get_app_admin_context")).is_admin).toBe(false);
    expect(await q("select * from facilities")).toEqual([]);
    await expect(rpc("get_team_context")).rejects.toThrow("Kein aktiver");
    await as(O);
    expect((await rpc("get_team_context")).membership.role).toBe("owner");
  });
});
