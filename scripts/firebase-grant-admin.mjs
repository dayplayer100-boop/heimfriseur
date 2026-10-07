// Operator-only: uses Cloud Shell IAM, never a frontend/service-account key.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2);
function option(flag) {
  const index = args.indexOf(flag);
  return index < 0 ? "" : args[index + 1] || "";
}
const email = option("--email").trim().toLowerCase();
const project = option("--project");
const emulator = args.includes("--emulator");
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !/^[a-z][a-z0-9-]{4,62}$/.test(project)
) {
  console.error(
    "Aufruf: node scripts/firebase-grant-admin.mjs --email admin@example.de --project heimfriseur-dayplayer100",
  );
  process.exit(1);
}
if (emulator && !project.startsWith("demo-"))
  throw Error("Emulator nur mit Demo-Projekt-ID erlaubt.");
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
  async function request(url, body, missingAllowed = false) {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (missingAllowed && r.status === 404) return null;
    if (!r.ok)
      throw Error(
        `Firebase-Zugriff abgelehnt (${r.status}). Bitte angemeldetes Google-Konto und Projektberechtigung prüfen.`,
      );
    return r.json();
  }
  const auth = emulator
    ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com"
    : "https://identitytoolkit.googleapis.com";
  const result = await request(
    `${auth}/v1/projects/${project}/accounts:lookup`,
    { email: [email] },
  );
  const user = result.users?.find((u) => u.email?.toLowerCase() === email);
  if (!user?.localId || user.disabled || !user.emailVerified)
    throw Error(
      "Das Konto muss in dieser Firebase-App registriert, aktiv und per E-Mail bestätigt sein. Es wurde nichts verändert.",
    );
  const uid = user.localId;
  if (/[\/]/.test(uid))
    throw Error("Ungültige Firebase-UID. Es wurde nichts verändert.");
  const base = emulator
    ? "http://127.0.0.1:8080/v1/"
    : "https://firestore.googleapis.com/v1/";
  const root = `projects/${project}/databases/(default)/documents`;
  const name = `${root}/hf_admins/${uid}`;
  const old = await request(base + name, null, true);
  if (
    old?.fields?.is_active?.booleanValue === true &&
    old?.fields?.email?.stringValue === email
  ) {
    console.log(
      `${email} ist bereits aktiver App-Admin. Keine weiteren Änderungen.`,
    );
    process.exit(0);
  }
  const now = new Date().toISOString();
  const fields = {
    email: { stringValue: email },
    is_active: { booleanValue: true },
    updated_at: { stringValue: now },
  };
  await request(
    base + `projects/${project}/databases/(default)/documents:commit`,
    {
      writes: [
        {
          update: { name, fields },
          ...(old
            ? {
                updateMask: { fieldPaths: Object.keys(fields) },
                currentDocument: { updateTime: old.updateTime },
              }
            : { currentDocument: { exists: false } }),
        },
        {
          update: {
            name: `${root}/hf_admin_audit/${randomUUID()}`,
            fields: {
              actor_id: { stringValue: "operator:cloud-shell" },
              action: { stringValue: "app_admin_granted" },
              business_id: { nullValue: null },
              created_at: { stringValue: now },
              details: {
                mapValue: {
                  fields: {
                    user_id: { stringValue: uid },
                    email: { stringValue: email },
                  },
                },
              },
            },
          },
          currentDocument: { exists: false },
        },
      ],
    },
  );
  const confirmed = await request(base + name);
  if (
    confirmed.fields?.is_active?.booleanValue !== true ||
    confirmed.fields?.email?.stringValue !== email
  )
    throw Error(
      "Die Bestätigung der Admin-Rechte ist fehlgeschlagen. Bitte im Firebase-Dashboard prüfen.",
    );
  console.log(`App-Admin erfolgreich eingerichtet: ${email}`);
  console.log(
    "Geschäftsdaten und Mitarbeiterzuordnungen bleiben unverändert. In HeimFriseur abmelden und erneut anmelden.",
  );
} catch (error) {
  console.error(
    error.message?.startsWith("Firebase-") ||
      error.message?.includes("Konto") ||
      error.message?.includes("Admin-Rechte")
      ? error.message
      : "Betreiberzugriff fehlgeschlagen. Bitte den Befehl in deiner angemeldeten Google Cloud Shell ausführen; keine Schlüssel senden.",
  );
  process.exitCode = 1;
}
