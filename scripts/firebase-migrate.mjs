// Operator-only, dry-run by default. No passwords, auth tokens or real data are
// written into the repository. Firestore Admin REST uses Cloud Shell's IAM login.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
const args = process.argv.slice(2),
  value = (flag) => args[args.indexOf(flag) + 1];
if (!args.includes("--file") || !args.includes("--owner-email")) {
  console.error(
    "Aufruf: node scripts/firebase-migrate.mjs --file /sicherer/pfad/export.json --owner-email chef@example.de [--project heimfriseur-dayplayer100] [--uid-map /sicherer/pfad/zuordnung.json] [--apply]",
  );
  process.exit(1);
}
const project = args.includes("--project")
  ? value("--project")
  : "heimfriseur-dayplayer100";
if (!/^[a-z][a-z0-9-]{4,62}$/.test(project))
  throw Error("Ungültige Projekt-ID.");
const source = readFileSync(value("--file"), "utf8"),
  exported = JSON.parse(source),
  data = exported.data,
  team = exported.team;
if (exported.schema_version !== 2 || !data || !team?.business?.owner_user_id)
  throw Error(
    "Bitte den Unternehmens-Export aus Einstellungen verwenden (Schema-Version 2).",
  );
if (data.treatments?.some((t) => !t.end_time))
  throw Error("Bitte vor der Übertragung alle laufenden Behandlungen beenden.");
const module = await build({
  entryPoints: ["src/firebaseData.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { splitFirebaseData, assertFirebaseData } = await import(
  "data:text/javascript;base64," +
    Buffer.from(module.outputFiles[0].text).toString("base64")
);
assertFirebaseData(data);
const totals = () => ({
  customers: data.customers.length,
  visits: data.appointments.length,
  treatments: data.treatments.length,
  revenue: data.treatments
    .filter((t) => t.end_time)
    .reduce((n, t) => n + t.total_price, 0),
  material: data.treatments
    .filter((t) => t.end_time)
    .reduce((n, t) => n + t.material_cost, 0),
});
console.log("Quellprüfung bestanden:", totals());
console.log(
  "Quell-Hash (SHA-256):",
  createHash("sha256").update(source).digest("hex"),
);
if (!args.includes("--apply")) {
  console.log(
    "Nur geprüft. Keine Firebase- oder Supabase-Daten geändert. Mit --apply erfolgt der Import ausschließlich in ein leeres Firebase-Unternehmen.",
  );
  process.exit(0);
}
const emulator = args.includes("--emulator");
if (emulator && !project.startsWith("demo-"))
  throw Error("Emulator-Import nur mit Demo-Projekt-ID erlaubt.");
const token = emulator
  ? "owner"
  : execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
async function request(url, body) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  if (!r.ok)
    throw Error(
      `Firebase-Zugriff fehlgeschlagen (${r.status}). IAM-Berechtigungen und Projekt prüfen. Es wird kein privater Serverfehler ausgegeben.`,
    );
  return json;
}
const users = await request(
  `${emulator ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com"}/v1/projects/${project}/accounts:lookup`,
  { email: [value("--owner-email")] },
);
const user = users.users?.[0];
if (!user?.localId || !user.emailVerified)
  throw Error(
    "Der Geschäftsführer muss sich zuerst in der Firebase-Testversion registrieren und die E-Mail bestätigen.",
  );
const uid = user.localId,
  root = `projects/${project}/databases/(default)/documents/hf_businesses/${uid}`;
const base = emulator
  ? "http://127.0.0.1:8080/v1/"
  : "https://firestore.googleapis.com/v1/";
function decode(v) {
  if (v.nullValue !== undefined) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  if (v.mapValue)
    return Object.fromEntries(
      Object.entries(v.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]),
    );
  return v;
}
function encode(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
const business = await request(base + root);
if (business.fields.owner_user_id.stringValue !== uid)
  throw Error("Geschäftsführer-Zuordnung stimmt nicht. Abgebrochen.");
async function all(path) {
  const docs = [];
  let page = "";
  do {
    const result = await request(
      base +
        path +
        "?pageSize=1000" +
        (page ? "&pageToken=" + encodeURIComponent(page) : ""),
    );
    docs.push(...(result.documents || []));
    page = result.nextPageToken || "";
  } while (page);
  return docs;
}
const existing = await all(root + "/records");
if (existing.some((d) => !["profiles"].includes(d.fields._table?.stringValue)))
  throw Error(
    "Das Ziel enthält bereits Geschäftsdaten. Kein Überschreiben oder Zusammenführen ohne separate Prüfung.",
  );
if (
  (await all(root + "/finance")).length ||
  (await all(root + "/billing")).length
)
  throw Error(
    "Das Ziel enthält bereits Rechnungs- oder Finanzdaten. Abgebrochen.",
  );
const revision = await request(base + root + "/state/revision");
const mapping = args.includes("--uid-map")
  ? JSON.parse(readFileSync(value("--uid-map"), "utf8"))
  : {};
if (
  Object.values(mapping).some(
    (id) => typeof id !== "string" || /[\/~]/.test(id),
  )
)
  throw Error("UID-Zuordnung prüfen.");
mapping[team.business.owner_user_id] = uid;
const actor = (old) => mapping[old] || `legacy-${old}`;
for (const rows of Object.values(data))
  for (const row of rows) {
    row.user_id = uid;
    row.business_id = uid;
    for (const k of ["created_by", "performed_by", "recorded_by"])
      if (row[k]) row[k] = actor(row[k]);
  }
// App admins are never imported as employees. Historical actors remain identifiable
// through legacy IDs; staff get fresh, verified email invitations after migration.
for (const a of data.appointments) {
  a.assigned_users = [uid];
  a.responsible_user = uid;
}
const { records, finances } = splitFirebaseData(data, uid, uid);
const writes = [];
const set = (name, row) => ({
  update: { name, fields: encode(row).mapValue.fields },
});
for (const d of existing) writes.push({ delete: d.name });
for (const [id, row] of records)
  if (row._table === "customer_billing")
    writes.push(set(root + "/billing/" + row.id, row));
  else writes.push(set(root + "/records/" + id, row));
for (const [id, row] of finances)
  writes.push(set(root + "/finance/" + id, row));
writes.push(
  set(root + "/catalogue/main", {
    services: Object.fromEntries(
      data.services.map((s) => [
        s.id,
        {
          name: s.name,
          price: s.price,
          duration: s.duration_minutes,
          is_active: s.is_active,
        },
      ]),
    ),
    prices: Object.fromEntries(
      data.facility_service_prices.map((s) => [
        s.facility_id + ":" + s.service_id,
        s.price,
      ]),
    ),
  }),
);
writes.push(
  set(root + "/state/revision", {
    value: Number(revision.fields.value.integerValue) + 1,
  }),
);
// Marker blocks the UI until every batch and verification finishes. If the process
// stops, keep the original export: never delete Supabase or ignore this marker.
await request(
  base + `projects/${project}/databases/(default)/documents:commit`,
  {
    writes: [
      {
        update: {
          name: root,
          fields: encode({ _migration_state: "in_progress" }).mapValue.fields,
        },
        updateMask: { fieldPaths: ["_migration_state"] },
      },
    ],
  },
);
for (let offset = 0; offset < writes.length; offset += 350)
  await request(
    base + `projects/${project}/databases/(default)/documents:commit`,
    { writes: writes.slice(offset, offset + 350) },
  );
const savedRecords = await all(root + "/records"),
  savedFinance = await all(root + "/finance"),
  savedBilling = await all(root + "/billing");
const decoded = savedRecords.map((d) =>
  Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, decode(v)])),
);
const financial = savedFinance.map((d) =>
  Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, decode(v)])),
);
const expectedRecords = [...records.values()].filter(
  (r) => r._table !== "customer_billing",
);
if (
  savedRecords.length !== expectedRecords.length ||
  savedFinance.length !== finances.size ||
  savedBilling.length !== data.customer_billing.length
)
  throw Error(
    "Importprüfung fehlgeschlagen. Marker bleibt aktiv; Originaldaten behalten.",
  );
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : v;
const equal = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
for (const row of expectedRecords)
  if (
    !decoded.some(
      (r) => r.id === row.id && r._table === row._table && equal(r, row),
    )
  )
    throw Error("Ein Datensatz stimmt nicht überein. Marker bleibt aktiv.");
for (const [id, row] of finances)
  if (!financial.some((r) => r.treatment_id === id && equal(r, row)))
    throw Error(
      "Ein Finanzdatensatz stimmt nicht überein. Marker bleibt aktiv.",
    );
for (const row of data.customer_billing) {
  const remote = savedBilling.find((d) => d.name.endsWith("/" + row.id));
  if (
    !remote ||
    !equal(
      Object.fromEntries(
        Object.entries(remote.fields).map(([k, v]) => [k, decode(v)]),
      ),
      records.get("customer_billing~" + row.id),
    )
  )
    throw Error(
      "Rechnungsempfänger stimmt nicht überein. Marker bleibt aktiv.",
    );
}
await request(
  base + `projects/${project}/databases/(default)/documents:commit`,
  {
    writes: [
      {
        update: {
          name: root,
          fields: encode({
            _migration_state: "complete",
            name: data.profiles[0]?.business_name || team.business.name,
          }).mapValue.fields,
        },
        updateMask: { fieldPaths: ["_migration_state", "name"] },
      },
    ],
  },
);
console.log("Import und Vergleich erfolgreich:", totals());
console.log(
  "Supabase wurde nicht verändert. Mitarbeiter neu einladen und App-Admin separat anhand der Firebase-UID einrichten.",
);
