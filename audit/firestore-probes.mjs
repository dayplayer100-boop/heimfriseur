// Read-only audit of production source rules in a disposable local emulator.
// No live project credentials. Positive vulnerability probes deliberately expect
// acceptance in 6.4.0; convert them into assertFails regression tests after fixes.
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { readFileSync, writeFileSync } from "node:fs";
const projectId = "demo-heimfriseur-audit";
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firebase-parallel/firestore.rules", "utf8"),
  },
});
const account = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: uid + "@test.invalid",
      email_verified: verified,
    })
    .firestore();
const worker = account("worker"),
  owner = account("owner"),
  stranger = account("stranger");
const root = "hf_businesses/owner/";
const record = (table, id, extra = {}) => ({
  id,
  user_id: "owner",
  business_id: "owner",
  _table: table,
  _facility_id: "facility",
  ...extra,
});
const findings = [];
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of [
      [
        "hf_businesses/owner",
        {
          owner_user_id: "owner",
          owner_email: "owner@test.invalid",
          name: "Audit fixture",
        },
      ],
      [
        root + "members/owner",
        {
          id: "owner",
          user_id: "owner",
          business_id: "owner",
          role: "owner",
          is_active: true,
          permissions: {},
        },
      ],
      [
        root + "members/worker",
        {
          id: "worker",
          user_id: "worker",
          business_id: "owner",
          role: "employee",
          is_active: true,
          facility_ids: ["facility"],
          permissions: { close_visits: true, view_billing: false },
        },
      ],
      [
        root + "records/appointments~visit",
        record("appointments", "visit", {
          assigned_users: ["worker"],
          responsible_user: "worker",
          status: "In Bearbeitung",
        }),
      ],
      [
        root + "records/appointment_customers~open",
        record("appointment_customers", "open", {
          appointment_id: "visit",
          customer_id: "customer",
          status: "Offen",
        }),
      ],
      [
        root + "records/treatments~running",
        record("treatments", "running", {
          appointment_id: "visit",
          performed_by: "worker",
          start_time: "2026-10-07T09:00:00Z",
          end_time: null,
          duration_minutes: null,
        }),
      ],
      [
        root + "records/treatment_payments~payment",
        record("treatment_payments", "payment", {
          treatment_id: "running",
          billing_name_snapshot: "FICTIONAL invoice contact",
          billing_address_snapshot: "FICTIONAL address",
        }),
      ],
      [root + "state/revision", { value: 0 }],
    ])
      await setDoc(doc(db, path), data);
  });
  await assertFails(getDoc(doc(stranger, root + "records/treatments~running")));
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        root + "records/treatments~running",
      ),
    ),
  );
  await assertFails(
    getDoc(doc(account("worker", false), root + "records/treatments~running")),
  );
  await assertFails(
    updateDoc(doc(worker, root + "members/worker"), {
      permissions: { company_admin: true },
    }),
  );
  findings.push({
    id: "BOUNDARY",
    result: "PASS",
    detail: "Foreign tenant, anonymous, unverified and self-promotion denied",
  });
  const payment = await assertSucceeds(
    getDoc(doc(worker, root + "records/treatment_payments~payment")),
  );
  if (payment.data().billing_name_snapshot)
    findings.push({
      id: "SEC-01",
      result: "REPRODUCED",
      detail: "Employee without view_billing reads invoice contact snapshots",
    });
  await assertSucceeds(
    updateDoc(doc(worker, root + "records/appointments~visit"), {
      status: "Abgeschlossen",
    }),
  );
  findings.push({
    id: "LOGIC-01",
    result: "REPRODUCED",
    detail:
      "Direct client closes visit while customer is open and treatment is running",
  });
  await assertSucceeds(
    updateDoc(doc(worker, root + "records/treatments~running"), {
      end_time: "1900-01-01T00:00:00Z",
      duration_minutes: -123,
    }),
  );
  findings.push({
    id: "LOGIC-02",
    result: "REPRODUCED",
    detail:
      "Direct client records negative duration and end before start, without finance completion",
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, root + "catalogue/main"), {
      services: {
        s1: { name: "A", price: 0.1, duration: 1, is_active: true },
        s2: { name: "B", price: 0.2, duration: 1, is_active: true },
      },
      prices: {},
    });
    await setDoc(
      doc(db, root + "records/treatments~decimal"),
      record("treatments", "decimal", {
        appointment_id: "visit",
        performed_by: "worker",
        end_time: null,
      }),
    );
  });
  const cents = {
    treatment_id: "decimal",
    total_price: 0.3,
    material_cost: 0,
    price_override: null,
    completed: false,
    performed_by: "worker",
    service_ids: ["s1", "s2"],
    lines: [
      { service_id: "s1", name: "A", price: 0.1, duration: 1 },
      { service_id: "s2", name: "B", price: 0.2, duration: 1 },
    ],
  };
  await assertFails(setDoc(doc(worker, root + "finance/decimal"), cents));
  await assertSucceeds(
    setDoc(doc(worker, root + "finance/decimal"), {
      ...cents,
      total_price: 0.1 + 0.2,
    }),
  );
  findings.push({
    id: "MATH-01",
    result: "REPRODUCED",
    detail:
      "Correct decimal 0.30 rejected; binary floating sum 0.30000000000000004 accepted",
  });
  await assertSucceeds(
    updateDoc(doc(owner, root + "members/worker"), { role: "owner" }),
  );
  findings.push({
    id: "AUTH-01",
    result: "REPRODUCED",
    detail:
      "Director can create second owner member inconsistent with root owner_user_id",
  });
  await assertSucceeds(
    setDoc(doc(worker, root + "audit/forged-event"), {
      actor_id: "worker",
      action: "business_role_changed",
      details: { role: "owner" },
      created_at: "1900-01-01",
    }),
  );
  findings.push({
    id: "AUDIT-01",
    result: "REPRODUCED",
    detail:
      "Employee can append arbitrary privileged action label and historical timestamp",
  });
  writeFileSync(
    "audit/firestore-probe-results.json",
    JSON.stringify({ projectId, sourceVersion: "6.4.0", findings }, null, 2) +
      "\n",
  );
  console.log(JSON.stringify(findings, null, 2));
} finally {
  await env.cleanup();
}
