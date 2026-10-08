// Deliberately cannot overwrite a production project. Exercises exact backup restore.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { operatorOptions, operator } from "./lib/firebase-operator.mjs";
const options = operatorOptions(["--file", "--sha256"]);
if (
  !options["--emulator"] ||
  !options["--project"].startsWith("demo-") ||
  !options["--file"] ||
  !/^[a-f0-9]{64}$/.test(options["--sha256"] || "")
)
  throw Error("Nur Demo-Emulator: --file und --sha256 erforderlich.");
const bytes = readFileSync(options["--file"]);
if (createHash("sha256").update(bytes).digest("hex") !== options["--sha256"])
  throw Error("Backup-Hash stimmt nicht überein.");
const backup = JSON.parse(bytes.toString("utf8"));
if (backup.schema !== 1 || !Array.isArray(backup.documents))
  throw Error("Unbekanntes Sicherungsformat.");
const api = operator(options),
  old = `projects/${backup.project}/databases/(default)/documents/`;
const writes = backup.documents.map((d) => {
  if (!d.name.startsWith(old) || !d.fields)
    throw Error("Ungültiger Sicherungsdatensatz.");
  return {
    update: {
      name: api.docs + "/" + d.name.slice(old.length),
      fields: d.fields,
    },
  };
});
console.log(
  JSON.stringify({
    mode: options["--apply"] ? "apply" : "dry-run",
    project: options["--project"],
    documents: writes.length,
  }),
);
if (options["--apply"]) {
  for (let i = 0; i < writes.length; i += 150)
    await api.commit(writes.slice(i, i + 150));
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical(value[k])]),
          )
        : value;
  for (const w of writes) {
    const restored = await api.get(w.update.name);
    if (
      !restored ||
      JSON.stringify(canonical(restored.fields)) !==
        JSON.stringify(canonical(w.update.fields))
    )
      throw Error("Wiederherstellungsprüfung fehlgeschlagen.");
  }
  console.log(
    "Wiederherstellung jedes gesicherten Dokuments im Emulator geprüft.",
  );
}
