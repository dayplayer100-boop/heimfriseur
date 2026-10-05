import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const U = "10000000-0000-0000-0000-000000000001",
  V = "10000000-0000-0000-0000-000000000002",
  E = "10000000-0000-0000-0000-000000000003",
  F = "10000000-0000-0000-0000-000000000004",
  X = "10000000-0000-0000-0000-000000000005";
let legacyTreatment: string;
let facility: string,
  group: string,
  customer: string,
  secondCustomer: string,
  service: string,
  visit: string,
  unassigned: string,
  token: string,
  treatment: string,
  secondTreatment: string;
async function q(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows;
}
async function as(user: string) {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function admin() {
  await db.exec("reset role");
}
async function rpc(name: string, args: unknown[] = [], casts: string[] = []) {
  return (
    await q(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1) + (casts[i] ? "::" + casts[i] : "")).join(",")}) result`,
      args,
    )
  )[0].result;
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${U}','owner@test.invalid',now()),('${V}','other@test.invalid',now()),('${E}','employee@test.invalid',now()),('${F}','second@test.invalid',now()),('${X}','wrong@test.invalid',now());`,
  );
  await db.exec(
    readFileSync("supabase/migrations/001_heimfriseur.sql", "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  await as(U);
  await rpc("initialize_account");
  facility = (
    await q(
      "insert into facilities(user_id,name,notes) values($1,'Testheim','GEHEIME NOTIZ') returning id",
      [U],
    )
  )[0].id;
  group = (
    await q(
      "insert into groups(user_id,facility_id,name,notes) values($1,$2,'Station','PRIVAT') returning id",
      [U, facility],
    )
  )[0].id;
  service = (await q("select id from services where name='Waschen'"))[0].id;
  customer = await rpc(
    "save_customer",
    [
      JSON.stringify({
        facility_id: facility,
        group_id: group,
        first_name: "Test",
        last_name: "Person",
        notes: "INTERN",
      }),
      [service],
    ],
    ["jsonb", "uuid[]"],
  );
  visit = await rpc(
    "plan_visit",
    [group, "2027-01-05", "09:00", 5, true],
    ["uuid", "date", "time", "integer", "boolean"],
  );
  const legacyVisit = await rpc(
    "plan_visit",
    [group, "2026-01-05", "09:00", null, true],
    ["uuid", "date", "time", "integer", "boolean"],
  );
  const legacyMember = (
    await q("select id from appointment_customers where appointment_id=$1", [
      legacyVisit,
    ])
  )[0].id;
  legacyTreatment = await rpc("start_treatment", [legacyMember], ["uuid"]);
  await rpc(
    "save_treatment",
    [
      legacyTreatment,
      [service],
      null,
      1.5,
      "Historische Arbeitsnotiz",
      null,
      true,
    ],
    ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
  );
  await rpc("close_visit", [legacyVisit], ["uuid"]);
  await as(V);
  await rpc("initialize_account");
  await admin();
  await db.exec(readFileSync("supabase/migrations/002_team.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
describe(
  "Teams: migration, RLS, invitations and shared workflow",
  () => {
    it("preserves legacy customers, snapshots and creates separate businesses", async () => {
      await as(U);
      const ctx = await rpc("get_team_context");
      expect(ctx.membership.role).toBe("owner");
      expect(ctx.assignments.some((x: any) => x.appointment_id === visit)).toBe(
        true,
      );
      const legacy = (
        await q("select * from treatments where id=$1", [legacyTreatment])
      )[0];
      expect(Number(legacy.total_price)).toBe(5);
      expect(Number(legacy.material_cost)).toBe(1.5);
      expect(legacy.performed_by).toBe(U);
      expect(legacy.created_by).toBe(U);
      expect(legacy.end_time).toBeTruthy();
      expect((await q("select * from customers"))[0].id).toBe(customer);
      expect((await q("select * from profiles")).length).toBe(1);
      await as(V);
      expect((await rpc("get_team_context")).business.id).not.toBe(
        ctx.business.id,
      );
      expect(await q("select * from customers")).toEqual([]);
    });
    it("blocks mismatched emails and supports confirmed invitation acceptance", async () => {
      await as(U);
      const invitation = await rpc("create_team_invite", [
        "employee@test.invalid",
      ]);
      token = invitation.token;
      await as(X);
      await expect(rpc("accept_team_invite", [token, "Wrong"])).rejects.toThrow(
        "E-Mail",
      );
      await as(E);
      await rpc("accept_team_invite", [token, "Erika Mitarbeiter"]);
      await rpc("accept_team_invite", [token, "Erika Mitarbeiter"]);
      await rpc("initialize_account");
      expect((await rpc("get_team_context")).membership.role).toBe("employee");
      await as(U);
      const second = await rpc("create_team_invite", ["second@test.invalid"]);
      await as(F);
      await rpc("accept_team_invite", [second.token, "Frida Mitarbeiter"]);
    });
    it("rejects revoked, expired and unconfirmed invitations", async () => {
      await as(U);
      const revoked = await rpc("create_team_invite", ["wrong@test.invalid"]);
      await rpc("revoke_team_invite", [revoked.id]);
      await as(X);
      await expect(
        rpc("accept_team_invite", [revoked.token, "Wrong"]),
      ).rejects.toThrow("widerrufen");
      await as(U);
      const expired = await rpc("create_team_invite", ["wrong@test.invalid"]);
      await admin();
      await q(
        "update team_invitations set expires_at=now()-interval '1 second' where id=$1",
        [expired.id],
      );
      await as(X);
      await expect(
        rpc("accept_team_invite", [expired.token, "Wrong"]),
      ).rejects.toThrow("abgelaufen");
      await as(U);
      const unchecked = await rpc("create_team_invite", ["wrong@test.invalid"]);
      await admin();
      await q("update auth.users set email_confirmed_at=null where id=$1", [X]);
      await as(X);
      await expect(
        rpc("accept_team_invite", [unchecked.token, "Wrong"]),
      ).rejects.toThrow("bestätigen");
    });
    it("assigns multiple employees; cannot cross organization boundaries", async () => {
      await as(U);
      await rpc("assign_visit", [visit, [E, F], E], ["uuid", "uuid[]", "uuid"]);
      unassigned = await rpc(
        "plan_visit",
        [group, "2027-01-12", "09:00", null, true],
        ["uuid", "date", "time", "integer", "boolean"],
      );
      await expect(
        rpc("assign_visit", [visit, [V], V], ["uuid", "uuid[]", "uuid"]),
      ).rejects.toThrow("aktive");
      await as(E);
      const d = await rpc("employee_snapshot");
      expect(d.appointments.map((a: any) => a.id)).toEqual([visit]);
      expect(d.customers[0].notes).toBe("");
      expect(d.facilities[0].notes).toBe("");
      expect(d.groups[0].notes).toBe("");
      expect(d.profiles).toEqual([]);
      expect(await q("select * from facilities")).toEqual([]);
      expect(await q("select * from treatments")).toEqual([]);
      await expect(
        q("update business_memberships set role='owner' where user_id=$1", [E]),
      ).rejects.toThrow("permission denied");
      await expect(
        q("select * from heimfriseur_private.membership()"),
      ).rejects.toThrow("permission denied");
      await expect(
        rpc(
          "move_visit",
          [visit, "2027-01-06", "09:00", false],
          ["uuid", "date", "time", "boolean"],
        ),
      ).rejects.toThrow("Geschäftsführer");
      await expect(rpc("close_visit", [unassigned], ["uuid"])).rejects.toThrow(
        "zugewiesen",
      );
    });
    it("allows an unassigned visit without a responsible person and denies employee customer creation", async () => {
      await as(U);
      await rpc(
        "assign_visit",
        [unassigned, [], null],
        ["uuid", "uuid[]", "uuid"],
      );
      expect(
        (await rpc("get_team_context")).assignments.some(
          (x: any) => x.appointment_id === unassigned,
        ),
      ).toBe(false);
      await rpc(
        "assign_visit",
        [unassigned, [U], null],
        ["uuid", "uuid[]", "uuid"],
      );
      expect(
        (await rpc("get_team_context")).assignments.find(
          (x: any) => x.appointment_id === unassigned,
        ).is_responsible,
      ).toBe(false);
      await as(E);
      await expect(
        rpc(
          "save_customer",
          [
            JSON.stringify({
              facility_id: facility,
              group_id: group,
              first_name: "Fremd",
              last_name: "Versuch",
            }),
            [],
          ],
          ["jsonb", "uuid[]"],
        ),
      ).rejects.toThrow("Geschäftsführer");
      const ctx = await rpc("get_team_context");
      expect(ctx.invitations).toEqual([]);
      expect(ctx.audit).toEqual([]);
    });
    it("starts idempotently and excludes simultaneous treatment of one customer", async () => {
      await as(E);
      const d = await rpc("employee_snapshot");
      const member = d.appointment_customers[0].id;
      treatment = await rpc("start_treatment", [member], ["uuid"]);
      expect(await rpc("start_treatment", [member], ["uuid"])).toBe(treatment);
      await as(F);
      await expect(rpc("start_treatment", [member], ["uuid"])).rejects.toThrow(
        "bereits",
      );
      await as(U);
      secondCustomer = await rpc(
        "save_customer",
        [
          JSON.stringify({
            facility_id: facility,
            group_id: group,
            first_name: "Zweite",
            last_name: "Person",
          }),
          [service],
        ],
        ["jsonb", "uuid[]"],
      );
      await rpc(
        "add_visit_customer",
        [visit, secondCustomer],
        ["uuid", "uuid"],
      );
      await as(F);
      const next = (await rpc("employee_snapshot")).appointment_customers.find(
        (m: any) => m.customer_id === secondCustomer,
      ).id;
      secondTreatment = await rpc("start_treatment", [next], ["uuid"]);
      await as(E);
      await expect(rpc("start_treatment", [next], ["uuid"])).rejects.toThrow(
        "bereits",
      );
    });
    it("saves drafts but rejects price overrides, another performer and unknown service", async () => {
      await as(E);
      await rpc(
        "save_treatment",
        [treatment, [service], null, 2.2, "Arbeitsnotiz", null, false],
        ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
      );
      const own = (await rpc("employee_snapshot")).treatments.find(
        (t: any) => t.id === treatment,
      );
      expect(Number(own.material_cost)).toBe(2.2);
      expect(own.notes).toBe("Arbeitsnotiz");
      await expect(
        rpc(
          "save_treatment",
          [treatment, [service], 1, 0, "", null, false],
          ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
        ),
      ).rejects.toThrow("überschreiben");
      await expect(
        rpc(
          "save_treatment",
          [secondTreatment, [service], null, 0, "", null, false],
          ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
        ),
      ).rejects.toThrow("ausführende");
      await expect(
        rpc(
          "save_treatment",
          [treatment, [V], null, 0, "", null, false],
          ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
        ),
      ).rejects.toThrow("Ungültige Leistung");
      await as(U);
      await q("update services set price=9 where id=$1", [service]);
      await as(E);
      await rpc(
        "save_treatment",
        [treatment, [service], null, 2.2, "Fertig", null, true],
        ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
      );
      expect(
        Number(
          (await rpc("employee_snapshot")).treatments.find(
            (t: any) => t.id === treatment,
          ).total_price,
        ),
      ).toBe(5);
    });
    it("hides other staff finances and requires responsible person for closing", async () => {
      await as(F);
      const own = await rpc("employee_snapshot");
      expect(
        Number(own.treatments.find((t: any) => t.id === treatment).total_price),
      ).toBe(0);
      await expect(rpc("close_visit", [visit], ["uuid"])).rejects.toThrow(
        "Abschluss",
      );
      await rpc(
        "save_treatment",
        [secondTreatment, [service], null, 0, "", null, true],
        ["uuid", "uuid[]", "numeric", "numeric", "text", "jsonb", "boolean"],
      );
      await as(E);
      const next = await rpc("close_visit", [visit], ["uuid"]);
      expect(next).toBeTruthy();
      expect(await rpc("close_visit", [visit], ["uuid"])).toBe(next);
      const d = await rpc("employee_snapshot");
      expect(
        d.appointments.find((a: any) => a.id === next).appointment_date,
      ).toBe("2027-02-09");
      expect(
        (await rpc("get_team_context")).assignments.filter(
          (x: any) => x.appointment_id === next,
        ).length,
      ).toBe(2);
    });
    it("records corrections without changing service snapshots; only owner", async () => {
      await as(E);
      await expect(
        rpc(
          "correct_treatment",
          [treatment, 6, 1, "Korrektur"],
          ["uuid", "numeric", "numeric", "text"],
        ),
      ).rejects.toThrow("Geschäftsführer");
      await as(U);
      await rpc(
        "correct_treatment",
        [treatment, 6, 1, "Material korrigiert"],
        ["uuid", "numeric", "numeric", "text"],
      );
      const ctx = await rpc("get_team_context");
      const audit = ctx.audit.find(
        (e: any) => e.action === "treatment_corrected",
      );
      expect(Number(audit.details.before.price)).toBe(5);
      expect(Number(audit.details.after.price)).toBe(6);
      expect(
        Number(
          (
            await q(
              "select price_snapshot from treatment_services where treatment_id=$1",
              [treatment],
            )
          )[0].price_snapshot,
        ),
      ).toBe(5);
    });
    it("revokes staff access immediately, preserves history and protects owner", async () => {
      await as(U);
      const ctx = await rpc("get_team_context");
      const employee = ctx.members.find((m: any) => m.user_id === E);
      await rpc("set_member_active", [employee.id, false], ["uuid", "boolean"]);
      await as(E);
      await expect(rpc("employee_snapshot")).rejects.toThrow("aktiver");
      await expect(rpc("get_team_context")).rejects.toThrow("aktiver");
      expect(await q("select * from treatments")).toEqual([]);
      await as(U);
      expect((await q("select * from treatments")).length).toBe(3);
      await expect(
        rpc(
          "set_member_active",
          [ctx.membership.id, false],
          ["uuid", "boolean"],
        ),
      ).rejects.toThrow("aktiv bleiben");
    });
  },
);
