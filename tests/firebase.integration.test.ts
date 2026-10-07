import { describe, it, beforeAll, afterAll, expect } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  writeBatch,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import type { FirebaseRepository } from "../src/firebaseRepository";
let env: RulesTestEnvironment,
  owner: FirebaseRepository,
  worker: FirebaseRepository,
  workerDb: Firestore;
const suite = process.env.RUN_FIREBASE_TESTS === "1" ? describe : describe.skip;
suite("Firebase Spark real transaction workflows", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-heimfriseur",
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: readFileSync("firebase-parallel/firestore.rules", "utf8"),
      },
    });
    await env.clearFirestore();
    const db = (
      env
        .authenticatedContext("owner", {
          email: "owner@test.invalid",
          email_verified: true,
        })
        .firestore() as unknown as { _delegate: Firestore }
    )._delegate;
    workerDb = (
      env
        .authenticatedContext("employee", {
          email: "employee@test.invalid",
          email_verified: true,
        })
        .firestore() as unknown as { _delegate: Firestore }
    )._delegate;
    const b = writeBatch(db),
      base = "hf_businesses/owner";
    b.set(doc(db, base), {
      name: "Test",
      owner_user_id: "owner",
      owner_email: "owner@test.invalid",
      created_at: new Date().toISOString(),
    });
    b.set(doc(db, "hf_accounts/owner"), { business_id: "owner" });
    b.set(doc(db, base, "members", "owner"), {
      id: "owner",
      user_id: "owner",
      business_id: "owner",
      role: "owner",
      display_name: "Chef",
      is_active: true,
      facility_ids: [],
      permissions: {},
    });
    b.set(doc(db, base, "state", "revision"), { value: 0 });
    b.set(doc(db, base, "catalogue", "main"), { services: {}, prices: {} });
    await b.commit();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), base, "members", "employee"), {
        id: "employee",
        user_id: "employee",
        business_id: "owner",
        role: "employee",
        display_name: "Team",
        is_active: true,
        facility_ids: [],
        permissions: {
          record_payments: true,
          close_visits: true,
          add_customers: true,
          edit_customers: true,
          edit_schedule: true,
        },
      });
    });
    const module = await import("../src/firebaseRepository");
    owner = new module.FirebaseRepository(db, "owner", "owner");
    worker = new module.FirebaseRepository(workerDb, "employee", "owner");
    for (const r of [owner, worker]) {
      const call = r.mutate.bind(r);
      r.mutate = async (action, p) => {
        console.log("ACTION", r === owner ? "owner" : "employee", action);
        return call(action, p);
      };
    }
  }, 20000);
  afterAll(async () => env?.cleanup());
  it("creates data, assigns a visit, treats and skips customers, closes recurrence and preserves snapshots", async () => {
    const invitation = await owner.mutate("create_team_invite", {
      p_email: "new-worker@test.invalid",
    });
    expect(invitation.token).toBeTruthy();
    let invitationState = await owner.snapshot();
    const inviteId = invitationState.team.invitations.find(
      (i) => i.email === "new-worker@test.invalid",
    )!.id;
    await owner.mutate("revoke_team_invite", { p_invite: inviteId });
    invitationState = await owner.snapshot();
    expect(
      invitationState.team.invitations.find((i) => i.id === inviteId)
        ?.revoked_at,
    ).toBeTruthy();
    const facility = await owner.mutate("save", {
      table: "facilities",
      row: { name: "Testheim" },
    });
    const group = await owner.mutate("save_group_flexible", {
      p_data: {
        facility_id: facility,
        name: "Gruppe A",
        recurrence_weeks: 5,
        preferred_weekday: 2,
        preferred_start_time: "09:00",
      },
    });
    const service = await owner.mutate("save", {
      table: "services",
      row: {
        name: "Schneiden",
        price: 28,
        duration_minutes: 30,
        is_active: true,
      },
    });
    const selectedServices = [service];
    for (let i = 1; i < 4; i++)
      selectedServices.push(
        await owner.mutate("save", {
          table: "services",
          row: {
            name: `Zusatz ${i}`,
            price: 1,
            duration_minutes: 1,
            is_active: true,
          },
        }),
      );
    const customer = await owner.mutate("save_customer", {
      p_data: {
        first_name: "Erika",
        last_name: "Test",
        facility_id: facility,
        group_id: group,
      },
      p_services: selectedServices,
    });
    await owner.mutate("save_customer", {
      p_data: {
        first_name: "Hans",
        last_name: "Test",
        facility_id: facility,
        group_id: group,
      },
      p_services: [service],
    });
    for (let i = 0; i < 12; i++)
      await owner.mutate("save_customer", {
        p_data: {
          first_name: `Weitere ${i}`,
          last_name: "Test",
          facility_id: facility,
          group_id: group,
        },
        p_services: [service],
      });
    const visit = await owner.mutate("plan_customer_visit", {
      p_facility: facility,
      p_group: group,
      p_date: "2026-10-06",
      p_time: "09:00",
      p_weeks: 5,
      p_all: true,
    });
    await owner.mutate("assign_visit", {
      p_appointment: visit,
      p_users: ["employee"],
      p_responsible: "employee",
    });
    let snap = await worker.snapshot();
    expect(snap.data.appointment_customers).toHaveLength(14);
    const member = snap.data.appointment_customers.find(
      (m) => m.customer_id === customer,
    )!;
    const treatment = await worker.mutate("start_treatment", {
      p_member: member.id,
    });
    snap = await worker.snapshot();
    expect(snap.data.treatments[0].total_price).toBe(31);
    await owner.mutate("save_facility_price_list", {
      p_facility: facility,
      p_prices: { [service]: 33 },
    });
    await worker.mutate("save_treatment", {
      p_treatment: treatment,
      p_services: selectedServices,
      p_price: null,
      p_material: 2,
      p_notes: "",
      p_finish: true,
      p_formula: null,
    });
    snap = await worker.snapshot();
    expect(snap.data.treatments[0].total_price).toBeNull();
    expect(snap.data.treatment_services[0].price_snapshot).toBeNull();
    await worker.mutate("record_payment", {
      p_treatment: treatment,
      p_data: { payment_method_id: null, status: "Offen" },
    });
    const paid = await owner.snapshot();
    expect(paid.data.treatment_payments[0].amount).toBe(31);
    for (const next of snap.data.appointment_customers.filter(
      (m) => m.customer_id !== customer,
    )) {
      await worker.mutate("skip_customer_choice", {
        p_member: next.id,
        p_reason: "Nicht anwesend",
        p_choice: "next_visit",
        p_date: null,
      });
    }
    await worker.mutate("close_visit", { p_appointment: visit });
    let all = await owner.snapshot();
    expect(all.data.treatments[0].total_price).toBe(31);
    expect(all.data.treatments[0].material_cost).toBe(2);
    expect(
      all.data.appointments.find((a) => a.id !== visit)?.appointment_date,
    ).toBe("2026-11-10");
    await owner.mutate("save_facility_price_list", {
      p_facility: facility,
      p_prices: { [service]: 33 },
    });
    all = await owner.snapshot();
    expect(all.data.treatments[0].total_price).toBe(31);
    expect(
      all.data.treatment_services.find((s) => s.service_id === service)
        ?.price_snapshot,
    ).toBe(28);
    await owner.mutate("set_member_active", {
      p_member: "employee",
      p_active: false,
    });
    await expect(worker.snapshot()).rejects.toBeTruthy();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "hf_admins", "platform-admin"), {
        is_active: true,
      });
    });
    const adminDb = (
      env
        .authenticatedContext("platform-admin", {
          email: "admin@test.invalid",
          email_verified: true,
        })
        .firestore() as unknown as { _delegate: Firestore }
    )._delegate;
    const module = await import("../src/firebaseRepository");
    const platform = new module.FirebaseRepository(
      adminDb,
      "platform-admin",
      "owner",
    );
    const administrative = await platform.snapshot();
    expect(administrative.data.treatments[0].total_price).toBe(31);
    expect(
      administrative.team.members.some((m) => m.user_id === "platform-admin"),
    ).toBe(false);
    await platform.mutate("save", {
      table: "facilities",
      row: { id: facility, name: "Vom App-Admin bearbeitet" },
    });
    expect((await owner.snapshot()).data.facilities[0].name).toBe(
      "Vom App-Admin bearbeitet",
    );
    const { changeFirebaseAdmin, changeFirebaseBusinessRole } =
      await import("../src/firebaseAdministration");
    const workerEmail = "employee@test.invalid";
    // Directory metadata never grants authority. Only the verified user may
    // publish their own identity; directors and employees cannot list it.
    await setDoc(doc(workerDb, "hf_users", "employee"), {
      uid: "employee",
      email: workerEmail,
      display_name: "Team",
      updated_at: new Date().toISOString(),
    });
    await expect(
      setDoc(doc(workerDb, "hf_users", "somebody-else"), {
        uid: "somebody-else",
        email: workerEmail,
        display_name: "Forged",
      }),
    ).rejects.toBeTruthy();
    await expect(
      getDocs(collection(workerDb, "hf_users")),
    ).rejects.toBeTruthy();
    await expect(
      changeFirebaseAdmin(workerDb, "employee", workerEmail, true),
    ).rejects.toBeTruthy();
    await changeFirebaseAdmin(adminDb, "platform-admin", workerEmail, true);
    expect(
      (await getDoc(doc(adminDb, "hf_admins", "employee"))).data()?.is_active,
    ).toBe(true);
    await expect(
      changeFirebaseAdmin(workerDb, "employee", workerEmail, false),
    ).rejects.toThrow("eigenen Admin-Zugang");
    // Server rules protect self-revocation even if the browser guard is bypassed.
    const selfRevoke = writeBatch(workerDb);
    selfRevoke.set(doc(workerDb, "hf_admin_audit", "self-revoke"), {
      actor_id: "employee",
      action: "admin_access_changed",
      business_id: null,
      created_at: new Date().toISOString(),
      details: { target_user_id: "employee" },
    });
    selfRevoke.set(doc(workerDb, "hf_admins", "employee"), {
      email: workerEmail,
      is_active: false,
      updated_at: new Date().toISOString(),
      audit_id: "self-revoke",
    });
    await expect(selfRevoke.commit()).rejects.toBeTruthy();
    await changeFirebaseAdmin(adminDb, "platform-admin", workerEmail, false);
    await expect(
      updateDoc(
        doc(workerDb, "hf_businesses", "owner", "members", "employee"),
        { role: "owner" },
      ),
    ).rejects.toBeTruthy();
    await changeFirebaseBusinessRole(
      adminDb,
      "platform-admin",
      "employee",
      "owner",
      "owner",
    );
    expect(
      (await getDoc(doc(adminDb, "hf_businesses", "owner"))).data()
        ?.owner_user_id,
    ).toBe("employee");
    expect(
      (
        await getDoc(doc(adminDb, "hf_businesses", "owner", "members", "owner"))
      ).data()?.role,
    ).toBe("employee");
    const transferred = await worker.snapshot();
    expect(transferred.data.treatments[0].total_price).toBe(31);
    expect(transferred.data.facilities[0].user_id).toBe("employee");
    await expect(
      changeFirebaseBusinessRole(
        adminDb,
        "platform-admin",
        "employee",
        "owner",
        "employee",
      ),
    ).rejects.toThrow("zuerst einen anderen Geschäftsführer");
    expect(
      (await getDocs(collection(adminDb, "hf_admin_audit"))).size,
    ).toBeGreaterThanOrEqual(3);
  }, 60000);
});
