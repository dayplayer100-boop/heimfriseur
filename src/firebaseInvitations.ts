import {
  doc,
  runTransaction,
  getDocFromServer,
  increment,
  type Firestore,
} from "firebase/firestore";
function hashToken(token: string) {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(token))
    .then((a) =>
      Array.from(new Uint8Array(a), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    );
}
export async function acceptFirebaseInvite(
  database: Firestore,
  uid: string,
  email: string,
  name: string,
  token: string,
) {
  if (!token)
    throw Error(
      "Der Einladungslink fehlt. Bitte den vollständigen Link erneut öffnen.",
    );
  const user = { uid, email },
    id = await hashToken(token),
    ref = doc(database, "hf_invites", id),
    account = doc(database, "hf_accounts", user.uid);
  await runTransaction(database, async (tx) => {
    const [invite, existing] = await Promise.all([
      tx.get(ref),
      tx.get(account),
    ]);
    const i = invite.data();
    if (
      existing.exists() &&
      i?.accepted_by === user.uid &&
      existing.data()!.business_id === i.business_id
    )
      return;
    if (existing.exists() && existing.data()!.business_id !== i?.business_id)
      throw Error(
        "Dieses Konto hat bereits ein Unternehmen. Bitte ein noch nicht zugeordnetes Mitarbeiterkonto verwenden oder den App-Admin um eine geprüfte Übertragung bitten.",
      );
    const membershipRef = i
      ? doc(database, "hf_businesses", i.business_id, "members", uid)
      : null;
    const membership =
      existing.exists() &&
      existing.data()!.business_id === i?.business_id &&
      membershipRef
        ? await tx.get(membershipRef)
        : null;
    if (membership?.data()?.role === "owner")
      throw Error(
        "Dieses Konto ist bereits Geschäftsführer. Bitte die Rolle innerhalb der Teamverwaltung ändern.",
      );
    if (
      !i ||
      i.email !== user.email?.toLowerCase() ||
      i.revoked_at ||
      i.accepted_at ||
      i.expires_at_ms <= Date.now()
    )
      throw Error("Einladung abgelaufen oder nicht für dieses Konto bestimmt.");
    tx.set(account, { business_id: i.business_id, invite_id: id });
    tx.set(doc(database, "hf_businesses", i.business_id, "members", user.uid), {
      id: user.uid,
      business_id: i.business_id,
      user_id: user.uid,
      role: "employee",
      display_name: name.trim() || email,
      is_active: true,
      facility_ids: [],
      permissions: {
        record_payments: true,
        close_visits: true,
        ...(i.role === "admin" ? { company_admin: true } : {}),
      },
    });
    tx.update(ref, {
      accepted_at: new Date().toISOString(),
      accepted_by: user.uid,
    });
    tx.update(
      doc(database, "hf_businesses", i.business_id, "state", "revision"),
      { value: increment(1) },
    );
  });
}

export async function usableFirebaseInvite(
  db: Firestore,
  email: string,
  token: string,
) {
  const invite = await getDocFromServer(
    doc(db, "hf_invites", await hashToken(token)),
  );
  const value = invite.data();
  return (
    !!value &&
    value.email === email.trim().toLowerCase() &&
    !value.accepted_at &&
    !value.revoked_at &&
    value.expires_at_ms > Date.now()
  );
}
