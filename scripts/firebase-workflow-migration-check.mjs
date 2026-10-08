import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { operator, encode, payload } from "./lib/firebase-operator.mjs";
const project = "demo-heimfriseur",
  business = "workflow-migration-fixture";
const api = operator({ "--project": project, "--emulator": true }),
  root = api.docs + "/hf_businesses/" + business;
const backup = mkdtempSync(join(tmpdir(), "hf-private-workflow-"));
const row = (table, id, extra = {}) => ({
  id,
  user_id: "director",
  business_id: business,
  _table: table,
  _facility_id: "f",
  ...extra,
});
const seed = (name, value) => ({
  update: { name, fields: encode(value).mapValue.fields },
});
function run(script, args = [], interrupt = false) {
  const p = spawnSync(
    process.execPath,
    [
      script,
      "--project",
      project,
      "--business",
      business,
      "--emulator",
      "--backup-dir",
      backup,
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...(interrupt ? { HF_MIGRATION_TEST_INTERRUPT: "1" } : {}),
      },
    },
  );
  return p;
}
function check(condition, message) {
  if (!condition) throw Error(message);
}
try {
  const writes = [
    seed(root, {
      name: "Test",
      owner_user_id: "director",
      owner_email: "director@test.invalid",
      payment_contacts_schema: 1,
    }),
    seed(root + "/state/revision", { value: 0 }),
    seed(root + "/members/director", {
      id: "director",
      user_id: "director",
      business_id: business,
      role: "owner",
      is_active: true,
      permissions: {},
    }),
    seed(root + "/members/duplicate", {
      id: "duplicate",
      user_id: "duplicate",
      business_id: business,
      role: "owner",
      is_active: true,
      permissions: {},
    }),
    seed(
      root + "/records/appointments~a",
      row("appointments", "a", {
        status: "Geplant",
        facility_id: "f",
        actual_start_time: null,
        actual_end_time: null,
      }),
    ),
  ];
  for (let i = 0; i < 160; i++) {
    writes.push(
      seed(
        root + "/records/appointment_customers~legacy-" + i,
        row("appointment_customers", "legacy-" + i, {
          appointment_id: "a",
          customer_id: "c" + i,
          status: "Offen",
        }),
      ),
    );
    writes.push(
      seed(
        root + "/records/customers~c" + i,
        row("customers", "c" + i, { facility_id: "f", group_id: "g" }),
      ),
    );
  }
  writes.push(
    seed(
      root + "/records/services~s",
      row("services", "s", {
        price: 0.3,
        name: "Test",
        is_active: true,
        duration_minutes: 30,
      }),
    ),
    seed(root + "/catalogue/main", {
      services: {
        s: { price: 0.3, name: "Test", is_active: true, duration: 30 },
      },
      prices: { "f:s": 0.3 },
    }),
  );
  for (let i = 0; i < writes.length; i += 150)
    await api.commit(writes.slice(i, i + 150));
  const dry = run("scripts/firebase-migrate-workflow.mjs");
  check(dry.status === 0, dry.stderr);
  check(
    payload(await api.get(root)).workflow_schema === undefined,
    "Dry-run mutated root",
  );
  const interrupted = run(
    "scripts/firebase-migrate-workflow.mjs",
    ["--apply"],
    true,
  );
  check(interrupted.status !== 0, "Interruption hook failed");
  check(
    payload(await api.get(root))._migration_state === "in_progress",
    "Interrupted migration unlocked",
  );
  const resumed = run("scripts/firebase-migrate-workflow.mjs", [
    "--apply",
    "--resume",
  ]);
  check(resumed.status === 0, resumed.stderr);
  check(
    payload(await api.get(root)).workflow_schema === 2,
    "Resume not complete",
  );
  const guards = (await api.all(root + "/visit_guards")).map(payload);
  check(
    guards.length === 6 && guards.flatMap((g) => g.pending_ids).length === 160,
    "Pending customers lost",
  );
  check(
    (await api.all(root + "/records")).filter(
      (d) => payload(d)._table === "appointment_customers",
    ).length === 160,
    "Duplicate migration members",
  );
  for (const file of readdirSync(backup))
    check(
      (statSync(join(backup, file)).mode & 0o777) === 0o600,
      "Backup permissions",
    );
  const financeDry = run("scripts/firebase-migrate-finance.mjs");
  check(financeDry.status === 0, financeDry.stderr);
  const finance = run("scripts/firebase-migrate-finance.mjs", ["--apply"]);
  check(finance.status === 0, finance.stderr);
  check(
    payload(await api.get(root + "/records/services~s")).price_cents === 30,
    "Cent conversion failed",
  );
  check(
    payload(await api.get(root + "/catalogue/main")).prices["f:s"] === 30,
    "Catalogue not converted",
  );
  check(
    payload(await api.get(root + "/members/duplicate")).role === "employee",
    "Duplicate director remains",
  );
  const again = run("scripts/firebase-migrate-finance.mjs", ["--apply"]);
  check(again.status === 0, again.stderr);
  check(
    payload(await api.get(root + "/catalogue/main")).prices["f:s"] === 30,
    "Rerun multiplied cents",
  );
  check(
    (await api.all(root + "/migration_plan")).length === 0,
    "Journal not cleaned",
  );
  await api.commit(
    ["director", "duplicate"].map((uid) =>
      seed(api.docs + "/hf_accounts/" + uid, { business_id: business }),
    ),
  );
  const saved = run("scripts/firebase-backup.mjs", ["--apply"]);
  check(saved.status === 0, saved.stderr);
  check(
    payload(await api.get(root))._migration_state === "complete",
    "Backup left maintenance lock",
  );
  const file = readdirSync(backup).find((f) => f.startsWith("pre-release-"));
  check(!!file, "Release backup missing");
  const bytes = readFileSync(join(backup, file)),
    sha = createHash("sha256").update(bytes).digest("hex");
  const restore = spawnSync(
    process.execPath,
    [
      "scripts/firebase-restore-emulator.mjs",
      "--project",
      "demo-restore-check",
      "--emulator",
      "--file",
      join(backup, file),
      "--sha256",
      sha,
      "--apply",
    ],
    { encoding: "utf8" },
  );
  check(restore.status === 0, restore.stderr);
  const wrong = spawnSync(
    process.execPath,
    [
      "scripts/firebase-restore-emulator.mjs",
      "--project",
      "demo-restore-check",
      "--emulator",
      "--file",
      join(backup, file),
      "--sha256",
      "0".repeat(64),
      "--apply",
    ],
    { encoding: "utf8" },
  );
  check(wrong.status !== 0, "Bad backup hash accepted");
  console.log(
    "PASS: phase 2/3 dry-run, private backup, interrupted partial migration/resume, exact roster, integer cents, one director, idempotency",
  );
} finally {
  rmSync(backup, { recursive: true, force: true });
}
