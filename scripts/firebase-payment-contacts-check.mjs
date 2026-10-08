// Phase 1 migration integration checks: IAM fixture data in local emulator only.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
const project = "demo-heimfriseur",
  business = "contact-migration-fixture",
  root = "hf_businesses/" + business;
const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/`;
const headers = {
  authorization: "Bearer owner",
  "content-type": "application/json",
};
const encode = (value) =>
  value === null
    ? { nullValue: null }
    : typeof value === "string"
      ? { stringValue: value }
      : typeof value === "boolean"
        ? { booleanValue: value }
        : typeof value === "number"
          ? { integerValue: String(value) }
          : Array.isArray(value)
            ? { arrayValue: { values: value.map(encode) } }
            : {
                mapValue: {
                  fields: Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, encode(v)]),
                  ),
                },
              };
const seed = async (path, value) => {
  const r = await fetch(base + path, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: encode(value).mapValue.fields }),
  });
  assert.equal(r.status, 200);
};
const get = async (path) => {
  const r = await fetch(base + path, { headers });
  return r.ok ? r.json() : null;
};
const temporary = mkdtempSync(join(tmpdir(), "hf-contact-private-"));
const args = [
  "scripts/firebase-migrate-payment-contacts.mjs",
  "--project",
  project,
  "--business",
  business,
  "--emulator",
  "--backup-dir",
  temporary,
];
const run = (extra = [], expected = 0) => {
  const r = spawnSync(process.execPath, [...args, ...extra], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, expected, r.stderr);
  assert.ok(!r.stdout.includes("PRIVATE CONTACT"));
  return r;
};
const env = await initializeTestEnvironment({
  projectId: project,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firebase-parallel/firestore.rules", "utf8"),
  },
});
const context = (uid, permissions = {}) =>
  env
    .authenticatedContext(uid, {
      email: uid + "@test.invalid",
      email_verified: true,
    })
    .firestore();
const record = (table, id, extra = {}) => ({
  id,
  user_id: "contact-owner",
  business_id: business,
  _table: table,
  _facility_id: "facility",
  ...extra,
});
try {
  await seed(root, {
    name: "Fictitious fixture",
    workflow_schema: 2,
    finance_schema: 3,
    owner_user_id: "contact-owner",
    owner_email: "contact-owner@test.invalid",
  });
  await seed(root + "/state/revision", { value: 0 });
  await seed(root + "/members/contact-worker", {
    id: "contact-worker",
    user_id: "contact-worker",
    business_id: business,
    role: "employee",
    is_active: true,
    facility_ids: ["facility"],
    permissions: { record_payments: true, view_billing: false },
  });
  await seed(
    root + "/records/treatments~t",
    record("treatments", "t", { end_time: "2026-10-07T10:00:00Z" }),
  );
  await seed(
    root + "/records/treatment_payments~p",
    record("treatment_payments", "p", {
      treatment_id: "t",
      status: "Offen",
      billing_name_snapshot: "PRIVATE CONTACT",
      billing_address_snapshot: "PRIVATE ADDRESS",
    }),
  );
  await seed(root + "/finance/t", {
    treatment_id: "t",
    total_price: 22,
    material_cost: 2,
    completed: true,
  });
  const worker = context("contact-worker");
  await assertFails(
    getDoc(doc(worker, root + "/records/treatment_payments~p")),
  ); // legacy businesses fail closed
  const original = (await get(root + "/records/treatment_payments~p")).fields;
  const finance = (await get(root + "/finance/t")).fields;
  run();
  assert.deepEqual(
    (await get(root + "/records/treatment_payments~p")).fields,
    original,
  );
  run(["--apply"]);
  const contact = (await get(root + "/payment_contacts/p")).fields;
  assert.equal(contact.billing_name_snapshot.stringValue, "PRIVATE CONTACT");
  const clean = (await get(root + "/records/treatment_payments~p")).fields;
  assert.ok(!("billing_name_snapshot" in clean));
  assert.ok(!("billing_address_snapshot" in clean));
  assert.equal(clean.status.stringValue, "Offen");
  assert.deepEqual((await get(root + "/finance/t")).fields, finance);
  const backupFiles = readdirSync(temporary).filter((f) => f.endsWith(".json"));
  assert.equal(backupFiles.length, 1);
  const backup = join(temporary, backupFiles[0]);
  assert.equal(statSync(backup).mode & 0o777, 0o600);
  const saved = JSON.parse(readFileSync(backup, "utf8"));
  assert.ok(
    saved.documents.some(
      (d) => d.fields?.billing_name_snapshot?.stringValue === "PRIVATE CONTACT",
    ),
  );
  await assertSucceeds(
    getDoc(doc(worker, root + "/records/treatment_payments~p")),
  );
  await assertFails(getDoc(doc(worker, root + "/payment_contacts/p")));
  await seed(root + "/members/contact-worker", {
    id: "contact-worker",
    user_id: "contact-worker",
    business_id: business,
    role: "employee",
    is_active: true,
    facility_ids: ["facility"],
    permissions: { view_billing: true },
  });
  await assertSucceeds(getDoc(doc(worker, root + "/payment_contacts/p")));
  await assertFails(
    getDoc(doc(context("unrelated"), root + "/payment_contacts/p")),
  );
  run(["--apply"]); // repeated run preserves contents, no duplicates
  assert.deepEqual((await get(root + "/payment_contacts/p")).fields, contact);
  // Conflicting protected history must not be overwritten or unlocked.
  await seed(
    root + "/records/treatment_payments~p",
    record("treatment_payments", "p", {
      treatment_id: "t",
      status: "Offen",
      billing_name_snapshot: "DIFFERENT CONTACT",
      billing_address_snapshot: "PRIVATE ADDRESS",
    }),
  );
  run(["--apply"], 1);
  assert.equal(
    (await get(root)).fields._migration_state.stringValue,
    "in_progress",
  );
  assert.deepEqual((await get(root + "/payment_contacts/p")).fields, contact);
  await assertFails(
    getDoc(doc(worker, root + "/records/treatment_payments~p")),
  );
  // Operator resolves conflicting legacy source, then safely resumes.
  await seed(
    root + "/records/treatment_payments~p",
    record("treatment_payments", "p", {
      treatment_id: "t",
      status: "Offen",
      billing_name_snapshot: "PRIVATE CONTACT",
      billing_address_snapshot: "PRIVATE ADDRESS",
    }),
  );
  run(["--apply", "--resume"]);
  assert.equal(
    (await get(root)).fields._migration_state.stringValue,
    "complete",
  );
  console.log(
    "PASS: contact migration dry-run, private backup, complete data comparison, restricted API reads, conflict lock and resume",
  );
} finally {
  await env.cleanup();
  rmSync(temporary, { recursive: true, force: true });
}
