import {
  collection,
  doc,
  getDocsFromServer,
  getDocFromServer,
  query,
  where,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import { sameFirebaseDocument } from "./firebaseData";

/** All authority is checked again by Firestore. Email is only a directory lookup. */
export async function changeFirebaseAdmin(
  db: Firestore,
  actor: string,
  email: string,
  active: boolean,
) {
  const users = await getDocsFromServer(
    query(
      collection(db, "hf_users"),
      where("email", "==", email.trim().toLowerCase()),
    ),
  );
  if (users.size !== 1)
    throw Error(
      "Dieses bestätigte Konto wurde noch nicht gefunden. Die Person muss sich nach dem Update einmal anmelden.",
    );
  const uid = users.docs[0].id;
  if (uid === actor && !active)
    throw Error("Du kannst deinen eigenen Admin-Zugang nicht deaktivieren.");
  await runTransaction(db, async (tx) => {
    const authority = await tx.get(doc(db, "hf_admins", actor));
    const target = await tx.get(doc(db, "hf_users", uid));
    const previousRegistry = await tx.get(doc(db, "hf_admins", uid));
    if (!authority.data()?.is_active || !target.exists())
      throw Error("Nur aktive App-Admins dürfen diese Änderung durchführen.");
    const audit = doc(collection(db, "hf_admin_audit"));
    tx.set(doc(db, "hf_admins", uid), {
      email: target.data()!.email,
      is_active: active,
      updated_at: new Date().toISOString(),
      audit_id: audit.id,
      ...(previousRegistry.data()?.default_business_id
        ? { default_business_id: previousRegistry.data()!.default_business_id }
        : {}),
    });
    tx.set(audit, {
      actor_id: actor,
      action: "admin_access_changed",
      business_id: null,
      created_at: new Date().toISOString(),
      details: { target_user_id: uid, is_active: active },
    });
  });
}

export async function changeFirebaseBusinessRole(
  db: Firestore,
  actor: string,
  uid: string,
  business: string,
  role: "owner" | "employee" | "admin",
  companyOnly = false,
) {
  if (!["owner", "employee", ...(companyOnly ? ["admin"] : [])].includes(role))
    throw Error("Ungültige Rolle.");
  if (uid === actor)
    throw Error("Den eigenen Zugang kannst du hier nicht herabstufen.");
  const base = doc(db, "hf_businesses", business);
  const expectedRevision = await getDocFromServer(
    doc(base, "state", "revision"),
  );
  // Read the operational documents once; the transaction checks every preimage
  // and the revision before committing the complete change atomically.
  const [records, billing, finance] = await Promise.all([
    role === "owner"
      ? getDocsFromServer(collection(base, "records"))
      : Promise.resolve({ docs: [], size: 0 }),
    role === "owner"
      ? getDocsFromServer(collection(base, "billing"))
      : Promise.resolve({ docs: [], size: 0 }),
    role === "owner"
      ? getDocsFromServer(collection(base, "finance"))
      : Promise.resolve({ docs: [], size: 0 }),
  ]);
  if (records.size + billing.size > 300)
    throw Error(
      "Dieses Unternehmen braucht eine gesonderte Übertragung durch den Betreiber. Es wurde nichts verändert.",
    );
  await runTransaction(db, async (tx) => {
    const authority = await tx.get(doc(db, "hf_admins", actor));
    const target = await tx.get(doc(db, "hf_users", uid));
    const account = await tx.get(doc(db, "hf_accounts", uid));
    const registry = !companyOnly
      ? await tx.get(doc(db, "hf_admins", uid))
      : null;
    const company = await tx.get(base);
    const revisionRef = doc(base, "state", "revision");
    const revision = await tx.get(revisionRef);
    const memberRef = doc(base, "members", uid);
    const membership = await tx.get(memberRef);
    const actorMember = await tx.get(doc(base, "members", actor));
    if (
      (!authority.data()?.is_active &&
        !(
          companyOnly &&
          (company.data()?.owner_user_id === actor ||
            (actorMember.data()?.is_active &&
              actorMember.data()?.permissions?.company_admin))
        )) ||
      !target.exists() ||
      !company.exists() ||
      !revision.exists()
    )
      throw Error("Konto oder Unternehmen nicht gefunden. Bitte erneut laden.");
    if (account.exists() && account.data()!.business_id !== business)
      throw Error(
        "Dieses Konto gehört zu einem anderen Unternehmen. Eine Übertragung mit bestehenden Daten muss zuerst durch den Betreiber erfolgen; es wurde nichts geändert.",
      );
    const oldUid = company.data()!.owner_user_id as string;
    const oldRef = doc(base, "members", oldUid);
    const oldMember = await tx.get(oldRef);
    const oldAdmin = !companyOnly
      ? await tx.get(doc(db, "hf_admins", oldUid))
      : null;
    if (role !== "owner" && oldUid === uid)
      throw Error(
        "Bitte zuerst einen anderen Geschäftsführer bestimmen. Das Unternehmen darf nicht ohne Geschäftsführer bleiben.",
      );
    if (revision.data()!.value !== expectedRevision.data()?.value)
      throw Error(
        "Die Unternehmensdaten wurden inzwischen geändert. Bitte erneut versuchen.",
      );
    const transfer = role === "owner" && oldUid !== uid;
    if (
      transfer &&
      (records.docs.some(
        (d) => d.data()._table === "treatments" && !d.data().end_time,
      ) ||
        finance.docs.some((d) => d.data().completed === false))
    )
      throw Error("Bitte zuerst alle laufenden Behandlungen beenden.");
    const changing = transfer ? [...records.docs, ...billing.docs] : [];
    for (const entry of changing) {
      const fresh = await tx.get(entry.ref);
      if (!sameFirebaseDocument(fresh.data(), entry.data()))
        throw Error(
          "Die Unternehmensdaten wurden inzwischen geändert. Bitte erneut versuchen.",
        );
    }
    const audit = companyOnly
      ? doc(collection(base, "audit"))
      : doc(collection(db, "hf_admin_audit"));
    const now = new Date().toISOString();
    tx.set(memberRef, {
      id: uid,
      user_id: uid,
      business_id: business,
      role: role === "admin" ? "employee" : role,
      display_name:
        membership.data()?.display_name ||
        target.data()!.display_name ||
        target.data()!.email,
      is_active: true,
      facility_ids: membership.data()?.facility_ids || [],
      permissions:
        role === "owner"
          ? {}
          : {
              ...(membership.data()?.permissions || {
                record_payments: true,
                close_visits: true,
              }),
              company_admin: role === "admin",
            },
      onboarding_completed: membership.data()?.onboarding_completed || false,
      setup_completed: membership.data()?.setup_completed || false,
    });
    tx.set(doc(db, "hf_accounts", uid), { business_id: business });
    if (registry?.data()?.is_active)
      tx.set(doc(db, "hf_admins", uid), {
        email: target.data()!.email,
        is_active: false,
        updated_at: now,
        audit_id: audit.id,
      });
    if (transfer) {
      tx.update(base, {
        owner_user_id: uid,
        owner_email: target.data()!.email,
      });
      if (oldMember.exists()) {
        if (oldAdmin?.data()?.is_active) tx.delete(oldRef);
        else
          tx.update(oldRef, {
            role: "employee",
            permissions: {
              record_payments: true,
              close_visits: true,
              ...(companyOnly ? { company_admin: true } : {}),
            },
          });
      }
      for (const entry of changing) {
        const value = entry.data();
        value.user_id = uid;
        if (value.service_snapshots)
          value.service_snapshots = value.service_snapshots.map(
            (line: Record<string, unknown>) => ({
              ...line,
              ...(line.user_id === oldUid ? { user_id: uid } : {}),
            }),
          );
        if (oldAdmin?.data()?.is_active && value._table === "appointments") {
          if (value.assigned_users)
            value.assigned_users = [
              ...new Set(
                value.assigned_users.map((id: string) =>
                  id === oldUid ? uid : id,
                ),
              ),
            ];
          if (value.responsible_user === oldUid) value.responsible_user = uid;
        }
        tx.set(entry.ref, value);
      }
    }
    tx.update(revisionRef, { value: revision.data()!.value + 1 });
    tx.set(audit, {
      actor_id: actor,
      action: "business_role_changed",
      ...(companyOnly
        ? { id: audit.id, record_id: uid }
        : { business_id: business }),
      created_at: now,
      details: { target_user_id: uid, role, previous_owner: oldUid },
    });
  });
}
