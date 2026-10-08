import { execFileSync } from "node:child_process";
import { mkdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
export function operatorOptions(extra = []) {
  const result = {},
    flags = new Set([
      "--project",
      "--business",
      "--backup-dir",
      "--apply",
      "--resume",
      "--emulator",
      ...extra,
    ]);
  const bool = new Set(["--apply", "--resume", "--emulator"]);
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!flags.has(flag) || result[flag] !== undefined)
      throw Error("Unbekannte/doppelte Option.");
    result[flag] = bool.has(flag) ? true : args[++i];
    if (!result[flag] || String(result[flag]).startsWith("--"))
      throw Error("Optionswert fehlt.");
  }
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(result["--project"] || ""))
    throw Error("--project erforderlich.");
  if (
    result["--business"] &&
    !/^[A-Za-z0-9_-]{1,128}$/.test(result["--business"])
  )
    throw Error("Ungültige Firmen-ID.");
  if (result["--emulator"] && !result["--project"].startsWith("demo-"))
    throw Error("Nur Demo-Projekte im Emulator.");
  if (result["--resume"] && !result["--apply"])
    throw Error("--resume benötigt --apply.");
  return result;
}
export function encode(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw Error("Ungültige Zahl.");
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
export function decode(v) {
  if ("nullValue" in v) return null;
  for (const k of ["stringValue", "booleanValue", "doubleValue"])
    if (k in v) return v[k];
  if ("integerValue" in v) {
    const n = Number(v.integerValue);
    if (!Number.isSafeInteger(n))
      throw Error("Zahl außerhalb sicheren Bereichs.");
    return n;
  }
  if (v.timestampValue) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  if (v.mapValue)
    return Object.fromEntries(
      Object.entries(v.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]),
    );
  throw Error("Nicht unterstützter Firestore-Datentyp.");
}
export const payload = (d) =>
  Object.fromEntries(
    Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)]),
  );
export function operator(options) {
  const project = options["--project"];
  const token = options["--emulator"]
    ? "owner"
    : execFileSync("gcloud", ["auth", "print-access-token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
  const docs = `projects/${project}/databases/(default)/documents`;
  const base = options["--emulator"]
    ? "http://127.0.0.1:8080/v1/"
    : "https://firestore.googleapis.com/v1/";
  async function request(path, body, missing = false) {
    const r = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (missing && r.status === 404) return null;
    if (!r.ok)
      throw Error(
        `Firebase-Operatorzugriff fehlgeschlagen (${r.status}); keine Kontaktdaten/Tokens im Fehlerprotokoll.`,
      );
    return r.json();
  }
  return {
    docs,
    get: (path) => request(path, null, true),
    commit: (writes) => request(docs + ":commit", { writes }),
    async all(path) {
      const result = [];
      let next = "";
      do {
        const page = await request(
          path +
            "?pageSize=200" +
            (next ? "&pageToken=" + encodeURIComponent(next) : ""),
        );
        result.push(...(page.documents || []));
        next = page.nextPageToken || "";
      } while (next);
      return result;
    },
  };
}
export function privateBackup(options, documents, label) {
  const dir = resolve(
    options["--backup-dir"] || join(homedir(), ".heimfriseur-backups"),
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir),
    real = realpathSync(dir),
    inside = relative(realpathSync(process.cwd()), real);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    inside === "" ||
    (!inside.startsWith("..") && !inside.startsWith("/"))
  )
    throw Error(
      "Sicherung benötigt privaten Ordner (0700) außerhalb des Repositorys.",
    );
  const body = JSON.stringify(
    {
      schema: 1,
      project: options["--project"],
      business: options["--business"],
      created_at: new Date().toISOString(),
      documents,
    },
    null,
    2,
  );
  const file = join(real, `${label}-${Date.now()}-${randomUUID()}.json`);
  writeFileSync(file, body, { flag: "wx", mode: 0o600, flush: true });
  console.log(
    "Private Sicherung:",
    file,
    "SHA-256:",
    createHash("sha256").update(body).digest("hex"),
  );
  return file;
}
export const conditionalSet = (name, value, before) => ({
  update: { name, fields: encode(value).mapValue.fields },
  currentDocument: before
    ? { updateTime: before.updateTime }
    : { exists: false },
});
