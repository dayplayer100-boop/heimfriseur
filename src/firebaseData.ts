import { emptyData, type Data, type Table } from "./types";
type Json = Record<string, any>;
const tables = Object.keys(emptyData()) as Table[];
const clean = (value: unknown): any => JSON.parse(JSON.stringify(value));
export const firebaseRecordId = (table: string, id: string) => `${table}~${id}`;
export function splitFirebaseData(
  data: Data,
  businessId: string,
  ownerId: string,
) {
  const records = new Map<string, Json>(),
    finances = new Map<string, Json>(),
    paymentContacts = new Map<string, Json>();
  const facility = (table: Table, row: Json): string => {
    if (table === "facilities") return row.id;
    if (row.facility_id) return row.facility_id;
    if (row.customer_id)
      return (
        data.customers.find((c) => c.id === row.customer_id)?.facility_id || ""
      );
    if (row.appointment_id)
      return (
        data.appointments.find((a) => a.id === row.appointment_id)
          ?.facility_id || ""
      );
    if (row.treatment_id)
      return facility(
        "treatments",
        data.treatments.find((t) => t.id === row.treatment_id) || {},
      );
    return "";
  };
  for (const table of tables)
    for (const row of data[table]) {
      if (table === "treatment_services") continue;
      const out: Json = {
        ...row,
        business_id: businessId,
        user_id: ownerId,
        _table: table,
        _facility_id: facility(table, row),
      };
      if (table === "treatments") {
        out.service_snapshots = data.treatment_services
          .filter((s) => s.treatment_id === row.id)
          .map(({ price_snapshot: _price, ...line }) => line);
        for (const key of ["total_price", "material_cost", "price_override"])
          delete out[key];
      }
      if (table === "treatment_payments") {
        const name = String(out.billing_name_snapshot || "");
        const address = String(out.billing_address_snapshot || "");
        if (name || address)
          paymentContacts.set(row.id, {
            id: row.id,
            treatment_id: out.treatment_id,
            business_id: businessId,
            user_id: ownerId,
            _facility_id: out._facility_id,
            billing_name_snapshot: name,
            billing_address_snapshot: address,
          });
        delete out.amount;
        delete out.billing_name_snapshot;
        delete out.billing_address_snapshot;
      }
      records.set(firebaseRecordId(table, row.id), clean(out));
    }
  for (const t of data.treatments) {
    finances.set(
      t.id,
      clean({
        treatment_id: t.id,
        total_price: t.total_price,
        material_cost: t.material_cost,
        price_override: t.price_override ?? null,
        completed: !!t.end_time,
        performed_by: t.performed_by || ownerId,
        service_ids: data.treatment_services
          .filter((s) => s.treatment_id === t.id)
          .map((s) => s.service_id),
        lines: data.treatment_services
          .filter((s) => s.treatment_id === t.id)
          .map((s) => ({
            service_id: s.service_id,
            name: s.service_name_snapshot,
            price: s.price_snapshot,
            duration: s.duration_minutes_snapshot,
          })),
      }),
    );
  }
  return { records, finances, paymentContacts };
}
export function joinFirebaseData(
  records: Json[],
  finances: Json[],
  paymentContacts: Json[] = [],
): Data {
  const data = emptyData();
  for (const record of records)
    if (tables.includes(record._table)) {
      const { _table, _facility_id, ...row } = record;
      (data[_table as Table] as Json[]).push(row);
    }
  for (const payment of data.treatment_payments) {
    const contact = paymentContacts.find(
      (c) => c.id === payment.id && c.treatment_id === payment.treatment_id,
    );
    payment.billing_name_snapshot = contact?.billing_name_snapshot || "";
    payment.billing_address_snapshot = contact?.billing_address_snapshot || "";
  }
  for (const t of data.treatments) {
    const snapshots = (t as unknown as Json).service_snapshots || [];
    data.treatment_services.push(...clean(snapshots));
    delete (t as unknown as Json).service_snapshots;
    const fin = finances.find((f) => f.treatment_id === t.id);
    Object.assign(t, {
      total_price: fin?.total_price ?? null,
      material_cost: fin?.material_cost ?? null,
      price_override: fin?.price_override ?? null,
    });
    for (const line of data.treatment_services.filter(
      (s) => s.treatment_id === t.id,
    ))
      line.price_snapshot =
        fin?.lines.find((l: Json) => l.service_id === line.service_id)?.price ??
        null;
    for (const p of data.treatment_payments.filter(
      (p) => p.treatment_id === t.id,
    ))
      p.amount = fin?.total_price ?? null;
  }
  return data;
}
export function assertFirebaseData(data: Data) {
  for (const table of tables) {
    const ids = new Set<string>();
    for (const row of data[table] as Json[]) {
      if (!row.id || ids.has(row.id) || /[\/~]/.test(row.id))
        throw Error("Ungültiger oder doppelter Datensatz.");
      ids.add(row.id);
      for (const key of [
        "price",
        "total_price",
        "material_cost",
        "price_snapshot",
        "amount",
        "duration_minutes",
        "default_duration_minutes",
      ])
        if (row[key] != null && (!Number.isFinite(row[key]) || row[key] < 0))
          throw Error("Beträge und Dauer dürfen nicht negativ sein.");
      if (
        row.recurrence_weeks != null &&
        (!Number.isInteger(row.recurrence_weeks) ||
          row.recurrence_weeks < 1 ||
          row.recurrence_weeks > 104)
      )
        throw Error("Bitte einen Rhythmus zwischen 1 und 104 Wochen wählen.");
    }
  }
  const exists = (table: Table, id: string) =>
    (data[table] as Json[]).some((r) => r.id === id);
  for (const c of data.customers)
    if (
      !exists("facilities", c.facility_id) ||
      !data.groups.some(
        (g) => g.id === c.group_id && g.facility_id === c.facility_id,
      )
    )
      throw Error("Einrichtung und Gruppe passen nicht zusammen.");
  for (const g of data.groups)
    if (!exists("facilities", g.facility_id))
      throw Error("Einrichtung nicht gefunden.");
  for (const c of data.cohorts)
    if (
      !data.groups.some(
        (g) => g.id === c.group_id && g.facility_id === c.facility_id,
      )
    )
      throw Error("Gruppe der Untergruppe nicht gefunden.");
  for (const a of data.appointments) {
    if (
      !data.groups.some(
        (g) => g.id === a.group_id && g.facility_id === a.facility_id,
      )
    )
      throw Error("Gruppe des Besuchs nicht gefunden.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(a.appointment_date) ||
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(a.start_time)
    )
      throw Error("Datum oder Uhrzeit prüfen.");
  }
  for (const m of data.appointment_customers)
    if (
      !exists("appointments", m.appointment_id) ||
      !exists("customers", m.customer_id)
    )
      throw Error("Besuch oder Kunde nicht gefunden.");
  for (const t of data.treatments)
    if (
      !exists("customers", t.customer_id) ||
      !exists("appointment_customers", t.appointment_customer_id)
    )
      throw Error("Kunde oder Besuchsliste nicht gefunden.");
  for (const s of data.customer_default_services)
    if (
      !exists("customers", s.customer_id) ||
      !exists("services", s.service_id)
    )
      throw Error("Standardleistung nicht gefunden.");
  for (const s of data.treatment_services)
    if (
      !exists("treatments", s.treatment_id) ||
      !exists("services", s.service_id)
    )
      throw Error("Behandlungsleistung nicht gefunden.");
}

// Firestore reads may return map fields in a different insertion order. Compare
// values recursively; array order remains meaningful for assignments/services.
export function sameFirebaseDocument(a: unknown, b: unknown): boolean {
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
