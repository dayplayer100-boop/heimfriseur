import { execFileSync, spawnSync } from "node:child_process";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const compiled = await build({
  entryPoints: ["src/demo.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { demoSeed } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const data = demoSeed();
data.treatments.push({
  id: "historical-test",
  user_id: "demo",
  appointment_id: "a1",
  appointment_customer_id: data.appointment_customers[0].id,
  customer_id: "c0",
  performed_by: "demo",
  start_time: "2026-10-05T08:00:00Z",
  end_time: "2026-10-05T08:30:00Z",
  duration_minutes: 30,
  total_price: 28,
  material_cost: 2,
  notes: "",
});
data.treatment_services.push({
  id: "historic-service",
  user_id: "demo",
  treatment_id: "historical-test",
  service_id: "s0",
  service_name_snapshot: "Damenhaarschnitt",
  price_snapshot: 28,
  duration_minutes_snapshot: 30,
});
data.appointment_customers[0].status = "Erledigt";
const temporary = mkdtempSync(join(tmpdir(), "heim-import-check-")),
  fixture = join(temporary, "export.json");
writeFileSync(
  fixture,
  JSON.stringify({
    schema_version: 2,
    data,
    team: { business: { owner_user_id: "demo", name: "Test" } },
  }),
);
const project = "demo-heimfriseur",
  email = `migration-check-${Date.now()}@test.invalid`;
async function api(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer owner",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(JSON.stringify(j));
  return j;
}
const auth = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const user = await api(auth + "/accounts:signUp?key=demo-key", {
  email,
  password: "FictitiousTestOnly-123!",
  returnSecureToken: true,
});
await api(auth + "/projects/" + project + "/accounts:update", {
  localId: user.localId,
  emailVerified: true,
});
function enc(v) {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return { integerValue: String(v) };
  if (typeof v === "boolean") return { booleanValue: v };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v).map(([k, v]) => [k, enc(v)]),
      ),
    },
  };
}
const root = `projects/${project}/databases/(default)/documents/hf_businesses/${user.localId}`;
await api(
  `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents:commit`,
  {
    writes: [
      {
        update: {
          name: root,
          fields: enc({ owner_user_id: user.localId, name: "Import test" })
            .mapValue.fields,
        },
      },
      {
        update: {
          name: root + "/state/revision",
          fields: enc({ value: 0 }).mapValue.fields,
        },
      },
    ],
  },
);
console.log(
  execFileSync(
    process.execPath,
    [
      "scripts/firebase-migrate.mjs",
      "--file",
      fixture,
      "--owner-email",
      email,
      "--project",
      project,
      "--emulator",
      "--apply",
    ],
    { encoding: "utf8" },
  ),
);

rmSync(temporary, { recursive: true, force: true });
console.log(
  "PASS: fictitious migration, full record comparison and historical finance preserved",
);

const grantArgs = [
  "scripts/firebase-grant-admin.mjs",
  "--email",
  email,
  "--project",
  project,
  "--emulator",
];
const granted = execFileSync(process.execPath, grantArgs, { encoding: "utf8" });
if (!granted.includes("erfolgreich eingerichtet"))
  throw Error("Operator grant failed");
const again = execFileSync(process.execPath, grantArgs, { encoding: "utf8" });
if (!again.includes("bereits aktiver App-Admin"))
  throw Error("Operator grant is not idempotent");
console.log(
  "PASS: verified UID-based operator admin grant, audit commit and idempotency",
);

const unverifiedEmail = `unverified-admin-${Date.now()}@test.invalid`;
const unverified = await api(auth + "/accounts:signUp?key=demo-key", {
  email: unverifiedEmail,
  password: "UnverifiedTestOnly-123!",
  returnSecureToken: true,
});
const denied = spawnSync(
  process.execPath,
  [
    "scripts/firebase-grant-admin.mjs",
    "--email",
    unverifiedEmail,
    "--project",
    project,
    "--emulator",
  ],
  { encoding: "utf8" },
);
if (denied.status !== 1) throw Error("Unverified operator grant must fail");
const absent = await fetch(
  `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/hf_admins/${unverified.localId}`,
  { headers: { authorization: "Bearer owner" } },
);
if (absent.status !== 404)
  throw Error("Unverified account unexpectedly became admin");
console.log("PASS: unverified admin grants rejected without database changes");
// Ownership transfer: reject existing target data, then move into the preserved
// company, clean only its empty placeholder and keep the operator independent.
const successorEmail = `successor-${Date.now()}@test.invalid`;
const successor = await api(auth + "/accounts:signUp?key=demo-key", {
  email: successorEmail,
  password: "SuccessorTestOnly-123!",
  returnSecureToken: true,
});
await api(auth + "/projects/" + project + "/accounts:update", {
  localId: successor.localId,
  emailVerified: true,
});
const documents = `projects/${project}/databases/(default)/documents`;
const sourcePath = `${documents}/hf_businesses/${user.localId}`,
  targetPath = `${documents}/hf_businesses/${successor.localId}`;
const document = (name, data) => ({
  update: { name, fields: enc(data).mapValue.fields },
});
const commit = async (writes) =>
  api(
    `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents:commit`,
    { writes },
  );
await commit([
  {
    update: {
      name: sourcePath,
      fields: enc({ owner_email: email }).mapValue.fields,
    },
    updateMask: { fieldPaths: ["owner_email"] },
  },
  document(`${documents}/hf_accounts/${user.localId}`, {
    business_id: user.localId,
  }),
  document(`${documents}/hf_accounts/${successor.localId}`, {
    business_id: successor.localId,
  }),
  document(sourcePath + `/members/${user.localId}`, {
    id: user.localId,
    user_id: user.localId,
    business_id: user.localId,
    role: "owner",
    display_name: email,
    is_active: true,
  }),
  document(targetPath, {
    owner_user_id: successor.localId,
    owner_email: successorEmail,
    name: "Empty placeholder",
  }),
  document(targetPath + "/state/revision", { value: 0 }),
  document(targetPath + `/members/${successor.localId}`, {
    id: successor.localId,
    user_id: successor.localId,
    role: "owner",
    is_active: true,
  }),
  document(targetPath + "/records/profiles~placeholder", {
    id: "placeholder",
    _table: "profiles",
    user_id: successor.localId,
  }),
  document(targetPath + "/records/facilities~must-preserve", {
    id: "must-preserve",
    _table: "facilities",
    user_id: successor.localId,
  }),
]);
const transferArgs = [
  "scripts/firebase-transfer-owner.mjs",
  "--project",
  project,
  "--from-admin",
  email,
  "--to-owner",
  successorEmail,
  "--emulator",
];
const rejected = spawnSync(process.execPath, transferArgs, {
  encoding: "utf8",
});
if (rejected.status !== 1)
  throw Error("Target with existing data must be rejected");
const getDocument = async (path) =>
  (
    await fetch(`http://127.0.0.1:8080/v1/${path}`, {
      headers: { authorization: "Bearer owner" },
    })
  ).json();
if (
  (await getDocument(sourcePath)).fields.owner_user_id.stringValue !==
  user.localId
)
  throw Error("Rejected transfer changed source owner");
await commit([{ delete: targetPath + "/records/facilities~must-preserve" }]);
const transferred = execFileSync(process.execPath, transferArgs, {
  encoding: "utf8",
});
if (!transferred.includes("Übernahme erfolgreich"))
  throw Error("Transfer did not finish");
if (
  (await getDocument(sourcePath)).fields.owner_user_id.stringValue !==
  successor.localId
)
  throw Error("Wrong successor");
if (
  (await getDocument(`${documents}/hf_admins/${user.localId}`)).fields.is_active
    .booleanValue !== true
)
  throw Error("Platform admin access lost");
if (
  (await getDocument(sourcePath + `/members/${user.localId}`)).error?.code !==
  404
)
  throw Error("Platform admin remained company member");
if (
  (await getDocument(sourcePath + `/members/${successor.localId}`)).fields.role
    .stringValue !== "owner"
)
  throw Error("Successor has no owner membership");
if (
  (await getDocument(sourcePath + "/records/facilities~f1")).fields.user_id
    .stringValue !== successor.localId
)
  throw Error("Business record lost or not assigned");
if (
  (await getDocument(sourcePath + "/finance/a1:c0")).fields.total_cents
    .integerValue !== "2800"
)
  throw Error("Historic finance changed");
if ((await getDocument(targetPath)).error?.code !== 404)
  throw Error("Empty duplicate company retained");
const repeat = execFileSync(process.execPath, transferArgs, {
  encoding: "utf8",
});
if (!repeat.includes("bereits Geschäftsführer"))
  throw Error("Transfer not idempotent");
console.log(
  "PASS: safe atomic owner transfer, no target data loss, independent admin, preserved financial history and idempotency",
);

// The creator must manage the existing director firm without a company role.
const extraPath = `${documents}/hf_businesses/extra-admin-company`;
await commit([
  document(extraPath, {
    owner_user_id: user.localId,
    owner_email: email,
    name: "Extra admin company",
  }),
  document(extraPath + "/state/revision", { value: 0 }),
  document(extraPath + `/members/${user.localId}`, {
    id: user.localId,
    user_id: user.localId,
    role: "owner",
    is_active: true,
  }),
  document(extraPath + "/records/customers~preserved", {
    id: "preserved",
    _table: "customers",
    user_id: user.localId,
  }),
  document(extraPath + "/finance/preserved", {
    completed: true,
    total_price: 28,
  }),
  document(`${documents}/hf_accounts/${user.localId}`, {
    business_id: "extra-admin-company",
  }),
]);
const assignArgs = [
  "scripts/firebase-assign-admin-company.mjs",
  "--project",
  project,
  "--from-admin",
  email,
  "--to-owner",
  successorEmail,
  "--emulator",
];
const assigned = execFileSync(process.execPath, assignArgs, {
  encoding: "utf8",
});
if (!assigned.includes("ausschließlich App-Admin"))
  throw Error("Admin-only assignment failed");
if (
  (await getDocument(sourcePath)).fields.owner_user_id.stringValue !==
  successor.localId
)
  throw Error("Director changed during admin assignment");
if (
  (await getDocument(`${documents}/hf_admins/${user.localId}`)).fields
    .default_business_id.stringValue !== sourcePath.split("/").at(-1)
)
  throw Error("Default business missing");
if (
  (await getDocument(`${documents}/hf_accounts/${user.localId}`)).fields
    .business_id.stringValue !== sourcePath.split("/").at(-1)
)
  throw Error("Wrong admin account business");
if (
  (await getDocument(sourcePath + `/members/${user.localId}`)).error?.code !==
  404
)
  throw Error("Admin added as director or employee");
const archive = await getDocument(extraPath);
if (
  !archive.fields._archived.booleanValue ||
  archive.fields.owner_user_id.nullValue !== null
)
  throw Error("Extra admin ownership retained");
if (
  (await getDocument(extraPath + "/records/customers~preserved")).fields.id
    .stringValue !== "preserved" ||
  (await getDocument(extraPath + "/finance/preserved")).fields.total_price
    .integerValue !== "28"
)
  throw Error("Archive lost records or finance");
const repeatAssignment = execFileSync(process.execPath, assignArgs, {
  encoding: "utf8",
});
if (!repeatAssignment.includes("bereits ausschließlich App-Admin"))
  throw Error("Admin company assignment not idempotent");
console.log(
  "PASS: admin directly assigned to existing director company without membership; extra company archived, records preserved, idempotent",
);

const removedExtra = execFileSync(
  process.execPath,
  [
    ...assignArgs,
    "--delete-extra-company",
    "--backup-dir",
    mkdtempSync(join(tmpdir(), "hf-admin-backup-")),
  ],
  { encoding: "utf8" },
);
if (
  (await getDocument(extraPath)).error?.code !== 404 ||
  (await getDocument(extraPath + "/records/customers~preserved")).error
    ?.code !== 404 ||
  (await getDocument(extraPath + "/finance/preserved")).error?.code !== 404
)
  throw Error("Extra company not fully removed");
if (
  (await getDocument(sourcePath)).fields.owner_user_id.stringValue !==
  successor.localId
)
  throw Error("Target director changed by deletion");
const backupPath = removedExtra.match(
  /Sicherung der zusätzlichen Firma gespeichert: (.+)/,
)?.[1];
if (!backupPath) throw Error("Backup missing before deletion");
const { readFileSync, unlinkSync } = await import("node:fs");
const backup = JSON.parse(readFileSync(backupPath, "utf8"));
if (!backup.documents.some((d) => d.name === extraPath + "/finance/preserved"))
  throw Error("Finance missing from backup");
unlinkSync(backupPath);
console.log(
  "PASS: complete duplicate company deletion after private backup, target owner and administrator identity preserved",
);
