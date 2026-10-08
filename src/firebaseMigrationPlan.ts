import { visitShard, treatmentTimes } from "./firebaseWorkflow";
type Json = Record<string, any>;
export function workflowMigrationPlan(
  records: Json[],
  finances: Json[],
  contacts: Json[],
) {
  const rows = structuredClone(records),
    money = structuredClone(finances),
    protectedContacts = structuredClone(contacts);
  const memberIds = new Map<string, string>(),
    treatmentIds = new Map<string, string>();
  const seen = new Set<string>();
  for (const m of rows.filter((r) => r._table === "appointment_customers")) {
    if (
      !rows.some(
        (r) => r._table === "appointments" && r.id === m.appointment_id,
      ) ||
      !rows.some((r) => r._table === "customers" && r.id === m.customer_id)
    )
      throw Error("Besuchskunde ohne gültigen Besuch oder Kunden.");
    const id = `${m.appointment_id}:${m.customer_id}`;
    if (seen.has(id))
      throw Error("Doppelte Kunden im Besuch: manuelle Prüfung erforderlich.");
    seen.add(id);
    memberIds.set(m.id, id);
    m.id = id;
    m.guard_shard = visitShard(id);
  }
  for (const t of rows.filter((r) => r._table === "treatments")) {
    const id = memberIds.get(t.appointment_customer_id);
    if (!id || [...treatmentIds.values()].includes(id))
      throw Error("Behandlung ohne eindeutigen Besuchskunden.");
    treatmentIds.set(t.id, id);
    t.id = id;
    t.appointment_customer_id = id;
    if ("start_time" in t)
      Object.assign(t, treatmentTimes(t.start_time, t.end_time));
    if (
      !Number.isSafeInteger(t.start_ms) ||
      t.start_ms < 0 ||
      (t.end_ms !== null &&
        (!Number.isSafeInteger(t.end_ms) || t.end_ms < t.start_ms))
    )
      throw Error("Ungültige historische Behandlungszeiten.");
    if (
      "duration_minutes" in t &&
      t.duration_minutes !== null &&
      (!Number.isFinite(t.duration_minutes) || t.duration_minutes < 0)
    )
      throw Error("Negative/ungültige historische Dauer.");
    t.duration_ms = t.end_ms === null ? null : t.end_ms - t.start_ms;
    if (t.duration_ms !== null && t.duration_ms > 604800000)
      throw Error("Behandlung länger als sieben Tage: manuelle Prüfung.");
    delete t.start_time;
    delete t.end_time;
    delete t.duration_minutes;
  }
  for (const row of [...rows, ...money, ...protectedContacts]) {
    if (row.treatment_id)
      row.treatment_id = treatmentIds.get(row.treatment_id) || row.treatment_id;
  }
  const guards = new Map<string, Json>(),
    locks = new Map<string, Json>();
  for (const a of rows.filter((r) => r._table === "appointments")) {
    if ("actual_start_time" in a) {
      const times = a.actual_start_time
        ? treatmentTimes(a.actual_start_time, a.actual_end_time ?? null)
        : { start_ms: null, end_ms: null };
      if (!a.actual_start_time && a.actual_end_time)
        throw Error("Besuchsende ohne Beginn.");
      a.actual_start_ms = times.start_ms;
      a.actual_end_ms = times.end_ms;
      delete a.actual_start_time;
      delete a.actual_end_time;
    }
    const members = rows.filter(
      (r) => r._table === "appointment_customers" && r.appointment_id === a.id,
    );
    if (
      a.status === "Abgeschlossen" &&
      members.some((m) => ["Offen", "In Behandlung"].includes(m.status))
    )
      throw Error(
        "Abgeschlossener Besuch hat offene Kunden: zuerst fachlich korrigieren.",
      );
    for (let shard = 0; shard < 6; shard++)
      guards.set(`${a.id}~${shard}`, {
        appointment_id: a.id,
        shard,
        _facility_id: a._facility_id,
        pending_ids: members
          .filter(
            (m) =>
              m.guard_shard === shard &&
              ["Offen", "In Behandlung"].includes(m.status),
          )
          .map((m) => m.id)
          .sort(),
      });
  }
  for (const t of rows.filter((r) => r._table === "treatments")) {
    const m = rows.find(
      (r) =>
        r._table === "appointment_customers" &&
        r.id === t.appointment_customer_id,
    );
    const a = rows.find(
      (r) => r._table === "appointments" && r.id === t.appointment_id,
    );
    const f = money.find((f) => f.treatment_id === t.id);
    if (
      !m ||
      !a ||
      m.appointment_id !== a.id ||
      m.customer_id !== t.customer_id ||
      !f ||
      f.completed !== (t.end_ms !== null) ||
      !t.performed_by
    )
      throw Error(
        "Kundenstatus, Behandlung oder Finanzabschluss inkonsistent.",
      );
    if (
      (t.end_ms === null &&
        (m.status !== "In Behandlung" || a.status === "Abgeschlossen")) ||
      (t.end_ms !== null && m.status !== "Erledigt")
    )
      throw Error("Behandlung und Kundenstatus stimmen nicht überein.");
    if (t.end_ms === null)
      for (const id of [
        `actor:${t.performed_by}`,
        `customer:${t.customer_id}`,
      ]) {
        if (locks.has(id))
          throw Error(
            "Mehrere laufende Behandlungen für denselben Mitarbeiter/Kunden.",
          );
        locks.set(id, { treatment_id: t.id, performed_by: t.performed_by });
      }
  }
  for (const m of rows.filter((r) => r._table === "appointment_customers")) {
    const t = rows.find((r) => r._table === "treatments" && r.id === m.id);
    if (
      (m.status === "Erledigt" && (!t || t.end_ms === null)) ||
      (m.status === "In Behandlung" && (!t || t.end_ms !== null))
    )
      throw Error("Besuchskunde ohne passende Behandlung.");
  }
  for (const f of money)
    if (!rows.some((r) => r._table === "treatments" && r.id === f.treatment_id))
      throw Error("Finanzdatensatz ohne Behandlung.");
  return { rows, money, protectedContacts, guards, locks };
}
