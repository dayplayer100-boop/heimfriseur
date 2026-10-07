import {
  acceptFirebaseInvite,
  usableFirebaseInvite,
} from "./firebaseInvitations";
import { defaultServices } from "./defaultServices";
import {
  changeFirebaseAdmin,
  changeFirebaseBusinessRole,
} from "./firebaseAdministration";
import {
  splitFirebaseData,
  joinFirebaseData,
  assertFirebaseData,
  firebaseRecordId,
  sameFirebaseDocument,
} from "./firebaseData";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  runTransaction,
  increment,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebaseClient";
import { WorkflowRepository } from "./workflowRepository";
import {
  emptyData,
  type Data,
  type Table,
  type TeamContext,
  type TeamMember,
  type AppAdminContext,
} from "./types";
import { firebaseError } from "./FirebaseAuth";

const tables = Object.keys(emptyData()) as Table[];
type Json = Record<string, any>;
const clean = (value: unknown): any => JSON.parse(JSON.stringify(value));
function hashToken(token: string) {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(token))
    .then((a) =>
      Array.from(new Uint8Array(a), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    );
}
function permission(member: TeamMember, name: string) {
  return (
    member.role === "owner" ||
    (member.permissions as Json)?.[name] === true ||
    ((member.permissions as Json)?.[name] === undefined &&
      ["record_payments", "close_visits"].includes(name))
  );
}
function normalizeKeys(data: Data, before: Data) {
  for (const m of data.appointment_customers)
    if (!before.appointment_customers.some((x) => x.id === m.id)) {
      const old = m.id;
      m.id = `${m.appointment_id}:${m.customer_id}`;
      for (const t of data.treatments)
        if (t.appointment_customer_id === old) t.appointment_customer_id = m.id;
    }
  for (const t of data.treatments)
    if (!before.treatments.some((x) => x.id === t.id)) {
      const old = t.id;
      t.id = t.appointment_customer_id;
      for (const s of data.treatment_services)
        if (s.treatment_id === old) s.treatment_id = t.id;
      t.performed_by ||= firebaseAuth?.currentUser?.uid;
    }
}

export class FirebaseRepository {
  constructor(
    private db: Firestore,
    public readonly uid: string,
    public businessId: string,
  ) {}
  private cache: { data: Data; revision: number; team: TeamContext } | null =
    null;
  private cachedMember = "";
  root = () => doc(this.db, "hf_businesses", this.businessId);
  private memberRef = (uid = this.uid) => doc(this.root(), "members", uid);
  private records = () => collection(this.root(), "records");
  private finance = () => collection(this.root(), "finance");
  private async getContext() {
    const [b, m, admin] = await Promise.all([
      getDocFromServer(this.root()),
      getDocFromServer(this.memberRef()),
      getDocFromServer(doc(this.db, "hf_admins", this.uid)),
    ]);
    if (!b.exists()) throw Error("Unternehmen nicht gefunden.");
    const business = b.data();
    if (business._archived === true)
      throw Error(
        "Dieses zusätzliche Unternehmen wurde stillgelegt. Bitte das aktive Unternehmen öffnen.",
      );
    if (business._migration_state === "in_progress")
      throw Error(
        "Die Datenübertragung läuft noch. Bitte den Betreiber informieren und später erneut versuchen.",
      );
    const member =
      admin.data()?.is_active ||
      (m.data()?.is_active && m.data()?.permissions?.company_admin)
        ? {
            id: this.uid,
            user_id: this.uid,
            business_id: this.businessId,
            role: "owner",
            display_name: admin.data()?.is_active
              ? "App-Admin"
              : m.data()?.display_name || "Administrator",
            permissions: m.data()?.permissions || {},
            is_active: true,
            _synthetic: true,
          }
        : m.data();
    if (!member?.is_active)
      throw {
        code: "42501",
        message: "Du hast keinen Zugriff auf dieses Unternehmen.",
      };
    return {
      business,
      member: member as TeamMember & {
        facility_ids?: string[];
        _synthetic?: boolean;
      },
    };
  }
  async snapshot() {
    // Revision before/after guards an internally consistent snapshot. The version
    // is also read inside writes; concurrent editors never silently overwrite.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { business, member } = await this.getContext();
      const owner = member.role === "owner";
      const revision = await getDocFromServer(
        doc(this.root(), "state", "revision"),
      );
      if (
        this.cache &&
        this.cache.revision === (revision.data()?.value || 0) &&
        this.cachedMember === JSON.stringify(member)
      )
        return structuredClone(this.cache);
      let records: Json[] = [],
        finance: Json[] = [];
      if (owner) {
        const [r, f] = await Promise.all([
          getDocsFromServer(this.records()),
          getDocsFromServer(this.finance()),
        ]);
        records = r.docs.map((d) => d.data());
        finance = f.docs.map((d) => d.data());
      } else {
        const globalTables = ["services", "payment_methods"];
        const r = await getDocsFromServer(
          query(this.records(), where("_table", "in", globalTables)),
        );
        records = r.docs.map((d) => d.data());
        const ids = member.facility_ids || [];
        for (let n = 0; n < ids.length; n += 30) {
          const q = await getDocsFromServer(
            query(
              this.records(),
              where("_facility_id", "in", ids.slice(n, n + 30)),
            ),
          );
          records.push(
            ...q.docs
              .map((d) => d.data())
              .filter(
                (d) =>
                  d._table !== "customer_billing" && d._table !== "feedback",
              ),
          );
        }
        // Billing is a separate collection, so broad operational queries cannot
        // accidentally read contact information without the billing permission.
        if (permission(member, "view_billing")) {
          for (let n = 0; n < ids.length; n += 30) {
            const bills = await getDocsFromServer(
              query(
                collection(this.root(), "billing"),
                where("_facility_id", "in", ids.slice(n, n + 30)),
              ),
            );
            records.push(
              ...bills.docs.map((d) => ({
                ...d.data(),
                _table: "customer_billing",
              })),
            );
          }
        }
        const f = await getDocsFromServer(
          query(
            this.finance(),
            where("performed_by", "==", this.uid),
            where("completed", "==", false),
          ),
        );
        finance = f.docs.map((d) => d.data());
      }
      let ownerBilling: Data["customer_billing"] = [];
      if (owner)
        ownerBilling = (
          await getDocsFromServer(collection(this.root(), "billing"))
        ).docs.map((d) => d.data()) as Data["customer_billing"];
      const after = await getDocFromServer(
        doc(this.root(), "state", "revision"),
      );
      if ((revision.data()?.value || 0) !== (after.data()?.value || 0))
        continue;
      // Employee appointment scope uses its immutable assignment array.
      if (!owner) {
        const allowed = new Set(
          records
            .filter(
              (r) =>
                r._table === "appointments" &&
                (r.assigned_users || []).includes(this.uid),
            )
            .map((r) => r.id),
        );
        records = records.filter(
          (r) =>
            (r._table !== "appointments" &&
              r._table !== "appointment_customers") ||
            allowed.has(r._table === "appointments" ? r.id : r.appointment_id),
        );
      }
      if (!owner) {
        const appointmentIds = new Set(
          records.filter((r) => r._table === "appointments").map((r) => r.id),
        );
        const treatmentIds = new Set(
          records
            .filter(
              (r) =>
                r._table === "treatments" &&
                appointmentIds.has(r.appointment_id),
            )
            .map((r) => r.id),
        );
        records = records
          .filter(
            (r) =>
              r._table !== "treatments" || appointmentIds.has(r.appointment_id),
          )
          .filter(
            (r) =>
              !["treatment_services", "treatment_payments"].includes(
                r._table,
              ) || treatmentIds.has(r.treatment_id),
          );
      }
      const data = joinFirebaseData(records, finance);
      if (owner) data.customer_billing = ownerBilling;
      const members = owner
        ? (
            await getDocsFromServer(collection(this.root(), "members"))
          ).docs.map((d) => d.data() as TeamMember)
        : [member];
      const invites = owner
        ? (
            await getDocsFromServer(
              query(
                collection(this.db, "hf_invites"),
                where("business_id", "==", this.businessId),
              ),
            )
          ).docs.map((d) => ({ id: d.id, ...d.data() }))
        : [];
      const audit = owner
        ? (
            await getDocsFromServer(query(collection(this.root(), "audit")))
          ).docs.map((d) => d.data())
        : [];
      const assignments = data.appointments.flatMap((a) =>
        ((a as unknown as Json).assigned_users || []).map((uid: string) => ({
          id: `${a.id}:${uid}`,
          appointment_id: a.id,
          user_id: uid,
          is_responsible: (a as unknown as Json).responsible_user === uid,
        })),
      );
      this.cachedMember = JSON.stringify(member);
      this.cache = {
        data,
        revision: after.data()?.value || 0,
        team: {
          business: {
            id: this.businessId,
            owner_user_id: business.owner_user_id,
            name: business.name,
          },
          membership: member,
          members,
          assignments,
          invitations: invites,
          audit,
        } as TeamContext,
      };
      return structuredClone(this.cache);
    }
    throw Error("Das Team arbeitet gerade parallel. Bitte erneut laden.");
  }
  async mutate(action: string, p: Json = {}) {
    const snapshot = await this.snapshot(),
      { data: before, team } = snapshot;
    const workflow = new WorkflowRepository(
      before,
      this.uid,
      team.business.owner_user_id,
    );
    const owner = team.membership.role === "owner";
    const required: Record<string, string> = {
      save_customer: p.p_data?.id ? "edit_customers" : "add_customers",
      save_group_flexible: "edit_schedule",
      plan_customer_visit: "edit_schedule",
      plan_visit_flexible: "edit_schedule",
      move_visit: "edit_schedule",
      reschedule_customer_once: "edit_schedule",
      save_billing: "view_billing",
      record_payment: "record_payments",
      close_visit: "close_visits",
    };
    const allowed = [
      "start_treatment",
      "save_treatment",
      "skip_customer_choice",
      "skip_customer_followup",
      "skip_customer",
      "add_customer_to_visit",
      "add_visit_customer",
      "complete_onboarding",
      "submit_feedback",
      ...Object.keys(required),
    ];
    if (
      !owner &&
      (!allowed.includes(action) ||
        (required[action] && !permission(team.membership, required[action])))
    )
      throw { code: "42501" };
    if (
      action === "save_treatment" &&
      !owner &&
      p.p_price != null &&
      !permission(team.membership, "override_prices")
    )
      throw { code: "42501" };
    if (action === "save_treatment" && p.p_services?.length > 4)
      throw new Error(
        "Bitte höchstens vier Leistungen pro Behandlung auswählen.",
      );
    let result: any;
    const extra: { ref: DocumentReference; value?: Json; remove?: boolean }[] =
      [];
    const extraRead = new Map<string, Json | undefined>();
    const extraSet = async (ref: DocumentReference, value: Json) => {
      const existing = await getDocFromServer(ref);
      extraRead.set(ref.path, existing.data());
      extra.push({ ref, value });
    };
    if (action === "save") {
      if (
        !owner ||
        ![
          "profiles",
          "facilities",
          "groups",
          "customers",
          "services",
          "color_formulas",
        ].includes(p.table)
      )
        throw { code: "42501" };
      result = workflow.save(p.table, p.row);
    } else if (action === "remove") {
      if (
        !owner ||
        ![
          "facilities",
          "groups",
          "customers",
          "services",
          "color_formulas",
        ].includes(p.table)
      )
        throw { code: "42501" };
      workflow.remove(p.table, p.id);
    } else if (["complete_setup", "complete_onboarding"].includes(action)) {
      if ((team.membership as any)._synthetic) return null;
      await extraSet(this.memberRef(), {
        ...team.membership,
        [action === "complete_setup"
          ? "setup_completed"
          : "onboarding_completed"]: true,
      });
    } else if (action === "assign_visit") {
      const a = workflow.data.appointments.find(
        (a) => a.id === p.p_appointment,
      ) as unknown as Json;
      if (!a) throw Error("Besuch nicht gefunden.");
      if (
        !owner ||
        p.p_users.some(
          (uid: string) =>
            !team.members.some((m) => m.user_id === uid && m.is_active),
        )
      )
        throw { code: "42501" };
      a.assigned_users = [...new Set(p.p_users)];
      a.responsible_user = p.p_responsible;
      for (const member of team.members.filter((m) => m.role === "employee")) {
        const facilities = [
          ...new Set(
            workflow.data.appointments
              .filter((a) =>
                (a as unknown as Json).assigned_users?.includes(member.user_id),
              )
              .map((a) => a.facility_id),
          ),
        ];
        await extraSet(this.memberRef(member.user_id), {
          ...member,
          facility_ids: facilities,
        });
      }
    } else if (
      ["set_member_permissions", "set_member_active"].includes(action)
    ) {
      const member = team.members.find((m) => m.id === p.p_member);
      if (
        !owner ||
        !member ||
        member.role === "owner" ||
        member.user_id === this.uid
      )
        throw { code: "42501" };
      await extraSet(this.memberRef(member.user_id), {
        ...member,
        ...(action === "set_member_active"
          ? { is_active: p.p_active }
          : { permissions: p.p_permissions }),
      });
    } else if (action === "apply_default_prices") {
      if (!owner) throw { code: "42501" };
      for (const template of defaultServices) {
        const existing = workflow.data.services.find((s) =>
          [template.name, ...template.aliases].some(
            (n) => n.toLowerCase() === s.name.toLowerCase(),
          ),
        );
        workflow.save("services", {
          ...(existing || {}),
          name: template.name,
          price: template.price,
          duration_minutes:
            existing?.duration_minutes || template.duration_minutes,
          is_active: true,
        });
      }
    } else if (["create_team_invite", "renew_team_invite"].includes(action)) {
      if (action === "renew_team_invite") {
        if (!owner) throw { code: "42501" };
        const ref = doc(this.db, "hf_invites", p.p_invite);
        const prior = await getDocFromServer(ref);
        if (
          prior.data()?.business_id !== this.businessId ||
          prior.data()?.accepted_at
        )
          throw Error("Diese Einladung kann nicht erneuert werden.");
        p.p_email = prior.data()!.email;
        p.p_role = prior.data()!.role || "employee";
        await extraSet(ref, {
          ...prior.data(),
          revoked_at: new Date().toISOString(),
        });
      }
      if (
        !owner ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.p_email || "").trim())
      )
        throw Error("E-Mail-Adresse prüfen.");
      const token = crypto.randomUUID() + crypto.randomUUID();
      const id = await hashToken(token);
      extra.push({
        ref: doc(this.db, "hf_invites", id),
        value: {
          business_id: this.businessId,
          email: p.p_email.trim().toLowerCase(),
          link_token: token,
          role:
            action === "renew_team_invite"
              ? p.p_role || "employee"
              : p.p_role === "admin"
                ? "admin"
                : "employee",
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          expires_at_ms: Date.now() + 7 * 86400000 - 60000,
          accepted_at: null,
          revoked_at: null,
        },
      });
      result = { token, email: p.p_email.trim().toLowerCase() };
    } else if (action === "revoke_team_invite") {
      if (!owner) throw { code: "42501" };
      const ref = doc(this.db, "hf_invites", p.p_invite);
      const i = await getDocFromServer(ref);
      if (i.data()?.business_id !== this.businessId) throw { code: "42501" };
      await extraSet(ref, {
        ...i.data(),
        revoked_at: new Date().toISOString(),
      });
    } else if (action === "take_over_treatment") {
      if (!owner) throw { code: "42501" };
      const t = workflow.data.treatments.find((t) => t.id === p.p_treatment);
      if (!t || t.end_time) throw Error("Keine laufende Behandlung.");
      if (
        workflow.data.treatments.some(
          (x) => !x.end_time && x.performed_by === this.uid && x.id !== t.id,
        )
      )
        throw Error("Bitte zuerst die eigene Behandlung beenden.");
      t.performed_by = this.uid;
    } else if (action === "correct_treatment") {
      if (!owner || !p.p_reason?.trim()) throw { code: "42501" };
      const t = workflow.data.treatments.find((t) => t.id === p.p_treatment);
      if (!t?.end_time) throw Error("Behandlung noch nicht abgeschlossen.");
      t.total_price = p.p_price;
      t.material_cost = p.p_material;
      const payment = workflow.data.treatment_payments.find(
        (x) => x.treatment_id === t.id,
      );
      if (payment) payment.amount = p.p_price;
    } else {
      result = await workflow.rpc(action, p);
    }
    normalizeKeys(workflow.data, before);
    if (action === "start_treatment")
      result = workflow.data.treatments.find(
        (t) => t.appointment_customer_id === p.p_member && !t.end_time,
      )?.id;
    for (const a of workflow.data.appointments)
      if (!before.appointments.some((x) => x.id === a.id))
        Object.assign(a, {
          assigned_users: [this.uid],
          responsible_user: this.uid,
        });
    if (
      workflow.data.treatments.some(
        (t) =>
          !t.end_time &&
          workflow.data.treatment_services.filter(
            (s) => s.treatment_id === t.id,
          ).length > 4,
      )
    )
      throw new Error(
        "Die Firebase-Testversion unterstützt höchstens vier Leistungen pro Behandlung. Bitte eine kombinierte Leistung anlegen.",
      );
    assertFirebaseData(workflow.data);
    const old = splitFirebaseData(
        before,
        this.businessId,
        team.business.owner_user_id,
      ),
      next = splitFirebaseData(
        workflow.data,
        this.businessId,
        team.business.owner_user_id,
      );
    // Billing is separate from operational records; finance fields never enter them.
    for (const set of [old.records, next.records])
      for (const [id, r] of set)
        if (r._table === "customer_billing") set.delete(id);
    for (const row of workflow.data.customer_billing) {
      const prior = before.customer_billing.find((r) => r.id === row.id);
      if (JSON.stringify(prior) !== JSON.stringify(row))
        extra.push({
          ref: doc(this.root(), "billing", row.id),
          value: clean({
            ...row,
            _table: "customer_billing",
            _facility_id:
              workflow.data.customers.find((c) => c.id === row.customer_id)
                ?.facility_id || "",
            business_id: this.businessId,
            user_id: team.business.owner_user_id,
          }),
        });
    }
    const writes: { ref: DocumentReference; value?: Json; remove?: boolean }[] =
      [...extra];
    for (const [id, row] of next.records)
      if (JSON.stringify(old.records.get(id)) !== JSON.stringify(row))
        writes.push({ ref: doc(this.records(), id), value: row });
    for (const id of old.records.keys())
      if (!next.records.has(id))
        writes.push({ ref: doc(this.records(), id), remove: true });
    for (const [id, row] of next.finances)
      if (JSON.stringify(old.finances.get(id)) !== JSON.stringify(row))
        writes.push({ ref: doc(this.finance(), id), value: row });
    if (!writes.length) return result;
    // Rules access limits and Spark quotas are explicit: never split a treatment
    // across several commits. Large bulk edits must be performed in smaller visits.
    if (writes.length > 350)
      throw Error(
        "Zu viele Änderungen auf einmal. Bitte kleinere Besuche oder Gruppen verwenden.",
      );
    const catalogueChanged = ["services", "facility_service_prices"].some(
      (table) =>
        JSON.stringify(before[table as Table]) !==
        JSON.stringify(workflow.data[table as Table]),
    );
    if (catalogueChanged) {
      if (!owner) throw { code: "42501" };
      const serviceMap = Object.fromEntries(
        workflow.data.services.map((s) => [
          s.id,
          {
            name: s.name,
            price: s.price,
            duration: s.duration_minutes,
            is_active: s.is_active,
          },
        ]),
      );
      const priceMap = Object.fromEntries(
        workflow.data.facility_service_prices.map((s) => [
          `${s.facility_id}:${s.service_id}`,
          s.price,
        ]),
      );
      writes.push({
        ref: doc(this.root(), "catalogue", "main"),
        value: { services: serviceMap, prices: priceMap },
      });
    }
    // One lock per performer and customer, checked by rules, protects double starts
    // even when different phones execute a transaction simultaneously.
    const ended = workflow.data.treatments.filter(
      (t) =>
        t.end_time &&
        before.treatments.some((x) => x.id === t.id && !x.end_time),
    );
    const started = workflow.data.treatments.filter(
      (t) => !t.end_time && !before.treatments.some((x) => x.id === t.id),
    );
    const takeover = workflow.data.treatments.filter(
      (t) =>
        !t.end_time &&
        before.treatments.some(
          (x) => x.id === t.id && x.performed_by !== t.performed_by,
        ),
    );
    const locks: {
      ref: DocumentReference;
      value: Json | null;
      expected: string | null;
    }[] = [];
    for (const t of [...started, ...takeover])
      for (const key of [`actor:${this.uid}`, `customer:${t.customer_id}`])
        locks.push({
          ref: doc(this.root(), "locks", key),
          value: { treatment_id: t.id, performed_by: this.uid },
          expected: takeover.includes(t) ? t.id : null,
        });
    for (const t of ended)
      for (const key of [
        `actor:${t.performed_by}`,
        `customer:${t.customer_id}`,
      ])
        locks.push({
          ref: doc(this.root(), "locks", key),
          value: null,
          expected: t.id,
        });
    for (const t of takeover) {
      const previous = before.treatments.find((x) => x.id === t.id)!;
      locks.push({
        ref: doc(this.root(), "locks", `actor:${previous.performed_by}`),
        value: null,
        expected: t.id,
      });
    }
    const revisionRef = doc(this.root(), "state", "revision");
    await runTransaction(this.db, async (tx) => {
      const revision = await tx.get(revisionRef);
      if ((revision.data()?.value || 0) !== snapshot.revision)
        throw Error("Daten wurden parallel geändert. Bitte erneut versuchen.");
      for (const [path, expected] of extraRead) {
        const current = await tx.get(doc(this.db, path));
        if (!sameFirebaseDocument(current.data(), expected))
          throw Error(
            "Teamzuordnung wurde parallel geändert. Bitte erneut laden.",
          );
      }
      for (const lock of locks) {
        const current = await tx.get(lock.ref);
        if ((current.data()?.treatment_id || null) !== lock.expected)
          throw Error("Eine Behandlung läuft bereits. Bitte neu laden.");
      }
      for (const w of writes) {
        if (w.remove) tx.delete(w.ref);
        else tx.set(w.ref, clean(w.value));
      }
      for (const lock of locks) {
        if (lock.value) tx.set(lock.ref, lock.value);
        else tx.delete(lock.ref);
      }
      tx.set(revisionRef, { value: snapshot.revision + 1 });
      tx.set(doc(collection(this.root(), "audit")), {
        id: crypto.randomUUID(),
        actor_id: this.uid,
        action,
        record_id: result || p.p_treatment || p.p_appointment || p.id || "",
        details:
          action === "correct_treatment"
            ? {
                reason: p.p_reason,
                old_price: before.treatments.find((t) => t.id === p.p_treatment)
                  ?.total_price,
                new_price: p.p_price,
              }
            : {},
        created_at: new Date().toISOString(),
      });
    });
    return result;
  }
}

let currentRepository: FirebaseRepository | null = null;
function db() {
  if (!firestore || !firebaseAuth?.currentUser?.emailVerified)
    throw {
      code: "42501",
      message: "Bitte zuerst deine E-Mail-Adresse bestätigen.",
    };
  return firestore;
}
export async function firebaseAdminContext(): Promise<AppAdminContext> {
  const database = db(),
    uid = firebaseAuth!.currentUser!.uid;
  const admin = await getDocFromServer(doc(database, "hf_admins", uid));
  const directoryRef = doc(database, "hf_users", uid);
  let directory;
  try {
    directory = await getDocFromServer(directoryRef);
  } catch (e) {
    if ((e as { code?: string }).code !== "permission-denied") throw e;
  }
  const signedUser = firebaseAuth!.currentUser!;
  const email = signedUser.email!.trim().toLowerCase();
  const display_name = signedUser.displayName || email;
  if (
    directory?.data()?.email !== email ||
    directory?.data()?.display_name !== display_name
  ) {
    try {
      await runTransaction(database, async (tx) => {
        tx.set(directoryRef, {
          uid,
          email,
          display_name,
          updated_at: new Date().toISOString(),
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "permission-denied") throw e;
    }
  }
  if (!admin.data()?.is_active) return { is_admin: false };
  let selection = "";
  try {
    const s = JSON.parse(
      sessionStorage.getItem("heimfriseur-admin-business") || "{}",
    );
    if (s.userId === uid) selection = s.businessId || "";
  } catch {
    /* local preferences grant no rights */
  }
  const businesses = (
    await getDocsFromServer(collection(database, "hf_businesses"))
  ).docs
    .filter((d) => d.data()._archived !== true)
    .map((d) => ({
      id: d.id,
      ...d.data(),
    })) as AppAdminContext["businesses"];
  const admins = (
    await getDocsFromServer(collection(database, "hf_admins"))
  ).docs.map((d) => ({
    user_id: d.id,
    ...d.data(),
  })) as AppAdminContext["admins"];
  if (selection && !businesses?.some((b) => b.id === selection)) selection = "";
  const preferred = admin.data()?.default_business_id;
  if (!selection && businesses?.some((b) => b.id === preferred))
    selection = preferred;
  const audit = (
    await getDocsFromServer(collection(database, "hf_admin_audit"))
  ).docs.map((d) => ({ id: d.id, ...d.data() })) as AppAdminContext["audit"];
  let users: AppAdminContext["users"];
  try {
    const accounts = await getDocsFromServer(
      collection(database, "hf_accounts"),
    );
    users = (
      await getDocsFromServer(collection(database, "hf_users"))
    ).docs.map((d) => ({
      uid: d.id,
      ...d.data(),
      business_id:
        accounts.docs.find((a) => a.id === d.id)?.data().business_id || null,
    })) as AppAdminContext["users"];
  } catch (e) {
    if ((e as { code?: string }).code !== "permission-denied") throw e;
  }
  return {
    is_admin: true,
    selected_business_id: selection || null,
    businesses,
    admins,
    users,
    audit: audit?.sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}
export async function firebaseInitialize() {
  const database = db(),
    user = firebaseAuth!.currentUser!;
  const ref = doc(database, "hf_accounts", user.uid);
  await runTransaction(database, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) return;
    const root = doc(database, "hf_businesses", user.uid);
    const member = {
      id: user.uid,
      user_id: user.uid,
      business_id: user.uid,
      role: "owner",
      display_name: user.displayName || "Geschäftsführer",
      is_active: true,
      facility_ids: [],
      permissions: {},
    };
    tx.set(root, {
      name: "Mein Unternehmen",
      owner_user_id: user.uid,
      owner_email: user.email,
      created_at: new Date().toISOString(),
    });
    tx.set(ref, { business_id: user.uid });
    tx.set(doc(root, "members", user.uid), member);
    tx.set(doc(root, "state", "revision"), { value: 0 });
    const services = defaultServices.map((s, index) => ({
      id: `default-service-${index + 1}`,
      user_id: user.uid,
      business_id: user.uid,
      _table: "services",
      _facility_id: "",
      name: s.name,
      price: s.price,
      duration_minutes: s.duration_minutes,
      is_active: true,
      created_at: new Date().toISOString(),
    }));
    for (const service of services)
      tx.set(
        doc(root, "records", firebaseRecordId("services", service.id)),
        service,
      );
    tx.set(doc(root, "catalogue", "main"), {
      services: Object.fromEntries(
        services.map((s) => [
          s.id,
          {
            name: s.name,
            price: s.price,
            duration: s.duration_minutes,
            is_active: true,
          },
        ]),
      ),
      prices: {},
    });
    tx.set(doc(root, "records", firebaseRecordId("profiles", user.uid)), {
      id: user.uid,
      user_id: user.uid,
      business_id: user.uid,
      _table: "profiles",
      _facility_id: "",
      business_name: "Mein Unternehmen",
      first_name: "",
      last_name: "",
      street: "",
      house_number: "",
      postal_code: "",
      city: "",
      phone: "",
      email: user.email || "",
      logo_url: "",
    });
  });
}
async function repository() {
  const database = db(),
    uid = firebaseAuth!.currentUser!.uid;
  const admin = await firebaseAdminContext();
  const account = await getDocFromServer(doc(database, "hf_accounts", uid));
  const bid = admin.is_admin
    ? admin.selected_business_id
    : account.data()?.business_id;
  if (!bid)
    throw Error(
      "Bitte zuerst ein Unternehmen auswählen oder eine Einladung annehmen.",
    );
  if (
    !currentRepository ||
    currentRepository.businessId !== bid ||
    currentRepository.uid !== uid
  )
    currentRepository = new FirebaseRepository(database, uid, bid);
  return currentRepository;
}
export async function firebaseSnapshot() {
  return (await repository()).snapshot();
}
export async function firebaseRpc(action: string, p: Json = {}) {
  try {
    if (action === "get_app_admin_context") return firebaseAdminContext();
    if (action === "initialize_account") return firebaseInitialize();
    if (action === "get_team_context") return (await firebaseSnapshot()).team;
    if (action === "employee_snapshot") return (await firebaseSnapshot()).data;
    if (action === "usable_team_invite")
      return usableFirebaseInvite(
        db(),
        firebaseAuth!.currentUser!.email!,
        String(p.p_token || ""),
      );
    if (action === "set_company_role") {
      await changeFirebaseBusinessRole(
        db(),
        firebaseAuth!.currentUser!.uid,
        String(p.p_member || ""),
        (await repository()).businessId,
        p.p_role,
        true,
      );
      currentRepository = null;
      return null;
    }
    if (action === "accept_team_invite") {
      const user = firebaseAuth!.currentUser!;
      await acceptFirebaseInvite(
        db(),
        user.uid,
        user.email!.trim().toLowerCase(),
        String(p.p_name || ""),
        String(p.p_token || ""),
      );
      currentRepository = null;
      return null;
    }
    if (
      [
        "set_app_admin",
        "set_admin_business_role",
        "audit_admin_business_access",
      ].includes(action)
    ) {
      const database = db(),
        user = firebaseAuth!.currentUser!,
        ctx = await firebaseAdminContext();
      if (!ctx.is_admin) throw { code: "42501" };
      if (action === "set_app_admin") {
        await changeFirebaseAdmin(
          database,
          user.uid,
          String(p.p_email || ""),
          p.p_active === true,
        );
        currentRepository = null;
        return null;
      }
      if (action === "set_admin_business_role") {
        await changeFirebaseBusinessRole(
          database,
          user.uid,
          String(p.p_user || ""),
          String(p.p_business || ""),
          p.p_role,
        );
        currentRepository = null;
        return null;
      }
      await runTransaction(database, async (tx) => {
        tx.set(doc(collection(database, "hf_admin_audit")), {
          actor_id: user.uid,
          action: "business_access",
          business_id: p.p_business,
          created_at: new Date().toISOString(),
          details: {},
        });
      });
      return null;
    }
    return (await repository()).mutate(action, p);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (
      code?.startsWith("auth/") ||
      ["unavailable", "resource-exhausted"].includes(code || "")
    )
      throw Error(firebaseError(e));
    if (code === "permission-denied")
      throw {
        code: "42501",
        message:
          "Kein Zugriff oder eine Eingabe wurde von den Sicherheitsregeln abgelehnt. Bitte erneut laden.",
      };
    throw e;
  }
}
