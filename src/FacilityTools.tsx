import { useState } from "react";
import { useStore } from "./store";
import { Button, Input, Field, Modal } from "./ui";
import { dateLabel, euro, today } from "./domain";
import type { Cohort } from "./types";
export function FacilityTools({ facilityId }: { facilityId: string }) {
  const { data, rpc, run, setNotify } = useStore();
  const [edit, setEdit] = useState<Cohort | true | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  return (
    <div className="stack">
      <section className="panel">
        <h2>Preise in diesem Heim</h2>
        <p>
          Leer lassen: normale Preisliste verwenden. Abweichungen gelten für
          neue Leistungen; gespeicherte Behandlungspreise bleiben erhalten.
        </p>
        {data.services
          .filter((s) => s.is_active)
          .map((s) => {
            const stored = data.facility_service_prices.find(
              (p) => p.facility_id === facilityId && p.service_id === s.id,
            );
            return (
              <form
                className="price-editor"
                key={s.id}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const value =
                    prices[s.id] ?? (stored ? String(stored.price) : "");
                  const result = await run(async () => {
                    const n =
                      value === "" ? null : Number(value.replace(",", "."));
                    if (n !== null && (!Number.isFinite(n) || n < 0))
                      throw Error("Bitte einen gültigen Preis eingeben.");
                    await rpc("set_facility_price", {
                      p_facility: facilityId,
                      p_service: s.id,
                      p_price: n,
                    });
                    return true;
                  });
                  if (result) setNotify("Heimpreis gespeichert");
                }}
              >
                <Input
                  label={s.name + " · Standard " + euro(s.price)}
                  inputMode="decimal"
                  value={prices[s.id] ?? (stored ? String(stored.price) : "")}
                  onChange={(v) => setPrices({ ...prices, [s.id]: v })}
                />
                <Button type="submit" variant="secondary">
                  Preis speichern
                </Button>
              </form>
            );
          })}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Untergruppen / Besuchsrunden</h2>
          <Button onClick={() => setEdit(true)}>Untergruppe hinzufügen</Button>
        </div>
        <p>
          Zum Beispiel „Runde A“ diese Woche und „Runde B“ nächste Woche. Der
          Ankertermin bestimmt die erste Woche. Kunden können die Runde wechseln
          oder einen eigenen Rhythmus erhalten.
        </p>
        {data.cohorts
          .filter((c) => c.facility_id === facilityId)
          .map((c) => (
            <div className="list-row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <p>
                  Alle {c.recurrence_weeks} Wochen · ab{" "}
                  {dateLabel(c.anchor_date)} ·{" "}
                  {data.customers.filter((k) => k.cohort_id === c.id).length}{" "}
                  Kunden
                </p>
              </div>
              <Button variant="secondary" onClick={() => setEdit(c)}>
                Ändern
              </Button>
            </div>
          ))}
      </section>
      {edit && (
        <CohortEditor
          facilityId={facilityId}
          cohort={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function CohortEditor({
  facilityId,
  cohort,
  onClose,
}: {
  facilityId: string;
  cohort?: Cohort;
  onClose: () => void;
}) {
  const { data, rpc, run } = useStore();
  const [name, setName] = useState(cohort?.name || ""),
    [group, setGroup] = useState(cohort?.group_id || ""),
    [weeks, setWeeks] = useState(String(cohort?.recurrence_weeks || 5)),
    [date, setDate] = useState(cohort?.anchor_date || today());
  return (
    <Modal
      title={cohort ? "Untergruppe ändern" : "Untergruppe anlegen"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            await rpc("save_cohort", {
              p_data: {
                id: cohort?.id,
                facility_id: facilityId,
                group_id: group,
                name: name || "Neue Runde",
                recurrence_weeks: Number(weeks),
                anchor_date: date || today(),
              },
            });
            return true;
          });
          if (ok) onClose();
        }}
      >
        <Input label="Name der Runde" value={name} onChange={setName} />
        <Field label="Wohnbereich">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Allgemein / später zuordnen</option>
            {data.groups
              .filter((g) => g.facility_id === facilityId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
        <Input
          label="Rhythmus in Wochen"
          type="number"
          min={1}
          max={52}
          value={weeks}
          onChange={setWeeks}
        />
        <Input
          label="Erste Besuchswoche / Ankertermin"
          type="date"
          value={date}
          onChange={setDate}
        />
        <p className="muted">
          Bestehende nächste Kundentermine behalten Vorrang. Für eine Umstellung
          deren nächstes Datum im Kundenprofil ändern oder leeren.
        </p>
        <Button type="submit">Untergruppe speichern</Button>
      </form>
    </Modal>
  );
}
