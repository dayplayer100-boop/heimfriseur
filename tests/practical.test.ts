import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite(),
  O = "30000000-0000-0000-0000-000000000001",
  E = "30000000-0000-0000-0000-000000000002",
  X = "30000000-0000-0000-0000-000000000003";
let facility: string,
  group: string,
  cohortA: string,
  cohortB: string,
  customerA: string,
  customerB: string,
  visit: string,
  service: string,
  treatment: string,
  employeeMember: string;
async function q(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows;
}
async function as(user: string) {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function rpc(name: string, p: Record<string, any> = {}) {
  const keys = Object.keys(p);
  const values = keys.map((k) =>
    p[k] && typeof p[k] === "object" && !Array.isArray(p[k])
      ? JSON.stringify(p[k])
      : p[k],
  );
  return (
    await q(
      `select public.${name}(${keys.map((k, i) => k + " => $" + (i + 1)).join(",")}) value`,
      values,
    )
  )[0].value;
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${O}','owner@test.invalid',now()),('${E}','employee@test.invalid',now()),('${X}','other@test.invalid',now());`,
  );
  for (const file of [
    "001_heimfriseur.sql",
    "002_team.sql",
    "003_practical_workflow.sql",
  ])
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await as(O);
  await rpc("initialize_account");
  service = (
    await q("select id from services where name='Herrenhaarschnitt'")
  )[0].id;
  facility = (
    await q(
      "insert into facilities(user_id,name) values($1,'Fiktives Testheim') returning id",
      [O],
    )
  )[0].id;
  group = (
    await q(
      "insert into groups(user_id,facility_id,name,recurrence_weeks) values($1,$2,'Wohnbereich A',5) returning id",
      [O, facility],
    )
  )[0].id;
}, 30000);
afterAll(() => db.close());
describe.sequential("Practical workflow migration and authorization", () => {
  it("creates customers with unknown names and missing facility/group without blocking", async () => {
    const id = await rpc("save_customer", {
      p_data: { first_name: "", last_name: "" },
      p_services: [],
    });
    const c = (await q("select * from customers where id=$1", [id]))[0];
    expect(c.first_name).toBe("");
    expect(c.facility_id).toBeTruthy();
    expect(c.group_id).toBeTruthy();
    expect(c.hair_request).toBe("Unbekannt");
    const second = await rpc("save_customer", { p_data: {}, p_services: [] });
    expect(
      (await q("select * from customers where id=$1", [second]))[0].facility_id,
    ).toBe(c.facility_id);
  });
  it("supports alternating subgroups with an independent weekly facility visit", async () => {
    cohortA = await rpc("save_cohort", {
      p_data: {
        facility_id: facility,
        group_id: group,
        name: "Runde A",
        recurrence_weeks: 2,
        anchor_date: "2027-01-05",
      },
    });
    cohortB = await rpc("save_cohort", {
      p_data: {
        facility_id: facility,
        group_id: group,
        name: "Runde B",
        recurrence_weeks: 2,
        anchor_date: "2027-01-12",
      },
    });
    customerA = await rpc("save_customer", {
      p_data: {
        facility_id: facility,
        group_id: group,
        first_name: "Test",
        last_name: "A",
        cohort_id: cohortA,
        hair_request: "Ja",
      },
      p_services: [service],
    });
    customerB = await rpc("save_customer", {
      p_data: {
        facility_id: facility,
        group_id: group,
        first_name: "Test",
        last_name: "B",
        cohort_id: cohortB,
        hair_request: "Ja",
      },
      p_services: [service],
    });
    visit = await rpc("plan_visit_flexible", {
      p_facility: facility,
      p_group: null,
      p_date: "2027-01-05",
      p_time: "09:00",
      p_weeks: 1,
      p_all: true,
    });
    expect(
      (
        await q(
          "select customer_id from appointment_customers where appointment_id=$1",
          [visit],
        )
      ).map((x) => x.customer_id),
    ).toEqual([customerA]);
    expect(
      (await q("select * from appointments where id=$1", [visit]))[0]
        .all_groups,
    ).toBe(true);
  });
  it("uses facility prices and preserves snapshots on later changes", async () => {
    await rpc("set_facility_price", {
      p_facility: facility,
      p_service: service,
      p_price: 29,
    });
    const member = (
      await q("select id from appointment_customers where appointment_id=$1", [
        visit,
      ])
    )[0].id;
    treatment = await rpc("start_treatment", { p_member: member });
    expect(
      Number(
        (
          await q("select total_price from treatments where id=$1", [treatment])
        )[0].total_price,
      ),
    ).toBe(29);
    await rpc("set_facility_price", {
      p_facility: facility,
      p_service: service,
      p_price: 35,
    });
    await rpc("save_treatment", {
      p_treatment: treatment,
      p_services: [service],
      p_price: null,
      p_material: 1.2,
      p_notes: "",
      p_finish: true,
    });
    expect(
      Number(
        (
          await q(
            "select price_snapshot from treatment_services where treatment_id=$1",
            [treatment],
          )
        )[0].price_snapshot,
      ),
    ).toBe(29);
    expect(
      (
        await q("select next_due_date::text from customers where id=$1", [
          customerA,
        ])
      )[0].next_due_date,
    ).toBe("2027-01-19");
  });
  it("creates a weekly follow-up with only the next due subgroup", async () => {
    const next = await rpc("close_visit", { p_appointment: visit });
    expect(await rpc("close_visit", { p_appointment: visit })).toBe(next);
    expect(
      (
        await q(
          "select *,appointment_date::text as appointment_date from appointments where id=$1",
          [next],
        )
      )[0].appointment_date,
    ).toBe("2027-01-12");
    expect(
      (
        await q(
          "select customer_id from appointment_customers where appointment_id=$1",
          [next],
        )
      ).map((x) => x.customer_id),
    ).toEqual([customerB]);
    await rpc("add_customer_to_visit", {
      p_appointment: next,
      p_customer: customerA,
      p_entry_type: "Vorgezogen",
    });
    expect(
      (
        await q(
          "select entry_type from appointment_customers where appointment_id=$1 and customer_id=$2",
          [next, customerA],
        )
      )[0].entry_type,
    ).toBe("Vorgezogen");
    const member = (
      await q(
        "select id from appointment_customers where appointment_id=$1 and customer_id=$2",
        [next, customerB],
      )
    )[0].id;
    await rpc("skip_customer_followup", {
      p_member: member,
      p_reason: "Krank",
      p_next_date: "2027-01-19",
    });
    expect(
      (
        await q(
          "select next_due_date::text,status from customers where id=$1",
          [customerB],
        )
      )[0],
    ).toMatchObject({ next_due_date: "2027-01-19", status: "Aktiv" });
  });
  it("does not plan or start unwanted haircuts, and rejects foreign cohorts", async () => {
    const id = await rpc("save_customer", {
      p_data: {
        facility_id: facility,
        group_id: group,
        first_name: "Ohne",
        hair_request: "Nein",
      },
      p_services: [],
    });
    await expect(
      rpc("add_customer_to_visit", {
        p_appointment: (
          await q(
            "select id from appointments where appointment_date='2027-01-12'",
          )
        )[0].id,
        p_customer: id,
      }),
    ).rejects.toThrow("Friseurwunsch");
    await expect(
      rpc("save_customer", {
        p_data: {
          facility_id: facility,
          group_id: group,
          first_name: "Falsch",
          cohort_id: service,
        },
        p_services: [],
      }),
    ).rejects.toThrow("Untergruppe");
  });
  it("records payer and payment as snapshots; custom methods and no retroactive address updates", async () => {
    const method = await rpc("save_payment_method", {
      p_name: "Familienkonto",
    });
    await rpc("save_billing", {
      p_customer: customerA,
      p_data: {
        billing_name: "Test Betreuer",
        street: "Testweg 1",
        postal_code: "12345",
        city: "Teststadt",
        payment_method_id: method,
        delivery: "Post",
      },
    });
    await rpc("record_payment", {
      p_treatment: treatment,
      p_data: { payment_method_id: method, status: "Offen", delivery: "Post" },
    });
    await rpc("save_billing", {
      p_customer: customerA,
      p_data: { billing_name: "Anderer Empfänger" },
    });
    const payment = (
      await q("select * from treatment_payments where treatment_id=$1", [
        treatment,
      ])
    )[0];
    expect(payment.billing_name_snapshot).toBe("Test Betreuer");
    expect(Number(payment.amount)).toBe(29);
    expect(payment.method_name_snapshot).toBe("Familienkonto");
  });
  it("applies employee permissions server-side and supports all-group customer scope", async () => {
    const invitation = await rpc("create_team_invite", {
      p_email: "employee@test.invalid",
    });
    await as(E);
    await rpc("accept_team_invite", {
      p_token: invitation.token,
      p_name: "Test Mitarbeiter",
    });
    employeeMember = (await rpc("get_team_context")).membership.id;
    await as(O);
    const next = (
      await q("select id from appointments where appointment_date='2027-01-12'")
    )[0].id;
    await rpc("assign_visit", {
      p_appointment: next,
      p_users: [E],
      p_responsible: E,
    });
    await as(E);
    expect(
      (await rpc("employee_snapshot")).customers.some(
        (c: any) => c.id === customerA,
      ),
    ).toBe(true);
    expect((await rpc("employee_snapshot")).customer_billing).toEqual([]);
    await expect(
      rpc("save_customer", {
        p_data: {
          id: customerA,
          facility_id: facility,
          group_id: group,
          first_name: "Geändert",
        },
        p_services: [],
      }),
    ).rejects.toThrow("Kundendaten");
    await expect(
      rpc("set_member_permissions", {
        p_member: employeeMember,
        p_permissions: { edit_customers: true },
      }),
    ).rejects.toThrow("Geschäftsführer");
    await as(O);
    await rpc("set_member_permissions", {
      p_member: employeeMember,
      p_permissions: {
        edit_customers: true,
        add_customers: true,
        view_billing: true,
        record_payments: true,
        override_prices: true,
        close_visits: false,
      },
    });
    await as(E);
    expect(
      (await rpc("employee_snapshot")).customer_billing[0].billing_name,
    ).toBe("Anderer Empfänger");
    await rpc("save_customer", {
      p_data: {
        id: customerA,
        facility_id: facility,
        group_id: group,
        first_name: "Geändert",
        recurrence_weeks: 3,
        next_due_date: "2027-01-20",
      },
      p_services: [service],
    });
    await expect(rpc("close_visit", { p_appointment: next })).rejects.toThrow(
      "abschließen",
    );
    await expect(q("select * from customer_billing")).resolves.toEqual([]);
  });
  it("rejects data from another business and invalid permissions", async () => {
    await as(X);
    await rpc("initialize_account");
    await expect(
      rpc("save_billing", { p_customer: customerA, p_data: {} }),
    ).rejects.toThrow("Zugriff");
    await expect(
      rpc("set_facility_price", {
        p_facility: facility,
        p_service: service,
        p_price: 1,
      }),
    ).rejects.toThrow("nicht gefunden");
    await as(O);
    await expect(
      rpc("set_member_permissions", {
        p_member: employeeMember,
        p_permissions: { role: "owner" },
      }),
    ).rejects.toThrow("Ungültige");
  });
  it("stores feedback scoped to the business and completes onboarding only for self", async () => {
    await as(E);
    const f = await rpc("submit_feedback", {
      p_category: "Fehler",
      p_message: "Fiktiver Testfehler im Kalender",
      p_route: "calendar",
    });
    await rpc("complete_onboarding");
    expect(
      (await rpc("get_team_context")).membership.onboarding_completed,
    ).toBe(true);
    expect(
      (await rpc("employee_snapshot")).feedback.map((x: any) => x.id),
    ).toContain(f);
    await as(X);
    expect(await q("select * from feedback")).toEqual([]);
    await as(O);
    expect((await q("select * from feedback")).length).toBe(1);
    await rpc("resolve_feedback", { p_id: f });
    expect((await q("select * from feedback"))[0].status).toBe("Erledigt");
  });
  it("preserves a manually planned empty visit when customer data changes", async () => {
    await as(O);
    const a = await rpc("plan_visit_flexible", {
      p_facility: facility,
      p_group: group,
      p_date: "2027-03-02",
      p_time: "09:00",
      p_all: false,
    });
    await rpc("save_customer", {
      p_data: {
        facility_id: facility,
        group_id: group,
        first_name: "Manual",
        last_name: "Test",
      },
      p_services: [],
    });
    expect(
      await q("select * from appointment_customers where appointment_id=$1", [
        a,
      ]),
    ).toEqual([]);
    const g = await rpc("save_group_flexible", {
      p_data: { facility_id: facility, name: "" },
    });
    expect(
      (await q("select name from groups where id=$1", [g]))[0].name,
    ).toContain("noch offen");
  });
  it("allows only explicitly enabled schedule, own price and payment changes", async () => {
    await as(O);
    const a = (
      await q("select id from appointments where appointment_date='2027-01-12'")
    )[0].id;
    await rpc("set_member_permissions", {
      p_member: employeeMember,
      p_permissions: {
        edit_schedule: true,
        override_prices: true,
        record_payments: false,
      },
    });
    await as(E);
    await expect(
      rpc("move_visit", {
        p_appointment: a,
        p_date: "2027-01-13",
        p_time: "10:00",
        p_future: true,
      }),
    ).rejects.toThrow("nur diesen");
    await rpc("move_visit", {
      p_appointment: a,
      p_date: "2027-01-13",
      p_time: "10:00",
      p_future: false,
    });
    const m = (await rpc("employee_snapshot")).appointment_customers.find(
      (m: any) => m.appointment_id === a && m.customer_id === customerA,
    );
    const t = await rpc("start_treatment", { p_member: m.id });
    await rpc("save_treatment", {
      p_treatment: t,
      p_services: [service],
      p_price: 42,
      p_material: 0,
      p_notes: "",
      p_finish: true,
    });
    await expect(
      rpc("record_payment", { p_treatment: t, p_data: { status: "Bezahlt" } }),
    ).rejects.toThrow();
    await as(O);
    await rpc("set_member_permissions", {
      p_member: employeeMember,
      p_permissions: { record_payments: true },
    });
    await as(E);
    await rpc("record_payment", {
      p_treatment: t,
      p_data: { status: "Bezahlt" },
    });
    await expect(
      rpc("record_payment", {
        p_treatment: treatment,
        p_data: { status: "Bezahlt" },
      }),
    ).rejects.toThrow();
    const payments = (await rpc("employee_snapshot")).treatment_payments;
    expect(payments).toHaveLength(1);
    expect(payments[0].billing_name_snapshot).toBe("");
    expect(Number(payments[0].amount)).toBe(42);
  });
});
