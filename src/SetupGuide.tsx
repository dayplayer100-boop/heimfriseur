import { useState } from "react";
import { useStore } from "./store";
import { EntityForm } from "./Forms";
import { PriceLists } from "./PriceLists";
import { Button, Title, Field } from "./ui";
import { fullName } from "./domain";
import type { Table, Row } from "./types";
export function SetupGuide({ navigate }: { navigate: (p: string) => void }) {
  const { data, rpc, run, demo, setNotify } = useStore();
  const [step, setStep] = useState(0),
    [facility, setFacility] = useState(
      data.facilities.find((f) => !f.is_provisional)?.id || "",
    ),
    [group, setGroup] = useState(""),
    [editor, setEditor] = useState<{ table: Table; row?: Row } | null>(null);
  const steps = ["Unternehmen", "Heime", "Gruppen", "Kunden", "Preise"];
  async function finish() {
    const ok = await run(async () => {
      if (!demo) await rpc("complete_setup", {});
      return true;
    });
    if (ok) {
      setNotify("Einrichtung abgeschlossen – alle Angaben bleiben änderbar.");
      navigate("dashboard");
    }
  }
  return (
    <>
      <Title
        eyebrow={"EINRICHTUNG · " + (step + 1) + " VON 5"}
        title="Dein Unternehmen einrichten"
        description="Wir gehen gemeinsam die wichtigsten Schritte durch. Unbekannte Angaben kannst du später ergänzen."
      />
      <div className="setup-steps">
        {steps.map((label, i) => (
          <button
            key={label}
            className={i === step ? "active" : ""}
            onClick={() => {
              setStep(i);
              setEditor(null);
            }}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <section className="panel">
        <h2>{steps[step]}</h2>
        {step === 0 && (
          <EntityForm
            table="profiles"
            row={data.profiles[0]}
            onDone={() => {
              setNotify("Unternehmensdaten gespeichert");
              setStep(1);
            }}
          />
        )}
        {step > 0 && step < 4 && (
          <>
            {step > 1 && (
              <Field label="Heim auswählen">
                <select
                  value={facility}
                  onChange={(e) => {
                    setFacility(e.target.value);
                    setGroup("");
                    setEditor(null);
                  }}
                >
                  <option value="">Heim auswählen</option>
                  {data.facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {step === 3 && (
              <Field label="Gruppe auswählen">
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  <option value="">Allgemein / später zuordnen</option>
                  {data.groups
                    .filter((g) => g.facility_id === facility)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {!editor && (
              <>
                <p className="muted">
                  Vorhandene Einträge bleiben erhalten. Du kannst sie bearbeiten
                  oder weitere hinzufügen.
                </p>
                {(step === 1
                  ? data.facilities
                  : step === 2
                    ? data.groups.filter((g) => g.facility_id === facility)
                    : data.customers.filter(
                        (c) =>
                          c.facility_id === facility &&
                          (!group || c.group_id === group),
                      )
                ).map((row) => (
                  <button
                    className="list-row"
                    key={row.id}
                    onClick={() =>
                      setEditor({
                        table:
                          step === 1
                            ? "facilities"
                            : step === 2
                              ? "groups"
                              : "customers",
                        row,
                      })
                    }
                  >
                    {"name" in row ? String(row.name) : fullName(row as any)} ·
                    Bearbeiten
                  </button>
                ))}
                <Button
                  onClick={() =>
                    setEditor({
                      table:
                        step === 1
                          ? "facilities"
                          : step === 2
                            ? "groups"
                            : "customers",
                    })
                  }
                >
                  {step === 1
                    ? "Heim hinzufügen"
                    : step === 2
                      ? "Gruppe hinzufügen"
                      : "Kunde hinzufügen"}
                </Button>
              </>
            )}
            {editor && (
              <>
                <EntityForm
                  key={editor.row?.id || editor.table}
                  table={editor.table}
                  row={editor.row}
                  preset={{ facility_id: facility, group_id: group }}
                  onDone={(id) => {
                    if (editor.table === "facilities") setFacility(id);
                    if (editor.table === "groups") setGroup(id);
                    setEditor(null);
                  }}
                />
                <Button variant="secondary" onClick={() => setEditor(null)}>
                  Zur Übersicht
                </Button>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <p>
            Wähle das Heim und trage seine Preise ein. Für neue Heime werden die
            Werte des ersten Heims vorgeschlagen. Unter Einstellungen kannst du
            auch Leistungen und Zeiten ergänzen.
          </p>
        )}
      </section>
      {step === 4 && <PriceLists facilityId={facility} />}
      <div className="form-actions">
        <Button
          variant="secondary"
          disabled={step === 0 || !!editor}
          onClick={() => {
            setStep(step - 1);
            setEditor(null);
          }}
        >
          Zurück
        </Button>
        {step < 4 ? (
          <Button
            disabled={!!editor}
            onClick={() => {
              setStep(step + 1);
              setEditor(null);
            }}
          >
            {step === 0 ? "Unternehmensdaten später ergänzen" : "Weiter"}
          </Button>
        ) : (
          <Button onClick={() => void finish()}>Einrichtung abschließen</Button>
        )}
        <Button variant="secondary" onClick={() => void finish()}>
          Später weiter einrichten
        </Button>
      </div>
    </>
  );
}
