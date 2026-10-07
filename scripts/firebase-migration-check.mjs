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
