import { eurosToCents, checkedCents } from "./money";
type Json = Record<string, any>;
function cents(row: Json, oldKey: string, newKey: string, nullable = false) {
  const old = row[oldKey],
    current = row[newKey];
  if (
    current !== undefined &&
    old !== undefined &&
    (nullable && old === null
      ? current !== null
      : eurosToCents(old) !== current)
  )
    throw Error("Widersprüchliche Euro-/Centfelder.");
  row[newKey] =
    current !== undefined
      ? current === null && nullable
        ? null
        : checkedCents(current)
      : old === null && nullable
        ? null
        : eurosToCents(old);
  delete row[oldKey];
}
export function financeMigrationPlan(
  data: Record<string, Json[]>,
  business: Json,
) {
  const records = structuredClone(data.records),
    finance = structuredClone(data.finance),
    catalogue = structuredClone(data.catalogue),
    members = structuredClone(data.members);
  for (const r of records)
    if (["services", "facility_service_prices"].includes(r._table))
      cents(r, "price", "price_cents");
  for (const f of finance) {
    cents(f, "total_price", "total_cents");
    cents(f, "material_cost", "material_cents");
    if (f.override_cents === undefined && f.price_override === undefined)
      f.price_override = null;
    cents(f, "price_override", "override_cents", true);
    for (const line of f.lines || []) cents(line, "price", "price_cents");
    if (
      f.override_cents === null &&
      f.total_cents !==
        (f.lines || []).reduce((s: number, l: Json) => s + l.price_cents, 0)
    )
      throw Error("Historische Summe stimmt nicht mit Leistungen überein.");
  }
  for (const c of catalogue) {
    for (const svc of Object.values(c.services || {}) as Json[])
      cents(svc, "price", "price_cents");
    // Schema marker disambiguates already migrated plain-map prices.
    if (business.finance_schema !== 3)
      for (const id of Object.keys(c.prices || {}))
        c.prices[id] = eurosToCents(c.prices[id]);
  }
  const chief = members.find((m) => m.user_id === business.owner_user_id);
  if (!chief || chief.is_active !== true)
    throw Error(
      "Aktive Geschäftsführung fehlt: Betreiber muss Zuordnung prüfen.",
    );
  for (const member of members)
    member.role =
      member.user_id === business.owner_user_id ? "owner" : "employee";
  return { records, finance, catalogue, members };
}
