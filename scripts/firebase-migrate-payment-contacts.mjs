// Phase 1 operator migration. Dry-run by default; IAM only, never browser keys.
// Each contact relocation is atomic. Business remains locked until verification.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join, relative } from "node:path";
import { randomUUID, createHash } from "node:crypto";
const args = process.argv.slice(2);
const allowed = new Set([
  "--project",
  "--business",
  "--backup-dir",
  "--apply",
  "--resume",
  "--emulator",
]);
const valued = new Set(["--project", "--business", "--backup-dir"]);
const options = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!allowed.has(arg) || options[arg] !== undefined)
    throw Error("Unbekannte oder doppelte Option.");
  options[arg] = valued.has(arg) ? args[++i] : true;
  if (valued.has(arg) && (!options[arg] || options[arg].startsWith("--")))
    throw Error("Optionswert fehlt.");
}
const project = options["--project"],
  business = options["--business"];
if (
  !/^[a-z][a-z0-9-]{4,62}$/.test(project || "") ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(business || "")
)
  throw Error(
    "Aufruf: node scripts/firebase-migrate-payment-contacts.mjs --project PROJEKT --business FIRMEN_ID [--apply] [--resume] [--backup-dir PRIVATER_ORDNER]",
  );
const emulator = !!options["--emulator"],
  apply = !!options["--apply"];
if (emulator && !project.startsWith("demo-"))
  throw Error("Emulator nur für Demo-Projekte.");
if (options["--resume"] && !apply) throw Error("--resume benötigt --apply.");
const token = emulator
  ? "owner"
  : execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
const base = emulator
  ? "http://127.0.0.1:8080/v1/"
  : "https://firestore.googleapis.com/v1/";
const documents = `projects/${project}/databases/(default)/documents`,
  root = `${documents}/hf_businesses/${business}`;
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
async function request(path, body, missing = false) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (missing && r.status === 404) return null;
  if (!r.ok)
    throw Error(
      `Firebase-Zugriff fehlgeschlagen (${r.status}); keine Nutzdaten im Fehlerprotokoll.`,
    );
  return r.json();
}
const get = (path) => request(path, null, true);
async function all(path) {
  const docs = [];
  let page = "";
  do {
    const r = await request(
      path +
        "?pageSize=200" +
        (page ? "&pageToken=" + encodeURIComponent(page) : ""),
    );
    docs.push(...(r.documents || []));
    page = r.nextPageToken || "";
  } while (page);
  return docs;
}
const string = (d, k) => d?.fields?.[k]?.stringValue;
const number = (d, k) => Number(d?.fields?.[k]?.integerValue);
const sv = (value) => ({ stringValue: value });
const canonical = (v) =>
  JSON.stringify(
    v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, JSON.parse(canonical(v[k]))]),
        )
      : v,
  );
const same = (a, b) => canonical(a) === canonical(b);
const update = (doc, fields, mask) => ({
  update: { name: doc.name, fields },
  ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
  currentDocument: { updateTime: doc.updateTime },
});
const create = (name, fields) => ({
  update: { name, fields },
  currentDocument: { exists: false },
});
const commit = (writes) =>
  request(`projects/${project}/databases/(default)/documents:commit`, {
    writes,
  });
let locked = false;
try {
  let company = await get(root),
    revision = await get(root + "/state/revision");
  if (
    !company ||
    !revision ||
    !Number.isSafeInteger(number(revision, "value")) ||
    !string(company, "owner_user_id") ||
    company.fields?._archived?.booleanValue
  )
    throw Error("Aktive Firma/Revision nicht gefunden.");
  const busy = string(company, "_migration_state") === "in_progress";
  if (
    busy &&
    (!options["--resume"] ||
      string(company, "_payment_contact_migration") !== "v1")
  )
    throw Error(
      "Firma ist bereits gesperrt. Nur diese Migration mit --resume fortsetzen; keine fremde Migration überschreiben.",
    );
  if (apply && !busy) {
    await commit([
      update(
        company,
        {
          _migration_state: sv("in_progress"),
          _payment_contact_migration: sv("v1"),
        },
        ["_migration_state", "_payment_contact_migration"],
      ),
      {
        verify: revision.name,
        currentDocument: { updateTime: revision.updateTime },
      },
    ]);
    company = await get(root);
    locked = true;
  } else if (apply) locked = true;
  const records = await all(root + "/records"),
    contacts = await all(root + "/payment_contacts"),
    billing = await all(root + "/billing");
  const existing = new Map([...contacts, ...billing].map((d) => [d.name, d]));
  const source = new Map(records.map((d) => [d.name, d]));
  const owner = string(company, "owner_user_id");
  const operations = [];
  const expected = [];
  for (const d of records) {
    const table = string(d, "_table"),
      id = string(d, "id");
    if (table === "customer_billing") {
      if (!id || /[\/~]/.test(id))
        throw Error("Ungültiger Altdatensatz; Firma bleibt gesperrt.");
      const name = root + "/billing/" + id,
        old = existing.get(name);
      if (old && !same(old.fields, d.fields))
        throw Error(
          "Bestehender Abrechnungskontakt weicht ab; kein Überschreiben.",
        );
      operations.push([
        ...(old ? [] : [create(name, d.fields)]),
        { delete: d.name, currentDocument: { updateTime: d.updateTime } },
      ]);
      expected.push({ name, fields: d.fields });
    }
    if (table !== "treatment_payments") continue;
    const keys = ["billing_name_snapshot", "billing_address_snapshot"];
    if (!keys.some((k) => k in (d.fields || {}))) continue;
    if (!id || /[\/~]/.test(id)) throw Error("Ungültige Zahlungs-ID.");
    const values = keys.map((k) => {
      if (d.fields[k] && !("stringValue" in d.fields[k]))
        throw Error("Kontaktfeld hat ungültigen Datentyp.");
      return string(d, k) || "";
    });
    const treatmentId = string(d, "treatment_id");
    const treatment = source.get(root + "/records/treatments~" + treatmentId);
    if (
      !treatment ||
      string(treatment, "_facility_id") !== string(d, "_facility_id")
    )
      throw Error(
        "Zuordnung der Zahlung ist ungültig; keine ungesicherte Bereinigung.",
      );
    const fields = {
      id: sv(id),
      treatment_id: sv(treatmentId),
      business_id: sv(business),
      user_id: sv(owner),
      _facility_id: sv(string(treatment, "_facility_id")),
      billing_name_snapshot: sv(values[0]),
      billing_address_snapshot: sv(values[1]),
    };
    if (values[0].length > 500 || values[1].length > 2000)
      throw Error("Kontakt ist zu lang; Betreiber muss den Datensatz prüfen.");
    const name = root + "/payment_contacts/" + id,
      old = existing.get(name);
    if (old && !same(old.fields, fields))
      throw Error("Geschützter Zahlungskontakt weicht ab; kein Überschreiben.");
    const writes = [];
    if (values.some(Boolean)) {
      if (!old) writes.push(create(name, fields));
      expected.push({ name, fields });
    }
    // Delete field paths via updateMask; all unrelated payment fields stay intact.
    writes.push(update(d, {}, keys));
    operations.push(writes);
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      business,
      relocations: operations.length,
      protectedContacts: expected.length,
    }),
  );
  if (!apply) {
    console.log("Nur geprüft. Keine Daten geändert.");
    process.exit(0);
  }
  // Locked snapshot includes originals and targets. Persist outside repository,
  // restrictive permissions and exclusive create; never output document contents.
  const directory = resolve(
    options["--backup-dir"] || join(homedir(), ".heimfriseur-backups"),
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw Error(
      "Sicherungsordner muss privat sein (0700) und darf kein Symlink sein.",
    );
  const realDirectory = realpathSync(directory),
    repo = realpathSync(process.cwd());
  const within = relative(repo, realDirectory);
  if (within === "" || (!within.startsWith("..") && !within.startsWith("/")))
    throw Error("Sicherung muss außerhalb des Repositorys liegen.");
  const backup = join(
    realDirectory,
    `payment-contacts-${Date.now()}-${randomUUID()}.json`,
  );
  const snapshot = JSON.stringify(
    {
      schema: 1,
      project,
      business,
      created_at: new Date().toISOString(),
      documents: [company, revision, ...records, ...contacts, ...billing],
    },
    null,
    2,
  );
  writeFileSync(backup, snapshot, { flag: "wx", mode: 0o600, flush: true });
  console.log("Private Sicherung:", backup);
  console.log(
    "Sicherungs-Hash:",
    createHash("sha256").update(snapshot).digest("hex"),
  );
  let batch = [];
  for (const operation of operations) {
    if (batch.length + operation.length > 200) {
      await commit(batch);
      batch = [];
    }
    batch.push(...operation);
  }
  if (batch.length) await commit(batch);
  const cleaned = await all(root + "/records");
  if (
    cleaned.some(
      (d) =>
        string(d, "_table") === "customer_billing" ||
        (string(d, "_table") === "treatment_payments" &&
          ["billing_name_snapshot", "billing_address_snapshot"].some(
            (k) => k in d.fields,
          )),
    )
  )
    throw Error("Bereinigung unvollständig; Firma bleibt gesperrt.");
  // Verify every original payment/other record remains otherwise byte-equivalent.
  const cleanedMap = new Map(cleaned.map((d) => [d.name, d]));
  for (const old of records) {
    if (string(old, "_table") === "customer_billing") continue;
    const fields = { ...old.fields };
    if (string(old, "_table") === "treatment_payments") {
      delete fields.billing_name_snapshot;
      delete fields.billing_address_snapshot;
    }
    if (!same(cleanedMap.get(old.name)?.fields, fields))
      throw Error("Fachdatenvergleich fehlgeschlagen; Firma bleibt gesperrt.");
  }
  for (const e of expected) {
    if (!same((await get(e.name))?.fields, e.fields))
      throw Error("Kontaktvergleich fehlgeschlagen; Firma bleibt gesperrt.");
  }
  company = await get(root);
  revision = await get(root + "/state/revision");
  if (
    string(company, "owner_user_id") !== owner ||
    string(company, "_migration_state") !== "in_progress" ||
    string(company, "_payment_contact_migration") !== "v1"
  )
    throw Error("Migrationsmarker wurde verändert; keine Freigabe.");
  await commit([
    update(
      company,
      {
        _migration_state: sv("complete"),
        _payment_contact_migration: sv("complete"),
        payment_contacts_schema: { integerValue: "1" },
      },
      [
        "_migration_state",
        "_payment_contact_migration",
        "payment_contacts_schema",
      ],
    ),
    update(revision, {
      value: { integerValue: String(number(revision, "value") + 1) },
    }),
  ]);
  locked = false;
  console.log(
    "Kontakte geschützt, operative Datensätze vollständig verglichen, Firma freigegeben.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Migration fehlgeschlagen.",
  );
  if (locked)
    console.error(
      "Firma bleibt zum Datenschutz gesperrt. Ursache prüfen; danach denselben Befehl mit --apply --resume ausführen. Sicherung nicht veröffentlichen.",
    );
  process.exitCode = 1;
}
