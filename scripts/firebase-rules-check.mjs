import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
const projectId = "demo-heimfriseur";
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firebase-parallel/firestore.rules", "utf8"),
  },
});
const owner = env
  .authenticatedContext("owner", {
    email: "owner@test.invalid",
    email_verified: true,
  })
  .firestore();
const employee = env
  .authenticatedContext("employee", {
    email: "employee@test.invalid",
    email_verified: true,
  })
  .firestore();
const other = env
  .authenticatedContext("other", {
    email: "other@test.invalid",
    email_verified: true,
  })
  .firestore();
const unverified = env
  .authenticatedContext("owner", {
    email: "owner@test.invalid",
    email_verified: false,
  })
  .firestore();
const anon = env.unauthenticatedContext().firestore();
const path = (suffix) => `hf_businesses/owner/${suffix}`;
const row = (table, id, extra = {}) => ({
  id,
  user_id: "owner",
  business_id: "owner",
  _table: table,
  _facility_id: "f",
  ...extra,
});
try {
  await env.clearFirestore();
  const bootstrap = writeBatch(owner);
  bootstrap.set(doc(owner, "hf_businesses/owner"), {
    name: "Test",
    payment_contacts_schema: 1,
    workflow_schema: 2,
    finance_schema: 3,
    owner_user_id: "owner",
    owner_email: "owner@test.invalid",
    created_at: "2026-10-06",
  });
  bootstrap.set(doc(owner, "hf_accounts/owner"), { business_id: "owner" });
  bootstrap.set(doc(owner, path("members/owner")), {
    id: "owner",
    user_id: "owner",
    business_id: "owner",
    role: "owner",
    display_name: "Chef",
    is_active: true,
    facility_ids: [],
    permissions: {},
  });
  bootstrap.set(doc(owner, path("state/revision")), { value: 0 });
  bootstrap.set(doc(owner, path("catalogue/main")), {
    services: {
      s: {
        name: "Schneiden",
        price_cents: 2800,
        duration: 30,
        is_active: true,
      },
      ten: { name: "Ten", price_cents: 10, duration: 1, is_active: true },
      twenty: { name: "Twenty", price_cents: 20, duration: 1, is_active: true },
    },
    prices: {},
  });
  bootstrap.set(
    doc(owner, path("records/profiles~owner")),
    row("profiles", "owner", { _facility_id: "", business_name: "Test" }),
  );
  await assertSucceeds(bootstrap.commit());
  console.log("PASS: transactional owner registration");
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, path("members/employee")), {
      id: "employee",
      user_id: "employee",
      business_id: "owner",
      role: "employee",
      display_name: "Team",
      is_active: true,
      facility_ids: ["f"],
      permissions: { record_payments: true, close_visits: true },
    });
    await setDoc(
      doc(db, path("records/facilities~f")),
      row("facilities", "f", { name: "Heim" }),
    );
    await setDoc(
      doc(db, path("records/groups~g")),
      row("groups", "g", { name: "A", facility_id: "f" }),
    );
    await setDoc(
      doc(db, path("records/customers~c")),
      row("customers", "c", {
        facility_id: "f",
        group_id: "g",
        first_name: "Erika",
      }),
    );
    await setDoc(
      doc(db, path("records/appointments~a")),
      row("appointments", "a", {
        facility_id: "f",
        group_id: "g",
        assigned_users: ["employee"],
        responsible_user: "employee",
        status: "Geplant",
      }),
    );
    await setDoc(
      doc(db, path("records/appointment_customers~a:c")),
      row("appointment_customers", "a:c", {
        appointment_id: "a",
        customer_id: "c",
        status: "Offen",
        guard_shard: 0,
      }),
    );
    for (let shard = 0; shard < 6; shard++)
      await setDoc(doc(db, path(`visit_guards/a~${shard}`)), {
        appointment_id: "a",
        shard,
        _facility_id: "f",
        pending_ids: shard === 0 ? ["a:c"] : [],
      });
    await setDoc(
      doc(db, path("records/treatments~old")),
      row("treatments", "old", {
        appointment_id: "a",
        customer_id: "c",
        appointment_customer_id: "a:c",
        performed_by: "employee",
        start_time: "2026-10-05T10:00:00Z",
        end_time: "2026-10-05T10:30:00Z",
      }),
    );
    await setDoc(doc(db, path("finance/old")), {
      treatment_id: "old",
      total_cents: 2800,
      material_cents: 200,
      override_cents: null,
      completed: true,
      performed_by: "employee",
      service_ids: ["s"],
      lines: [],
    });
  });
  await assertSucceeds(getDoc(doc(employee, path("records/customers~c"))));
  for (const db of [other, unverified, anon])
    await assertFails(getDoc(doc(db, path("records/customers~c"))));
  await assertFails(getDoc(doc(employee, path("finance/old"))));
  await assertFails(getDocs(collection(employee, path("finance"))));
  await assertSucceeds(getDoc(doc(owner, path("finance/old"))));
  await assertFails(
    setDoc(doc(employee, "hf_admins/employee"), { is_active: true }),
  );
  await assertFails(
    setDoc(
      doc(employee, path("members/employee")),
      { role: "owner" },
      { merge: true },
    ),
  );
  await assertFails(
    setDoc(
      doc(employee, path("records/customers~c")),
      { total_price: 50 },
      { merge: true },
    ),
  );
  console.log(
    "PASS: tenant boundaries, verified-email gate, private history, privilege escalation",
  );
  const t = row("treatments", "a:c", {
    appointment_id: "a",
    appointment_customer_id: "a:c",
    customer_id: "c",
    performed_by: "employee",
    start_ms: Date.now(),
    end_ms: null,
    duration_ms: null,
    notes: "",
  });
  const start = writeBatch(employee);
  start.set(doc(employee, path("records/treatments~a:c")), t);
  start.set(doc(employee, path("locks/actor:employee")), {
    treatment_id: "a:c",
    performed_by: "employee",
  });
  start.set(doc(employee, path("locks/customer:c")), {
    treatment_id: "a:c",
    performed_by: "employee",
  });
  start.update(doc(employee, path("records/appointment_customers~a:c")), {
    status: "In Behandlung",
  });
  start.update(doc(employee, path("records/appointments~a")), {
    status: "In Bearbeitung",
    actual_start_ms: t.start_ms,
  });
  const fin = {
    treatment_id: "a:c",
    total_cents: 2800,
    material_cents: 0,
    override_cents: null,
    completed: false,
    performed_by: "employee",
    service_ids: ["s"],
    lines: [
      { service_id: "s", name: "Schneiden", price_cents: 2800, duration: 30 },
    ],
  };
  start.set(doc(employee, path("finance/a:c")), fin);
  await assertSucceeds(start.commit());
  await assertSucceeds(getDoc(doc(employee, path("finance/a:c"))));
  await assertSucceeds(
    getDocs(
      query(
        collection(employee, path("finance")),
        where("performed_by", "==", "employee"),
        where("completed", "==", false),
        limit(200),
      ),
    ),
  );
  await assertFails(
    setDoc(doc(employee, path("finance/a:c")), {
      ...fin,
      total_cents: 100,
      lines: [
        { service_id: "s", name: "Schneiden", price_cents: 100, duration: 30 },
      ],
    }),
  );
  await assertFails(
    setDoc(doc(employee, path("finance/a:c")), {
      ...fin,
      total_cents: 100,
      override_cents: 100,
    }),
  );
  console.log(
    "PASS: atomic start, private running finance, catalog price validation",
  );
  for (const db of [owner, employee])
    await assertFails(
      setDoc(
        doc(db, path("records/appointments~a")),
        { status: "Abgeschlossen" },
        { merge: true },
      ),
    );
  await assertFails(
    setDoc(
      doc(employee, path("visit_guards/a~0")),
      { pending_ids: [] },
      { merge: true },
    ),
  );
  const invalidFinish = (
    duration_ms,
    end_ms,
    completed = true,
    release = true,
  ) => {
    const batch = writeBatch(employee);
    batch.update(doc(employee, path("records/treatments~a:c")), {
      end_ms,
      duration_ms,
    });
    batch.update(doc(employee, path("records/appointment_customers~a:c")), {
      status: "Erledigt",
    });
    batch.update(doc(employee, path("visit_guards/a~0")), { pending_ids: [] });
    batch.set(doc(employee, path("finance/a:c")), { ...fin, completed });
    if (release) {
      batch.delete(doc(employee, path("locks/actor:employee")));
      batch.delete(doc(employee, path("locks/customer:c")));
    }
    return batch.commit();
  };
  await assertFails(invalidFinish(-1, t.start_ms - 1));
  await assertFails(invalidFinish(-1, t.start_ms + 1000));
  await assertFails(invalidFinish(1000, t.start_ms + 1000, false));
  await assertFails(invalidFinish(1000, t.start_ms + 1000, true, false));
  await assertFails(
    setDoc(
      doc(owner, path("records/treatments~a:c")),
      { duration_minutes: -1 },
      { merge: true },
    ),
  );
  console.log(
    "PASS: direct closure, forged guards, negative duration, reversed time, missing finance and unreleased locks rejected atomically",
  );
  const centFinance = {
    ...fin,
    total_cents: 30,
    service_ids: ["ten", "twenty"],
    lines: [
      { service_id: "ten", name: "Ten", price_cents: 10, duration: 1 },
      { service_id: "twenty", name: "Twenty", price_cents: 20, duration: 1 },
    ],
  };
  await assertSucceeds(setDoc(doc(employee, path("finance/a:c")), centFinance));
  await assertFails(
    setDoc(doc(employee, path("finance/a:c")), {
      ...centFinance,
      total_cents: 0.30000000000000004,
    }),
  );
  await assertSucceeds(setDoc(doc(employee, path("finance/a:c")), fin));
  await assertFails(
    setDoc(doc(owner, path("members/second-chief")), {
      id: "second-chief",
      user_id: "second-chief",
      business_id: "owner",
      role: "owner",
      display_name: "Bad",
      is_active: true,
      facility_ids: [],
      permissions: {},
    }),
  );
  await assertFails(
    setDoc(doc(employee, path("audit/forged")), {
      id: "forged",
      actor_id: "employee",
      action: "business_role_changed",
      record_id: "c",
      details: {},
      created_at: "1900-01-01",
    }),
  );
  const forged = writeBatch(employee);
  forged.update(doc(employee, path("state/revision")), { value: 1 });
  forged.update(doc(employee, path("records/customers~c")), {
    _audit_revision: 1,
  });
  forged.set(doc(employee, path("audit/forged-proof")), {
    id: "forged-proof",
    actor_id: "employee",
    business_id: "owner",
    action: "data_changed",
    record_id: "c",
    target_path: path("records/customers~c"),
    operation: "write",
    revision: 1,
    details: {},
    created_at: serverTimestamp(),
  });
  await assertFails(forged.commit());
  console.log(
    "PASS: integer-cent regression, duplicate director rejection, privileged/past/standalone audit forgery rejection",
  );
  const end = writeBatch(employee);
  end.update(doc(employee, path("records/treatments~a:c")), {
    end_ms: t.start_ms + 1000,
    duration_ms: 1000,
  });
  end.update(doc(employee, path("records/appointment_customers~a:c")), {
    status: "Erledigt",
  });
  end.update(doc(employee, path("visit_guards/a~0")), { pending_ids: [] });
  end.set(doc(employee, path("finance/a:c")), { ...fin, completed: true });
  end.delete(doc(employee, path("locks/actor:employee")));
  end.delete(doc(employee, path("locks/customer:c")));
  await assertSucceeds(end.commit());
  await assertFails(getDoc(doc(employee, path("finance/a:c"))));
  await assertFails(
    setDoc(
      doc(employee, path("records/treatments~a:c")),
      { notes: "changed" },
      { merge: true },
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(owner, path("members/employee")),
      { is_active: false },
      { merge: true },
    ),
  );
  await assertFails(getDoc(doc(employee, path("records/customers~c"))));
  console.log(
    "PASS: finish hides finance immediately, immutable history, immediate role revocation",
  );
} finally {
  await env.cleanup();
}
