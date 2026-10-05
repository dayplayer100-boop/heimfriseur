import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { normalizeDate, normalizeTime } from "../src/ScheduleFields";
const db = new PGlite();
const O = "50000000-0000-0000-0000-000000000001",
  A = "50000000-0000-0000-0000-000000000002",
  E = "50000000-0000-0000-0000-000000000003",
  X = "50000000-0000-0000-0000-000000000004";
let business: string,
  ghost: string,
  f: string,
  g: string,
  c: string,
  s: string,
  visit: string;
async function q(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows;
}
async function as(user: string, selection?: string) {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",
    [
      user,
      JSON.stringify({ sub: user }),
      JSON.stringify(
        selection ? { "x-heimfriseur-business-id": selection } : {},
      ),
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
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${O}','owner@test.invalid',now()),('${A}','admin@test.invalid',now()),('${E}','employee@test.invalid',now()),('${X}','other@test.invalid',now());`,
  );
  for (const file of [
    "001_heimfriseur.sql",
    "002_team.sql",
    "003_practical_workflow.sql",
    "004_app_admin.sql",
    "005_clear_workflows.sql",
    "006_workday.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  for (const user of [O, A]) {
    await as(user);
    await rpc("initialize_account");
  }
  await as(A);
  ghost = (await rpc("get_team_context")).business.id;
  await as(O);
  business = (await rpc("get_team_context")).business.id;
  f = (
    await q("insert into facilities(user_id,name) values($1,$2) returning id", [
      O,
      "Erstes Heim",
    ])
  )[0].id;
  g = await rpc("save_group_flexible", {
    p_data: { facility_id: f, name: "Gruppe A" },
  });
  s = (await q("select id from services where name='Herrenhaarschnitt'"))[0].id;
  c = await rpc("save_customer", {
    p_data: {
      facility_id: f,
      group_id: g,
      first_name: "Test",
      last_name: "Kunde",
    },
    p_services: [s],
  });
  visit = await rpc("plan_visit_flexible", {
    p_facility: f,
    p_group: g,
    p_date: "2027-03-02",
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
    p_name: "Testteam",
  });
  await as(O);
  await rpc("assign_visit", {
    p_appointment: visit,
    p_users: [E],
    p_responsible: E,
  });
  await db.exec("reset role");
  await rpc("bootstrap_app_admin", { p_email: "admin@test.invalid" });
}, 30000);
afterAll(() => db.close());
describe.sequential("V5: Bedienung und sichere Arbeitsabläufe", () => {
  it("ordnet den Admin automatisch dem echten Betrieb zu, ohne die Geschäftsführung zu ändern", async () => {
    await as(A, ghost);
    const ctx = await rpc("get_app_admin_context");
    expect(ctx.businesses.map((x: any) => x.id)).toEqual([business]);
    expect(ctx.selected_business_id).toBe(business);
    expect((await rpc("get_team_context")).business.owner_user_id).toBe(O);
    await db.exec("reset role");
    expect(
      (
        await q("select count(*)::int n from businesses where id=$1", [ghost])
      )[0].n,
    ).toBe(1);
  });
  it("hält die technische Adminhistorie vom Geschäftsführer und Mitarbeitern fern", async () => {
    await as(A, business);
    await q("update facilities set name=$1 where id=$2", [
      "Geändertes Heim",
      f,
    ]);
    await rpc("complete_onboarding");
    const actorAudit = (await rpc("get_app_admin_context")).audit.filter(
      (x: any) => x.actor_id === A,
    );
    expect(actorAudit.some((x: any) => x.details.operation === "UPDATE")).toBe(
      true,
    );
    await as(O);
    expect((await rpc("get_app_admin_context")).is_admin).toBe(false);
    expect(
      (await rpc("get_team_context")).audit.every((x: any) => x.actor_id !== A),
    ).toBe(true);
    await expect(q("select * from app_admin_audit")).rejects.toThrow(
      "permission denied",
    );
    await rpc("complete_setup");
    expect((await rpc("get_team_context")).membership.setup_completed).toBe(
      true,
    );
  });
  it("übernimmt die erste Preisliste und erhält unabhängige Listen sowie Behandlungssnapshots", async () => {
    await as(O);
    await rpc("save_facility_price_list", {
      p_facility: f,
      p_prices: { [s]: 30 },
    });
    const second = (
      await q(
        "insert into facilities(user_id,name) values($1,$2) returning id",
        [O, "Zweites Heim"],
      )
    )[0].id;
    const third = (
      await q(
        "insert into facilities(user_id,name) values($1,$2) returning id",
        [O, "Drittes Heim"],
      )
    )[0].id;
    expect(
      (
        await q(
          "select price from facility_service_prices where facility_id=$1 and service_id=$2",
          [second, s],
        )
      )[0].price,
    ).toBe("30.00");
    await rpc("save_facility_price_list", {
      p_facility: second,
      p_prices: { [s]: 24 },
    });
    const member = (
      await q(
        "select id from appointment_customers where appointment_id=$1 and customer_id=$2",
        [visit, c],
      )
    )[0].id;
    const t = await rpc("start_treatment", { p_member: member });
    await rpc("save_treatment", {
      p_treatment: t,
      p_services: [s],
      p_price: 30,
      p_material: 0,
      p_notes: "",
      p_finish: true,
    });
    await rpc("save_facility_price_list", {
      p_facility: f,
      p_prices: { [s]: 35 },
    });
    expect(
      (
        await q(
          "select price from facility_service_prices where facility_id=$1 and service_id=$2",
          [second, s],
        )
      )[0].price,
    ).toBe("24.00");
    expect(
      (
        await q(
          "select price from facility_service_prices where facility_id=$1 and service_id=$2",
          [third, s],
        )
      )[0].price,
    ).toBe("35.00");
    expect(
      (
        await q(
          "select price_snapshot from treatment_services where treatment_id=$1",
          [t],
        )
      )[0].price_snapshot,
    ).toBe("30.00");
    await expect(
      rpc("save_facility_price_list", { p_facility: f, p_prices: { [s]: -1 } }),
    ).rejects.toThrow();
    await expect(
      rpc("save_facility_price_list", { p_facility: f, p_prices: null }),
    ).rejects.toThrow();
  });
  it("plant genau einen ausgewählten Kunden und übernimmt ihn einmal in den Folgetermin", async () => {
    await as(O);
    const a = await rpc("plan_customer_visit", {
      p_facility: f,
      p_group: g,
      p_customer: c,
      p_date: "2027-05-04",
      p_time: "10:30",
      p_weeks: 5,
    });
    expect(
      (
        await q(
          "select customer_id from appointment_customers where appointment_id=$1",
          [a],
        )
      ).map((x) => x.customer_id),
    ).toEqual([c]);
    const member = (
      await q("select id from appointment_customers where appointment_id=$1", [
        a,
      ])
    )[0].id;
    await rpc("skip_customer_followup", {
      p_member: member,
      p_reason: "Nicht anwesend",
      p_next_date: null,
    });
    const next = await rpc("close_visit", { p_appointment: a });
    expect(
      (
        await q("select appointment_date from appointments where id=$1", [next])
      )[0].appointment_date
        .toISOString()
        .slice(0, 10),
    ).toBe("2027-06-08");
    expect(
      (
        await q(
          "select customer_id from appointment_customers where appointment_id=$1",
          [next],
        )
      ).map((x) => x.customer_id),
    ).toEqual([c]);
    expect(await rpc("close_visit", { p_appointment: a })).toBe(next);
  });
  it("erlaubt Mitarbeiterplanung nur mit Freigabe und innerhalb der zugewiesenen Gruppe", async () => {
    await as(E);
    const params = {
      p_facility: f,
      p_group: g,
      p_customer: c,
      p_date: "2027-07-06",
      p_time: "11:00",
    };
    await expect(rpc("plan_customer_visit", params)).rejects.toThrow(
      "darfst du nicht",
    );
    await as(O);
    await rpc("set_member_permissions", {
      p_member: (await rpc("get_team_context")).members.find(
        (m: any) => m.user_id === E,
      ).id,
      p_permissions: { edit_schedule: true },
    });
    await as(E);
    const a = await rpc("plan_customer_visit", params);
    const snapshot = await rpc("employee_snapshot");
    expect(snapshot.appointments.some((x: any) => x.id === a)).toBe(true);
    await expect(
      rpc("save_facility_price_list", { p_facility: f, p_prices: { [s]: 1 } }),
    ).rejects.toThrow();
    await expect(
      rpc("plan_customer_visit", { ...params, p_facility: null }),
    ).rejects.toThrow("zugewiesene Gruppe");
    await as(O);
    const other = await rpc("save_group_flexible", {
      p_data: { facility_id: f, name: "Nicht zugewiesene Gruppe" },
    });
    await as(E);
    await expect(
      rpc("plan_customer_visit", { ...params, p_group: other }),
    ).rejects.toThrow("zugewiesene Gruppe");
  });
});
describe.sequential("V6: einmalige Änderungen und Zahlungen", () => {
  it("bewahrt den Rhythmus nach einer vorgezogenen Behandlung und verhindert doppelte Nachholtermine", async () => {
    await as(O);
    const customer = await rpc("save_customer", {
      p_data: {
        facility_id: f,
        group_id: g,
        first_name: "Rhythmus",
        recurrence_weeks: 5,
        next_due_date: "2027-10-12",
      },
      p_services: [s],
    });
    const original = await rpc("plan_customer_visit", {
      p_facility: f,
      p_group: g,
      p_customer: customer,
      p_date: "2027-10-12",
      p_time: "09:00",
    });
    const later = await rpc("plan_customer_visit", {
      p_facility: f,
      p_group: g,
      p_customer: customer,
      p_date: "2027-11-16",
      p_time: "09:00",
    });
    const target = await rpc("reschedule_customer_once", {
      p_customer: customer,
      p_date: "2027-10-05",
      p_time: "10:00",
    });
    expect(
      await rpc("reschedule_customer_once", {
        p_customer: customer,
        p_date: "2027-10-05",
        p_time: "10:00",
      }),
    ).toBe(target);
    expect(
      (
        await q(
          "select status from appointment_customers where appointment_id=$1",
          [original],
        )
      )[0].status,
    ).toBe("Nicht durchgeführt");
    expect(
      (
        await q(
          "select status from appointment_customers where appointment_id=$1",
          [later],
        )
      )[0].status,
    ).toBe("Offen");
    const member = (
      await q("select id from appointment_customers where appointment_id=$1", [
        target,
      ])
    )[0].id;
    const t = await rpc("start_treatment", { p_member: member });
    await rpc("save_treatment", {
      p_treatment: t,
      p_services: [s],
      p_price: 35,
      p_material: 0,
      p_notes: "",
      p_finish: true,
    });
    const row = (
      await q(
        "select next_due_date,temporary_due_date from customers where id=$1",
        [customer],
      )
    )[0];
    expect(row.next_due_date.toISOString().slice(0, 10)).toBe("2027-11-16");
    expect(row.temporary_due_date).toBe(null);
    await rpc("record_payment", {
      p_treatment: t,
      p_data: { status: "Unbekannt" },
    });
    expect(
      (
        await q("select status from treatment_payments where treatment_id=$1", [
          t,
        ])
      )[0].status,
    ).toBe("Unbekannt");
  });
  it("bietet den nächsten Heimbesuch ohne Änderung des regulären Datums an", async () => {
    await as(O);
    const customer = await rpc("save_customer", {
      p_data: {
        facility_id: f,
        group_id: g,
        first_name: "Abwesend",
        recurrence_weeks: 5,
        next_due_date: "2028-01-04",
      },
      p_services: [],
    });
    const a = await rpc("plan_customer_visit", {
      p_facility: f,
      p_group: g,
      p_customer: customer,
      p_date: "2028-01-04",
      p_time: "09:00",
    });
    const member = (
      await q("select id from appointment_customers where appointment_id=$1", [
        a,
      ])
    )[0].id;
    await rpc("skip_customer_choice", {
      p_member: member,
      p_reason: "Krank",
      p_choice: "next_visit",
    });
    const row = (
      await q(
        "select next_due_date,temporary_due_date from customers where id=$1",
        [customer],
      )
    )[0];
    expect(row.next_due_date.toISOString().slice(0, 10)).toBe("2028-01-04");
    expect(row.temporary_due_date.toISOString().slice(0, 10)).toBe(
      "2028-01-11",
    );
    await as(E);
    await expect(
      rpc("reschedule_customer_once", {
        p_customer: customer,
        p_date: "2028-01-18",
      }),
    ).resolves.toBeTruthy();
    await as(O);
    const unassignedCustomer = await rpc("save_customer", {
      p_data: {
        facility_id: f,
        group_id: g,
        first_name: "Andere Zuweisung",
        next_due_date: "2028-05-02",
      },
      p_services: [],
    });
    const unassignedVisit = await rpc("plan_customer_visit", {
      p_facility: f,
      p_group: g,
      p_customer: unassignedCustomer,
      p_date: "2028-05-02",
      p_time: "09:00",
    });
    await as(E);
    await expect(
      rpc("reschedule_customer_once", {
        p_customer: unassignedCustomer,
        p_date: "2028-05-09",
      }),
    ).rejects.toThrow("zuerst zugewiesen");
    await as(O);
    expect(
      (
        await q(
          "select status from appointment_customers where appointment_id=$1",
          [unassignedVisit],
        )
      )[0].status,
    ).toBe("Offen");
    await rpc("set_member_permissions", {
      p_member: (await rpc("get_team_context")).members.find(
        (m: any) => m.user_id === E,
      ).id,
      p_permissions: { edit_schedule: false },
    });
    await as(E);
    await expect(
      rpc("reschedule_customer_once", {
        p_customer: customer,
        p_date: "2028-01-25",
      }),
    ).rejects.toThrow("darfst du nicht");
  });
});
describe("Deutsche Datum- und Zeiteingabe", () => {
  it("versteht Zahlentastatur und deutsche Schreibweise", () => {
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("0930")).toBe("09:30");
    expect(normalizeTime("23:59")).toBe("23:59");
    expect(normalizeTime("09:00:00")).toBe("09:00");
    expect(normalizeDate("06102026")).toBe("2026-10-06");
    expect(normalizeDate("29.02.2028")).toBe("2028-02-29");
  });
  it("lehnt ungültige Kalenderdaten und Uhrzeiten ab", () => {
    for (const v of ["2400", "1260", "-100", ""])
      expect(() => normalizeTime(v)).toThrow();
    for (const v of ["29.02.2027", "31.04.2026", "00000000"])
      expect(() => normalizeDate(v)).toThrow();
  });
});
