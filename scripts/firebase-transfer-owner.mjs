// Operator-only IAM operation. Atomic, revision-checked; no browser keys.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2);
const option = (key) =>
  args.includes(key) ? args[args.indexOf(key) + 1] || "" : "";
const project = option("--project"),
  from = option("--from-admin").trim().toLowerCase(),
  to = option("--to-owner").trim().toLowerCase(),
  emulator = args.includes("--emulator");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
if (
  !/^[a-z][a-z0-9-]{4,62}$/.test(project) ||
  !validEmail(from) ||
  !validEmail(to) ||
  from === to ||
  (emulator && !project.startsWith("demo-"))
) {
  console.error(
    "Aufruf: node scripts/firebase-transfer-owner.mjs --project heimfriseur-dayplayer100 --from-admin admin@example.de --to-owner chef@example.de",
  );
  process.exit(1);
}
try {
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
  const base = emulator
    ? "http://127.0.0.1:8080/v1/"
    : "https://firestore.googleapis.com/v1/";
  const documents = `projects/${project}/databases/(default)/documents`;
  async function request(url, body, missing = false) {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (missing && r.status === 404) return null;
    if (!r.ok)
      throw Error(
        `Firebase-Zugriff fehlgeschlagen (${r.status}). Betreiberberechtigungen prüfen.`,
      );
    return r.json();
  }
  const get = (path) => request(base + documents + "/" + path, null, true);
  async function all(path) {
    const rows = [];
    let page = "";
    do {
      const result = await request(
        base +
          documents +
          "/" +
          path +
          "?pageSize=1000" +
          (page ? "&pageToken=" + encodeURIComponent(page) : ""),
      );
      rows.push(...(result.documents || []));
      page = result.nextPageToken || "";
    } while (page);
    return rows;
  }
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
    throw Error("Nicht unterstützter Datentyp. Keine Änderung vorgenommen.");
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
          Object.entries(v).map(([k, v]) => [k, encode(v)]),
        ),
      },
    };
  }
  const row = (doc) =>
    doc
      ? Object.fromEntries(
          Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)]),
        )
      : null;
  const authBase = emulator
    ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com"
    : "https://identitytoolkit.googleapis.com";
  const lookup = await request(
    `${authBase}/v1/projects/${project}/accounts:lookup`,
    { email: [from, to] },
  );
  const user = (email) =>
    lookup.users?.find((u) => u.email?.toLowerCase() === email);
  const oldUser = user(from),
    newUser = user(to);
  if (
    !oldUser?.emailVerified ||
    oldUser.disabled ||
    !newUser?.emailVerified ||
    newUser.disabled
  )
    throw Error(
      "Beide Konten müssen zuerst in Firebase registriert, aktiv und bestätigt sein. Keine Änderung vorgenommen.",
    );
  const oldUid = oldUser.localId,
    newUid = newUser.localId;
  if (/[\/]/.test(oldUid + newUid))
    throw Error("Ungültige Konto-ID. Keine Änderung vorgenommen.");
  const registry = await get(`hf_admins/${oldUid}`);
  if (!row(registry)?.is_active)
    throw Error(
      "Das bisherige Konto muss bereits App-Admin sein. Keine Änderung vorgenommen.",
    );
  const oldAccount = await get(`hf_accounts/${oldUid}`),
    newAccount = await get(`hf_accounts/${newUid}`);
  const businessId = row(oldAccount)?.business_id;
  if (!businessId || /[\/]/.test(businessId))
    throw Error(
      "Das bisherige Unternehmen wurde nicht gefunden. Keine Änderung vorgenommen.",
    );
  const businessPath = `hf_businesses/${businessId}`,
    business = await get(businessPath),
    company = row(business);
  if (
    company?.owner_user_id === newUid &&
    row(newAccount)?.business_id === businessId
  ) {
    console.log(`${to} ist bereits Geschäftsführer. ${from} bleibt App-Admin.`);
    process.exit(0);
  }
  if (
    company?.owner_user_id !== oldUid ||
    company._migration_state === "in_progress"
  )
    throw Error(
      "Die bestehende Geschäftsführerzuordnung passt nicht zum Auftrag. Keine Änderung vorgenommen.",
    );
  const revision = await get(businessPath + "/state/revision");
  if (!revision)
    throw Error("Unternehmensrevision fehlt. Keine Änderung vorgenommen.");
  const records = await all(businessPath + "/records"),
    billing = [
      ...(await all(businessPath + "/billing")),
      ...(await all(businessPath + "/payment_contacts")),
    ],
    members = await all(businessPath + "/members");
  const finance = await all(businessPath + "/finance");
  if (
    records.some((d) => row(d)._table === "treatments" && !row(d).end_time) ||
    finance.some((d) => row(d).completed === false)
  )
    throw Error(
      "Bitte zuerst alle laufenden Behandlungen beenden. Keine Änderung vorgenommen.",
    );
  const writes = [];
  writes.push({
    update: { name: registry.name, fields: registry.fields },
    currentDocument: { updateTime: registry.updateTime },
  });
  function put(path, data, old, fields) {
    writes.push({
      update: {
        name: documents + "/" + path,
        fields: encode(data).mapValue.fields,
      },
      ...(fields ? { updateMask: { fieldPaths: fields } } : {}),
      currentDocument: old ? { updateTime: old.updateTime } : { exists: false },
    });
  }
  function remove(doc) {
    writes.push({
      delete: doc.name,
      currentDocument: { updateTime: doc.updateTime },
    });
  }
  // A freshly auto-created empty company may be removed. Never discard a company
  // with business records, colleagues, invitations, billing or history.
  const target = row(newAccount)?.business_id;
  if (target && target !== businessId) {
    if (target !== newUid)
      throw Error(
        "Das neue Konto gehört bereits zu einer anderen Firma. Keine Änderung vorgenommen.",
      );
    const path = `hf_businesses/${target}`,
      placeholder = await get(path);
    if (
      row(placeholder)?.owner_user_id !== newUid ||
      row(placeholder)?._migration_state === "in_progress"
    )
      throw Error(
        "Die neue Firmenzuordnung muss geprüft werden. Keine Änderung vorgenommen.",
      );
    const emptyRecords = await all(path + "/records"),
      emptyMembers = await all(path + "/members");
    const invites = await request(base + documents + ":runQuery", {
      structuredQuery: {
        from: [{ collectionId: "hf_invites" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "business_id" },
            op: "EQUAL",
            value: { stringValue: target },
          },
        },
      },
    });
    if (
      emptyRecords.some((d) => row(d)._table !== "profiles") ||
      emptyMembers.some((d) => row(d).user_id !== newUid) ||
      (await all(path + "/finance")).length ||
      (await all(path + "/billing")).length ||
      (await all(path + "/payment_contacts")).length ||
      invites.some((d) => d.document)
    )
      throw Error(
        "Die neue Firma enthält bereits Daten oder Einladungen. Keine Änderung vorgenommen; keine automatische Zusammenführung.",
      );
    const nested = await request(
      base + documents + "/" + path + ":listCollectionIds",
      {},
    );
    if (
      (nested.collectionIds || []).some(
        (id) =>
          !["records", "members", "state", "catalogue", "audit"].includes(id),
      )
    )
      throw Error(
        "Die neue Firma enthält zusätzliche Daten. Keine Änderung vorgenommen.",
      );
    for (const collection of [
      "records",
      "members",
      "state",
      "catalogue",
      "audit",
    ]) {
      for (const d of await all(path + "/" + collection)) remove(d);
    }
    remove(placeholder);
  }
  for (const d of [...records, ...billing]) {
    const value = row(d);
    value.user_id = newUid;
    value.business_id = businessId;
    if (value.service_snapshots)
      for (const line of value.service_snapshots) {
        if (line.user_id === oldUid) line.user_id = newUid;
      }
    if (value._table === "profiles" && value.email === from) value.email = to;
    if (value._table === "appointments") {
      if (value.assigned_users?.includes(oldUid))
        value.assigned_users = [
          ...new Set(
            value.assigned_users.map((id) => (id === oldUid ? newUid : id)),
          ),
        ];
      if (value.responsible_user === oldUid) value.responsible_user = newUid;
    }
    put(d.name.slice(documents.length + 1), value, d);
  }
  const targetMember = members.find((d) => row(d).user_id === newUid);
  const oldMember = members.find((d) => row(d).user_id === oldUid);
  if (oldMember) remove(oldMember);
  put(
    businessPath + `/members/${newUid}`,
    {
      id: newUid,
      user_id: newUid,
      business_id: businessId,
      role: "owner",
      display_name: row(targetMember)?.display_name || to,
      is_active: true,
      facility_ids: [],
      permissions: {},
      onboarding_completed: row(targetMember)?.onboarding_completed || false,
      setup_completed: row(targetMember)?.setup_completed || false,
    },
    targetMember,
  );
  put(`hf_accounts/${newUid}`, { business_id: businessId }, newAccount);
  put(businessPath, { owner_user_id: newUid, owner_email: to }, business, [
    "owner_user_id",
    "owner_email",
  ]);
  put(
    businessPath + "/state/revision",
    { value: row(revision).value + 1 },
    revision,
  );
  put(
    `hf_admin_audit/${randomUUID()}`,
    {
      actor_id: "operator:cloud-shell",
      action: "business_owner_transferred",
      business_id: businessId,
      created_at: new Date().toISOString(),
      details: {
        previous_owner: oldUid,
        new_owner: newUid,
        admin_email: from,
        owner_email: to,
        preserved_records: records.length,
        preserved_billing: billing.length,
      },
    },
    null,
  );
  if (
    writes.length > 350 ||
    Buffer.byteLength(JSON.stringify({ writes })) > 7_000_000
  )
    throw Error(
      "Zu viele Daten für eine sichere Einzeltransaktion. Keine Änderung vorgenommen; separate Übertragung erforderlich.",
    );
  await request(
    base + `projects/${project}/databases/(default)/documents:commit`,
    { writes },
  );
  const verified = row(await get(businessPath)),
    account = row(await get(`hf_accounts/${newUid}`));
  if (verified.owner_user_id !== newUid || account.business_id !== businessId)
    throw Error(
      "Abschlussprüfung fehlgeschlagen. Bitte Betreiber-Dashboard prüfen.",
    );
  console.log(
    `Übernahme erfolgreich: ${to} ist Geschäftsführer; ${from} bleibt ausschließlich App-Admin.`,
  );
  console.log(
    `Erhalten: ${records.length} Geschäftsdokumente, ${billing.length} Rechnungskontakte und ${finance.length} Finanzdokumente. Beide Konten bitte ab-/anmelden.`,
  );
} catch (error) {
  console.error(
    error.message?.includes("vorgenommen") ||
      error.message?.startsWith("Firebase-") ||
      error.message?.includes("Abschlussprüfung")
      ? error.message
      : "Betreiberzugriff fehlgeschlagen. Befehl in der angemeldeten Google Cloud Shell ausführen; keine Schlüssel senden.",
  );
  process.exitCode = 1;
}
