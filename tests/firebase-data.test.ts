import { describe, it, expect } from "vitest";
import { demoSeed } from "../src/demo";
import {
  splitFirebaseData,
  joinFirebaseData,
  sameFirebaseDocument,
} from "../src/firebaseData";
import { emptyData, type Data } from "../src/types";

describe("Firebase data preservation and financial separation", () => {
  it("round-trips every source field, including historic prices, billing and color recipes", () => {
    const data = demoSeed();
    const customer = data.customers[0],
      appointment = data.appointments[0],
      member = data.appointment_customers[0];
    data.treatments.push({
      id: "history",
      user_id: "demo",
      appointment_id: appointment.id,
      appointment_customer_id: member.id,
      customer_id: customer.id,
      start_time: "2026-10-06T07:00:00Z",
      end_time: "2026-10-06T07:32:00Z",
      duration_minutes: 32,
      total_price: 40,
      material_cost: 8.2,
      price_override: 40,
      notes: "Interne Notiz",
      performed_by: "former-staff",
    });
    data.treatment_services.push({
      id: "snapshot",
      user_id: "demo",
      treatment_id: "history",
      service_id: data.services[0].id,
      service_name_snapshot: "Historischer Leistungsname",
      price_snapshot: 25,
      duration_minutes_snapshot: 30,
    });
    data.customer_billing.push({
      id: "billing",
      user_id: "demo",
      customer_id: customer.id,
      billing_name: "Beispiel Betreuer",
      street: "Testweg",
      postal_code: "12345",
      city: "Teststadt",
      phone: "",
      email: "contact@test.invalid",
      payment_method_id: data.payment_methods[0].id,
      delivery: "Post",
    });
    data.treatment_payments.push({
      id: "payment",
      user_id: "demo",
      treatment_id: "history",
      payment_method_id: data.payment_methods[0].id,
      status: "Offen",
      amount: 40,
      method_name_snapshot: "Barzahlung",
      billing_name_snapshot: "Beispiel Betreuer",
      billing_address_snapshot: "Testweg",
      delivery: "Post",
      recorded_by: "former-staff",
      recorded_at: "2026-10-06T07:32:00Z",
    });
    data.color_formulas.push({
      id: "color",
      user_id: "demo",
      customer_id: customer.id,
      treatment_id: "history",
      product: "Beispielprodukt",
      color_1: "7/3",
      color_1_amount: 30,
      color_2: "8/0",
      color_2_amount: 10,
      color_3: "",
      color_3_amount: 0,
      developer_strength: "6%",
      developer_amount: 40,
      processing_time_minutes: 30,
      notes: "Historische Rezeptur",
      formula_date: "2026-10-06",
    });
    const { records, finances, paymentContacts } = splitFirebaseData(
      data,
      "test-company",
      "demo",
    );
    const restored = joinFirebaseData(
      [...records.values()],
      [...finances.values()],
      [...paymentContacts.values()],
    );
    for (const table of Object.keys(emptyData()) as (keyof Data)[]) {
      expect(restored[table]).toHaveLength(data[table].length);
      for (const original of data[table]) {
        expect(
          restored[table].find((r) => r.id === original.id),
          `${table}/${original.id}`,
        ).toMatchObject(original);
      }
    }
    for (const row of records.values()) {
      expect(row).not.toHaveProperty("total_price");
      expect(row).not.toHaveProperty("material_cost");
      expect(row).not.toHaveProperty("amount");
      for (const line of row.service_snapshots || [])
        expect(line).not.toHaveProperty("price_snapshot");
    }
    const payment = records.get("treatment_payments~payment")!;
    expect(payment).not.toHaveProperty("billing_name_snapshot");
    expect(payment).not.toHaveProperty("billing_address_snapshot");
    expect(paymentContacts.get("payment")?.billing_name_snapshot).toBe(
      "Beispiel Betreuer",
    );
    const employee = joinFirebaseData([...records.values()], []);
    expect(employee.treatment_payments[0].billing_name_snapshot).toBe("");
    expect(employee.treatment_payments[0].billing_address_snapshot).toBe("");
    expect(employee.treatments[0].total_price).toBeNull();
    expect(employee.treatment_services[0].price_snapshot).toBeNull();
    expect(employee.treatment_services[0].service_name_snapshot).toBe(
      "Historischer Leistungsname",
    );
  });
});

describe("Firestore concurrent document checks", () => {
  it("accepts reordered map keys while detecting actual changes and ordered arrays", () => {
    const a = {
      email: "invite@test.invalid",
      business_id: "company",
      revoked_at: null,
      permissions: { edit_schedule: false, record_payments: true },
      facility_ids: ["one", "two"],
    };
    const b = {
      facility_ids: ["one", "two"],
      permissions: { record_payments: true, edit_schedule: false },
      revoked_at: null,
      business_id: "company",
      email: "invite@test.invalid",
    };
    expect(sameFirebaseDocument(a, b)).toBe(true);
    expect(
      sameFirebaseDocument(a, { ...b, revoked_at: "2026-10-07T08:00:00Z" }),
    ).toBe(false);
    expect(
      sameFirebaseDocument(a, { ...b, facility_ids: ["two", "one"] }),
    ).toBe(false);
    expect(sameFirebaseDocument(a, undefined)).toBe(false);
  });
});
