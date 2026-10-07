// Operator-only: assign a platform admin to the existing director company, without company membership.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2);
const option = (key) =>
  args.includes(key) ? args[args.indexOf(key) + 1] || "" : "";
const project = option("--project"),
  from = option("--from-admin").trim().toLowerCase(),
  to = option("--to-owner").trim().toLowerCase(),
  emulator = args.includes("--emulator");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
if (
  !/^[a-z][a-z0-9-]{4,62}$/.test(project) ||
  !validEmail(from) ||
  !validEmail(to) ||
  from === to ||
  (emulator && !project.startsWith("demo-"))
) {
  console.error(
    "Aufruf: node scripts/firebase-assign-admin-company.mjs --project heimfriseur-dayplayer100 --from-admin admin@example.de --to-owner chef@example.de",
  );
  process.exit(1);
}
try {
  const token = emulator
    ? "owner"
    : execFileSync("gcloud", ["auth", "print-access-token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const base = emulator
    ? "http://127.0.0.1:8080/v1/"
    : "https://firestore.googleapis.com/v1/";
  const documents = `projects/${project}/databases/(default)/documents`;
  async function request(url, body, missing = false) {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (missing && r.status === 404) return null;
    if (!r.ok)
      throw Error(
        `Firebase-Zugriff fehlgeschlagen (${r.status}). Betreiberberechtigungen prüfen.`,
      );
    return r.json();
  }
  const get = (path) => request(base + documents + "/" + path, null, true);
  async function all(path) {
    const rows = [];
    let page = "";
    do {
      const result = await request(
        base +
          documents +
          "/" +
          path +
          "?pageSize=1000" +
          (page ? "&pageToken=" + encodeURIComponent(page) : ""),
      );
      rows.push(...(result.documents || []));
      page = result.nextPageToken || "";
    } while (page);
    return rows;
  }
  function decode(v) {
    if (v.nullValue !== undefined) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return v.doubleValue;
    if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
    if (v.mapValue)
      return Object.fromEntries(
        Object.entries(v.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]),
      );
    throw Error("Nicht unterstützter Datentyp. Keine Änderung vorgenommen.");
  }
  function encode(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number")
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v).map(([k, v]) => [k, encode(v)]),
        ),
      },
    };
  }
  const row = (doc) =>
    doc
      ? Object.fromEntries(
          Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)]),
        )
      : null;
  const authBase = emulator
    ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com"
    : "https://identitytoolkit.googleapis.com";
  const lookup = await request(
    `${authBase}/v1/projects/${project}/accounts:lookup`,
    { email: [from, to] },
  );
  const user = (email) =>
    lookup.users?.find((u) => u.email?.toLowerCase() === email);
  const oldUser = user(from),
    newUser = user(to);
  if (
    !oldUser?.emailVerified ||
    oldUser.disabled ||
    !newUser?.emailVerified ||
    newUser.disabled
  )
    throw Error(
      "Beide Konten müssen zuerst in Firebase registriert, aktiv und bestätigt sein. Keine Änderung vorgenommen.",
    );
  const oldUid = oldUser.localId,
    newUid = newUser.localId;
  if (/[\/]/.test(oldUid + newUid))
    throw Error("Ungültige Konto-ID. Keine Änderung vorgenommen.");
  const registry = await get(`hf_admins/${oldUid}`);
  if (!row(registry)?.is_active)
    throw Error(
      "Das bisherige Konto muss bereits App-Admin sein. Keine Änderung vorgenommen.",
    );
  const oldAccount = await get(`hf_accounts/${oldUid}`);
  const ownerAccount = await get(`hf_accounts/${newUid}`);
  const targetId = row(ownerAccount)?.business_id;
  if (!targetId || /[\/]/.test(targetId))
    throw Error(
      "Das Geschäftsführer-Konto hat noch kein Unternehmen. Keine Änderung vorgenommen.",
    );
  const targetPath = `hf_businesses/${targetId}`;
  const target = await get(targetPath);
  if (
    row(target)?.owner_user_id !== newUid ||
    row(target)?._archived ||
    row(target)?._migration_state === "in_progress"
  )
    throw Error(
      "Die Geschäftsführerzuordnung muss zuerst geprüft werden. Keine Änderung vorgenommen.",
    );
  const ownerMember = await get(targetPath + `/members/${newUid}`);
  if (row(ownerMember)?.role !== "owner" || !row(ownerMember)?.is_active)
    throw Error(
      "Die Geschäftsführung ist nicht aktiv. Keine Änderung vorgenommen.",
    );
  const writes = [];
  const deleteExtra = args.includes("--delete-extra-company");
  async function purge(source) {
    const path = source.name.slice(documents.length + 1);
    const collections = await request(
      base + source.name + ":listCollectionIds",
      {},
    );
    if (collections.nextPageToken)
      throw Error("Zu viele Sammlungen. Keine Änderung vorgenommen.");
    const saved = [source];
    for (const id of collections.collectionIds || [])
      saved.push(...(await all(path + "/" + id)));
    const memberDocs = saved.filter((d) =>
      d.name.startsWith(source.name + "/members/"),
    );
    if (
      memberDocs.some(
        (d) => row(d).user_id !== oldUid && row(d).is_active !== false,
      )
    )
      throw Error(
        "Die zusätzliche Firma hat aktive Teammitglieder. Keine Änderung vorgenommen.",
      );
    for (const colleague of memberDocs.filter(
      (d) => row(d).user_id !== oldUid,
    )) {
      const account = await get(`hf_accounts/${row(colleague).user_id}`);
      if (row(account)?.business_id === path.split("/").at(-1))
        saved.push(account);
    }
    const invites = await request(base + documents + ":runQuery", {
      structuredQuery: {
        from: [{ collectionId: "hf_invites" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "business_id" },
            op: "EQUAL",
            value: { stringValue: path.split("/").at(-1) },
          },
        },
      },
    });
    saved.push(...invites.filter((r) => r.document).map((r) => r.document));
    if (saved.length + writes.length > 320)
      throw Error(
        "Zu viele Daten für das sichere Löschen. Keine Änderung vorgenommen.",
      );
    const directory = join(homedir(), ".heimfriseur-backups");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `company-${Date.now()}-${randomUUID()}.json`);
    writeFileSync(
      file,
      JSON.stringify({ project, documents: saved }, null, 2),
      { mode: 0o600 },
    );
    for (const entry of saved) remove(entry);
    console.log("Sicherung der zusätzlichen Firma gespeichert:", file);
  }
  function put(path, data, old, fields) {
    writes.push({
      update: {
        name: documents + "/" + path,
        fields: encode(data).mapValue.fields,
      },
      ...(fields ? { updateMask: { fieldPaths: fields } } : {}),
      currentDocument: old ? { updateTime: old.updateTime } : { exists: false },
    });
  }
  function remove(d) {
    if (d)
      writes.push({
        delete: d.name,
        currentDocument: { updateTime: d.updateTime },
      });
  }
  const sourceId = row(oldAccount)?.business_id;
  let archived = false;
  if (sourceId && sourceId !== targetId) {
    if (/[\/]/.test(sourceId))
      throw Error("Ungültige Firmenzuordnung. Keine Änderung vorgenommen.");
    const sourcePath = `hf_businesses/${sourceId}`;
    const source = await get(sourcePath);
    if (source && !row(source)._archived) {
      if (
        row(source).owner_user_id !== oldUid ||
        row(source)._migration_state === "in_progress"
      )
        throw Error(
          "Das Admin-Konto gehört zu einer anderen aktiven Firma. Keine Änderung vorgenommen.",
        );
      const members = await all(sourcePath + "/members");
      if (
        members.some(
          (d) => row(d).user_id !== oldUid && row(d).is_active !== false,
        )
      )
        throw Error(
          "Die zusätzliche Firma hat weitere Teammitglieder. Keine Änderung vorgenommen; die Zuordnung muss geprüft werden.",
        );
      const revision = await get(sourcePath + "/state/revision");
      if (!revision)
        throw Error("Die Firmenrevision fehlt. Keine Änderung vorgenommen.");
      const records = await all(sourcePath + "/records");
      const finance = await all(sourcePath + "/finance");
      if (
        records.some(
          (d) => row(d)._table === "treatments" && !row(d).end_time,
        ) ||
        finance.some((d) => row(d).completed === false)
      )
        throw Error(
          "Bitte zuerst laufende Behandlungen in der zusätzlichen Firma beenden. Keine Änderung vorgenommen.",
        );
      if (deleteExtra) {
        await purge(source);
      } else {
        // Do not erase or merge customer/financial history. Retire only the extra
        // admin-owned company; all its nested records remain recoverable by IAM.
        for (const d of [...records, ...finance])
          writes.push({
            verify: d.name,
            currentDocument: { updateTime: d.updateTime },
          });
        const now = new Date().toISOString();
        put(
          sourcePath,
          {
            _archived: true,
            archived_at: now,
            previous_owner_user_id: oldUid,
            owner_user_id: null,
            owner_email: "",
          },
          source,
          [
            "_archived",
            "archived_at",
            "previous_owner_user_id",
            "owner_user_id",
            "owner_email",
          ],
        );
        put(
          sourcePath + "/state/revision",
          { value: row(revision).value + 1 },
          revision,
        );
        remove(members.find((d) => row(d).user_id === oldUid));
      }
      archived = true;
    }
  }
  if (deleteExtra) {
    const leftovers = await request(base + documents + ":runQuery", {
      structuredQuery: {
        from: [{ collectionId: "hf_businesses" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "previous_owner_user_id" },
            op: "EQUAL",
            value: { stringValue: oldUid },
          },
        },
      },
    });
    for (const entry of leftovers.filter(
      (r) => r.document && row(r.document)._archived,
    ))
      await purge(entry.document);
  }
  const adminMember = await get(targetPath + `/members/${oldUid}`);
  const revision = await get(targetPath + "/state/revision");
  if (!revision)
    throw Error("Die Firmenrevision fehlt. Keine Änderung vorgenommen.");
  if (
    row(registry)?.default_business_id === targetId &&
    sourceId === targetId &&
    !adminMember &&
    writes.length === 0
  ) {
    console.log(
      `${from} ist bereits ausschließlich App-Admin für das Unternehmen von ${to}.`,
    );
    process.exit(0);
  }
  // A concurrent owner transfer or role revocation aborts this whole commit.
  writes.push({
    verify: target.name,
    currentDocument: { updateTime: target.updateTime },
  });
  writes.push({
    verify: ownerMember.name,
    currentDocument: { updateTime: ownerMember.updateTime },
  });
  writes.push({
    verify: ownerAccount.name,
    currentDocument: { updateTime: ownerAccount.updateTime },
  });
  put(`hf_admins/${oldUid}`, { default_business_id: targetId }, registry, [
    "default_business_id",
  ]);
  put(`hf_accounts/${oldUid}`, { business_id: targetId }, oldAccount);
  remove(adminMember);
  put(
    targetPath + "/state/revision",
    { value: row(revision).value + 1 },
    revision,
  );
  put(
    `hf_admin_audit/${randomUUID()}`,
    {
      actor_id: "operator:cloud-shell",
      action: "admin_business_assigned",
      business_id: targetId,
      created_at: new Date().toISOString(),
      details: {
        user_id: oldUid,
        admin_email: from,
        owner_email: to,
        archived_extra_company: archived,
      },
    },
    null,
  );
  if (
    writes.length > 350 ||
    Buffer.byteLength(JSON.stringify({ writes })) > 7_000_000
  )
    throw Error(
      "Zu viele Daten für eine sichere Einzeltransaktion. Keine Änderung vorgenommen.",
    );
  await request(
    base + `projects/${project}/databases/(default)/documents:commit`,
    { writes },
  );
  console.log(
    `${from} ist ausschließlich App-Admin. ${to} bleibt Geschäftsführer. Beim Anmelden wird dessen Unternehmen direkt geöffnet.`,
  );
  if (archived)
    console.log(
      deleteExtra
        ? "Die zusätzliche Admin-Firma wurde nach Sicherung vollständig gelöscht."
        : "Die zusätzliche Admin-Firma wurde stillgelegt. Ihre Datensätze bleiben als Sicherung erhalten und erscheinen nicht mehr als aktives Unternehmen.",
    );
} catch (error) {
  console.error(
    error.message?.includes("vorgenommen")
      ? error.message
      : "Betreiberzugriff fehlgeschlagen. Bitte in der angemeldeten Google Cloud Shell ausführen; keine Schlüssel senden.",
  );
  process.exitCode = 1;
}
