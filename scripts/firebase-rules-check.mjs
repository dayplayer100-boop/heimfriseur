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
      s: { name: "Schneiden", price: 28, duration: 30, is_active: true },
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
      }),
    );
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
      total_price: 28,
      material_cost: 2,
      price_override: null,
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
    start_time: new Date().toISOString(),
    end_time: null,
    duration_minutes: null,
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
    actual_start_time: t.start_time,
  });
  const fin = {
    treatment_id: "a:c",
    total_price: 28,
    material_cost: 0,
    price_override: null,
    completed: false,
    performed_by: "employee",
    service_ids: ["s"],
    lines: [{ service_id: "s", name: "Schneiden", price: 28, duration: 30 }],
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
      ),
    ),
  );
  await assertFails(
    setDoc(doc(employee, path("finance/a:c")), {
      ...fin,
      total_price: 1,
      lines: [{ service_id: "s", name: "Schneiden", price: 1, duration: 30 }],
    }),
  );
  await assertFails(
    setDoc(doc(employee, path("finance/a:c")), {
      ...fin,
      total_price: 1,
      price_override: 1,
    }),
  );
  console.log(
    "PASS: atomic start, private running finance, catalog price validation",
  );
  const end = writeBatch(employee);
  end.update(doc(employee, path("records/treatments~a:c")), {
    end_time: new Date().toISOString(),
    duration_minutes: 1,
  });
  end.update(doc(employee, path("records/appointment_customers~a:c")), {
    status: "Erledigt",
  });
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
