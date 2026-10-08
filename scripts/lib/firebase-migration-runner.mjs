import {
  operator,
  payload,
  privateBackup,
  conditionalSet,
} from "./firebase-operator.mjs";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
// Durable, IAM-only journal makes chunked migration replayable after interruption.
// Client rules never grant access to migration_plan; names/addresses stay private.
export async function runMigration(
  options,
  kind,
  prerequisites,
  collections,
  planner,
) {
  if (!options["--business"]) throw Error("--business erforderlich.");
  const api = operator(options),
    root = api.docs + "/hf_businesses/" + options["--business"];
  let locked = false;
  try {
    let company = await api.get(root),
      revision = await api.get(root + "/state/revision");
    if (!company || !revision || !Number.isSafeInteger(payload(revision).value))
      throw Error("Aktive Firma/Revision nicht gefunden.");
    const originalBusiness = payload(company);
    if (originalBusiness._archived)
      throw Error("Archivierte Firma nicht migrieren.");
    prerequisites(originalBusiness);
    if (
      originalBusiness._migration_state === "in_progress" &&
      (!options["--resume"] || originalBusiness._operator_migration !== kind)
    )
      throw Error(
        "Firma gesperrt: nur passende Migration mit --resume fortsetzen.",
      );
    if (options["--apply"]) {
      if (originalBusiness._migration_state !== "in_progress") {
        await api.commit([
          conditionalSet(
            root,
            {
              ...originalBusiness,
              _migration_state: "in_progress",
              _operator_migration: kind,
            },
            company,
          ),
          {
            verify: revision.name,
            currentDocument: { updateTime: revision.updateTime },
          },
        ]);
        company = await api.get(root);
      }
      locked = true;
    }
    const existing = new Map();
    for (const name of collections)
      existing.set(name, await api.all(root + "/" + name));
    const before = new Map(
      [...existing.values()].flat().map((d) => [d.name, d]),
    );
    const journals = (await api.all(root + "/migration_plan")).filter((d) =>
      d.name
        .split("/")
        .at(-1)
        .startsWith(kind + "~"),
    );
    const manifest = journals.find((d) => d.name.endsWith("~manifest"));
    let operations, markers;
    if (manifest) {
      const meta = payload(manifest);
      if (meta.owner_user_id !== originalBusiness.owner_user_id)
        throw Error("Geschäftsführung hat sich verändert.");
      const parts = journals
        .filter((d) => !d.name.endsWith("~manifest"))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (parts.length !== meta.parts)
        throw Error("Migrationsjournal unvollständig.");
      operations = parts.flatMap((d) => payload(d).operations);
      markers = meta.markers;
    } else {
      const plan = planner(
        Object.fromEntries(
          [...existing].map(([name, docs]) => [name, docs.map(payload)]),
        ),
        originalBusiness,
      );
      markers = plan.markers;
      operations = [];
      for (const [collection, rows] of Object.entries(plan.targets)) {
        const targets = new Map(
          rows.map(({ id, value }) => [
            root + "/" + collection + "/" + id,
            value,
          ]),
        );
        for (const [name, value] of targets)
          if (!same(before.get(name) ? payload(before.get(name)) : null, value))
            operations.push({
              name,
              value,
              original: before.get(name) ? payload(before.get(name)) : null,
            });
        for (const d of existing.get(collection) || [])
          if (!targets.has(d.name))
            operations.push({
              name: d.name,
              value: null,
              original: payload(d),
            });
      }
    }
    console.log(
      JSON.stringify({
        mode: options["--apply"] ? "apply" : "dry-run",
        business: options["--business"],
        migration: kind,
        changes: operations.length,
      }),
    );
    if (!options["--apply"]) {
      console.log("Keine Daten verändert.");
      return;
    }
    privateBackup(
      options,
      [company, revision, ...before.values(), ...journals],
      kind,
    );
    if (!manifest) {
      const parts = [];
      for (let i = 0; i < operations.length; i += 30)
        parts.push({
          name:
            root +
            "/migration_plan/" +
            kind +
            "~" +
            String(parts.length).padStart(6, "0"),
          value: { operations: operations.slice(i, i + 30) },
        });
      for (let i = 0; i < parts.length; i += 100)
        await api.commit(
          parts
            .slice(i, i + 100)
            .map((p) => ({
              update: {
                name: p.name,
                fields: conditionalSet(p.name, p.value).update.fields,
              },
            })),
        );
      await api.commit([
        conditionalSet(
          root + "/migration_plan/" + kind + "~manifest",
          {
            parts: parts.length,
            owner_user_id: originalBusiness.owner_user_id,
            markers,
          },
          undefined,
        ),
      ]);
    }
    const pending = [];
    for (const op of operations) {
      const current = before.get(op.name),
        value = current ? payload(current) : null;
      if (same(value, op.value)) continue;
      if (!same(value, op.original))
        throw Error(
          "Datenkonflikt: weder gesicherter Ursprung noch erwartetes Ergebnis. Kein Überschreiben.",
        );
      pending.push(
        op.value === null
          ? {
              delete: op.name,
              currentDocument: { updateTime: current.updateTime },
            }
          : conditionalSet(op.name, op.value, current),
      );
    }
    for (let i = 0; i < pending.length; i += 150) {
      await api.commit(pending.slice(i, i + 150));
      if (
        options["--emulator"] &&
        process.env.HF_MIGRATION_TEST_INTERRUPT === "1"
      )
        throw Error("Test: absichtliche Unterbrechung nach Teil-Commit.");
    }
    const actual = new Map();
    for (const name of collections)
      for (const d of await api.all(root + "/" + name))
        actual.set(d.name, payload(d));
    const expected = new Map(
      [...before].map(([name, d]) => [name, payload(d)]),
    );
    for (const op of operations)
      if (op.value === null) expected.delete(op.name);
      else expected.set(op.name, op.value);
    if (
      actual.size !== expected.size ||
      [...expected].some(([name, value]) => !same(actual.get(name), value))
    )
      throw Error("Vollständiger Datenvergleich fehlgeschlagen.");
    company = await api.get(root);
    revision = await api.get(root + "/state/revision");
    if (
      payload(company)._operator_migration !== kind ||
      payload(company)._migration_state !== "in_progress" ||
      payload(company).owner_user_id !== originalBusiness.owner_user_id
    )
      throw Error("Firmen-/Migrationszuordnung verändert.");
    await api.commit([
      conditionalSet(
        root,
        {
          ...payload(company),
          ...markers,
          _migration_state: "complete",
          _operator_migration: "complete",
        },
        company,
      ),
      conditionalSet(
        revision.name,
        { value: payload(revision).value + 1 },
        revision,
      ),
    ]);
    locked = false;
    // Deleting the journal happens only after verified unlock; failure is harmless
    // and can be cleaned by an IAM operator without granting any client access.
    const cleanup = (await api.all(root + "/migration_plan")).filter((d) =>
      d.name
        .split("/")
        .at(-1)
        .startsWith(kind + "~"),
    );
    for (let i = 0; i < cleanup.length; i += 150)
      await api.commit(
        cleanup
          .slice(i, i + 150)
          .map((d) => ({
            delete: d.name,
            currentDocument: { updateTime: d.updateTime },
          })),
      );
    console.log(kind + ": vollständig verglichen und freigegeben.");
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Migration fehlgeschlagen.");
    if (locked)
      console.error(
        "Firma bleibt gesperrt. Ursache prüfen, danach --apply --resume. Journal und Sicherung nicht veröffentlichen.",
      );
    process.exitCode = 1;
  }
}
