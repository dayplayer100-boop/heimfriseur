import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const U = "00000000-0000-0000-0000-000000000001",
  V = "00000000-0000-0000-0000-000000000002";
let facility: string,
  group: string,
  service: string,
  customer: string,
  visit: string,
  member: string,
  treatment: string;
async function query<T = Record<string, any>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<T>(sql, args)).rows;
}
async function owner(id = U) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users(id) values('${U}'),('${V}');`,
  );
  const migration = readFileSync(
    "supabase/migrations/001_heimfriseur.sql",
    "utf8",
  ).replace("create extension if not exists pgcrypto;", "");
  await db.exec(migration);
  await owner();
}, 30000);
afterAll(() => db.close());
describe(
  "Supabase migration and real PostgreSQL workflow (local PGlite)",
  () => {
    it("creates all 11 tables and enables RLS", async () => {
      const r = await query(
        "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
      );
      expect(r).toHaveLength(11);
      expect(r.every((x: any) => x.relrowsecurity)).toBe(true);
    });
    it("initializes an account and default services idempotently", async () => {
      await query("select initialize_account()");
      await query("select initialize_account()");
      expect((await query("select * from services")).length).toBe(7);
      expect((await query("select * from profiles")).length).toBe(1);
    });
    it("creates facility, group, service and a customer with defaults", async () => {
      facility = (
        await query(
          "insert into facilities(user_id,name) values($1,$2) returning id",
          [U, "Testheim"],
        )
      )[0].id;
      group = (
        await query(
          "insert into groups(user_id,facility_id,name,recurrence_weeks) values($1,$2,$3,5) returning id",
          [U, facility, "Wohnbereich A"],
        )
      )[0].id;
      service = (
        await query(
          "insert into services(user_id,name,price,duration_minutes) values($1,$2,25,30) returning id",
          [U, "Schneiden"],
        )
      )[0].id;
      customer = (
        await query("select save_customer($1::jsonb,$2::uuid[]) id", [
          JSON.stringify({
            facility_id: facility,
            group_id: group,
            first_name: "Test",
            last_name: "Kunde",
            room_number: "115",
          }),
          [service],
        ])
      )[0].id;
      expect(
        (
          await query(
            "select * from customer_default_services where customer_id=$1",
            [customer],
          )
        )[0].service_id,
      ).toBe(service);
    });
    it("plans a recurring visit and includes active customers", async () => {
      visit = (
        await query("select plan_visit($1,'2026-10-06','09:00',5,true) id", [
          group,
        ])
      )[0].id;
      member = (
        await query(
          "select id from appointment_customers where appointment_id=$1",
          [visit],
        )
      )[0].id;
      expect(member).toBeTruthy();
    });
    it("starts a single treatment and snapshots the price", async () => {
      treatment = (await query("select start_treatment($1) id", [member]))[0]
        .id;
      const duplicate = (
        await query("select start_treatment($1) id", [member])
      )[0].id;
      expect(duplicate).toBe(treatment);
      expect(
        (
          await query(
            "select price_snapshot from treatment_services where treatment_id=$1",
            [treatment],
          )
        )[0].price_snapshot,
      ).toBe("25.00");
      await query("update services set price=28 where id=$1", [service]);
      expect(
        (
          await query(
            "select price_snapshot from treatment_services where treatment_id=$1",
            [treatment],
          )
        )[0].price_snapshot,
      ).toBe("25.00");
    });
    it("persists timer, override, material and formula, then completes customer", async () => {
      await query(
        "update treatments set start_time=now()-interval '33 minutes' where id=$1",
        [treatment],
      );
      await query(
        "select save_treatment($1,$2::uuid[],24,8.2,$3,$4::jsonb,true)",
        [
          treatment,
          [service],
          "Interne Notiz",
          JSON.stringify({
            product: "Testfarbe",
            color_1: "7/0",
            color_1_amount: 30,
          }),
        ],
      );
      const t = (
        await query("select * from treatments where id=$1", [treatment])
      )[0];
      expect(Number(t.total_price)).toBe(24);
      expect(Number(t.material_cost)).toBe(8.2);
      expect(Number(t.duration_minutes)).toBeGreaterThanOrEqual(33);
      expect(
        (
          await query("select status from appointment_customers where id=$1", [
            member,
          ])
        )[0].status,
      ).toBe("Erledigt");
      expect(
        (
          await query(
            "select customer_id from color_formulas where treatment_id=$1",
            [treatment],
          )
        )[0].customer_id,
      ).toBe(customer);
    });
    it("adds a spontaneous customer and skips them without revenue", async () => {
      const c = (
        await query("select save_customer($1::jsonb,$2::uuid[]) id", [
          JSON.stringify({
            facility_id: facility,
            group_id: group,
            first_name: "Zweiter",
            last_name: "Kunde",
          }),
          [],
        ])
      )[0].id;
      await query("select add_visit_customer($1,$2)", [visit, c]);
      const m = (
        await query(
          "select id from appointment_customers where appointment_id=$1 and customer_id=$2",
          [visit, c],
        )
      )[0].id;
      await query("select skip_customer($1,'Nicht anwesend')", [m]);
      expect(
        (
          await query(
            "select count(*) n from treatments where appointment_id=$1",
            [visit],
          )
        )[0].n,
      ).toBe(1);
    });
    it("closes visit and creates exactly one next visit after 5 weeks", async () => {
      const next = (await query("select close_visit($1) id", [visit]))[0].id;
      const same = (await query("select close_visit($1) id", [visit]))[0].id;
      expect(same).toBe(next);
      const a = (
        await query("select * from appointments where id=$1", [next])
      )[0];
      expect(new Date(a.appointment_date).toISOString().slice(0, 10)).toBe(
        "2026-11-10",
      );
      expect(
        (await query("select status from appointments where id=$1", [visit]))[0]
          .status,
      ).toBe("Abgeschlossen");
      expect((await query("select count(*) n from appointments"))[0].n).toBe(2);
    });
    it("rejects negative amounts, history deletion and mutations to operational tables", async () => {
      await expect(
        query(
          "insert into services(user_id,name,price,duration_minutes) values($1,$2,-1,20)",
          [U, "Invalid"],
        ),
      ).rejects.toThrow();
      await expect(
        query("delete from customers where id=$1", [customer]),
      ).rejects.toThrow();
      await db.exec("set role authenticated");
      await expect(
        query("update treatments set total_price=999 where id=$1", [treatment]),
      ).rejects.toThrow();
      await db.exec("reset role");
    });
    it("isolates two users using RLS and rejects cross-owner parent links", async () => {
      await owner(V);
      await db.exec("set role authenticated");
      expect(await query("select * from facilities")).toHaveLength(0);
      expect(await query("select * from treatments")).toHaveLength(0);
      await expect(
        query("insert into groups(user_id,facility_id,name) values($1,$2,$3)", [
          V,
          facility,
          "Fremd",
        ]),
      ).rejects.toThrow();
      await expect(
        query("select start_treatment($1)", [member]),
      ).rejects.toThrow();
      await expect(
        query("select save_customer($1::jsonb,$2::uuid[])", [
          JSON.stringify({
            id: customer,
            facility_id: facility,
            group_id: group,
            first_name: "Fremd",
            last_name: "User",
          }),
          [],
        ]),
      ).rejects.toThrow();
      await db.exec("reset role");
      await owner();
    });
    it("prevents access through anonymous RPCs", async () => {
      await db.exec("set role anon");
      await expect(query("select close_visit($1)", [visit])).rejects.toThrow();
      await db.exec("reset role");
    });
    it("moves this and future visits while keeping completed history unchanged", async () => {
      const current = (
        await query(
          "select * from appointments where status='Geplant' order by appointment_date limit 1",
        )
      )[0];
      const second = (
        await query("select plan_visit($1,'2026-12-15','09:00',5,true,$2) id", [
          group,
          current.recurrence_series_id,
        ])
      )[0].id;
      await query("select move_visit($1,'2026-12-15','10:00',true)", [
        current.id,
      ]);
      expect(
        new Date(
          (
            await query(
              "select appointment_date from appointments where id=$1",
              [current.id],
            )
          )[0].appointment_date,
        )
          .toISOString()
          .slice(0, 10),
      ).toBe("2026-12-15");
      expect(
        new Date(
          (
            await query(
              "select appointment_date from appointments where id=$1",
              [second],
            )
          )[0].appointment_date,
        )
          .toISOString()
          .slice(0, 10),
      ).toBe("2027-01-19");
      expect(
        new Date(
          (
            await query(
              "select appointment_date from appointments where id=$1",
              [visit],
            )
          )[0].appointment_date,
        )
          .toISOString()
          .slice(0, 10),
      ).toBe("2026-10-06");
      await expect(
        query("select move_visit($1,'2026-12-20','10:00',false)", [visit]),
      ).rejects.toThrow();
    });
    it("rejects an unfinished visit and a second simultaneous treatment", async () => {
      const a = (
        await query(
          "select id from appointments where status='Verschoben' order by appointment_date limit 1",
        )
      )[0].id;
      await expect(query("select close_visit($1)", [a])).rejects.toThrow();
      const ms = await query(
        "select id from appointment_customers where appointment_id=$1 order by sort_order",
        [a],
      );
      await query("select start_treatment($1)", [ms[0].id]);
      await expect(
        query("select start_treatment($1)", [ms[1].id]),
      ).rejects.toThrow();
    });
  },
);
