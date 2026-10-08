import {
  operatorOptions,
  operator,
  payload,
  privateBackup,
  conditionalSet,
} from "./lib/firebase-operator.mjs";
const options = operatorOptions();
if (!options["--business"]) throw Error("--business erforderlich.");
const api = operator(options),
  root = api.docs + "/hf_businesses/" + options["--business"];
const company = await api.get(root),
  revision = await api.get(root + "/state/revision");
if (!company || !revision) throw Error("Unternehmen/Revision nicht gefunden.");
const b = payload(company);
if (b._migration_state === "in_progress" || b._archived)
  throw Error("Firma gesperrt oder archiviert. Erst Migration beenden.");
let locked = false;
try {
  if (options["--apply"]) {
    await api.commit([
      conditionalSet(
        root,
        {
          ...b,
          _migration_state: "in_progress",
          _operator_migration: "backup",
        },
        company,
      ),
      {
        verify: revision.name,
        currentDocument: { updateTime: revision.updateTime },
      },
    ]);
    locked = true;
  }
  // Save the original unlocked root; restored copies must not inherit maintenance.
  const documents = [company, revision];
  for (const name of [
    "records",
    "finance",
    "payment_contacts",
    "billing",
    "members",
    "catalogue",
    "locks",
    "visit_guards",
    "audit",
  ])
    documents.push(...(await api.all(root + "/" + name)));
  const members = documents
    .filter((d) => d.name.startsWith(root + "/members/"))
    .map(payload);
  const chiefs = members.filter((m) => m.role === "owner" && m.is_active);
  if (chiefs.length !== 1 || chiefs[0].user_id !== b.owner_user_id)
    throw Error(
      "Rollenprüfung: genau eine aktive Geschäftsführung erforderlich.",
    );
  for (const m of members) {
    const account = await api.get(api.docs + "/hf_accounts/" + m.user_id);
    if (
      m.is_active &&
      (!account || payload(account).business_id !== options["--business"])
    )
      throw Error("Aktives Teamkonto gehört nicht zum Unternehmen.");
    if (account) documents.push(account);
    const user = await api.get(api.docs + "/hf_users/" + m.user_id);
    if (user) documents.push(user);
  }
  for (const d of await api.all(api.docs + "/hf_invites"))
    if (payload(d).business_id === options["--business"]) documents.push(d);
  for (const d of await api.all(api.docs + "/hf_admins"))
    if (payload(d).is_active) documents.push(d);
  const currentRevision = await api.get(revision.name);
  if (currentRevision.updateTime !== revision.updateTime)
    throw Error("Revision während Sicherung geändert. Sicherung abgebrochen.");
  if (options["--apply"]) privateBackup(options, documents, "pre-release");
  console.log(
    JSON.stringify({
      mode: options["--apply"] ? "apply" : "dry-run",
      documents: documents.length,
      activeDirectors: chiefs.length,
      activeEmployees: members.filter(
        (m) => m.role === "employee" && m.is_active,
      ).length,
    }),
  );
  if (!options["--apply"])
    console.log(
      "Nur Rollenprüfung. Für geschützte Sicherung mit Wartungssperre --apply verwenden.",
    );
} finally {
  if (locked) {
    const current = await api.get(root);
    if (payload(current)._operator_migration !== "backup")
      throw Error("Wartungssperre verändert. Betreiber muss prüfen.");
    await api.commit([conditionalSet(root, b, current)]);
  }
}
// IAM operations bypass client locks: no concurrent operator scripts during backup.
// This backup covers Firestore, not Firebase Authentication users/password hashes.
