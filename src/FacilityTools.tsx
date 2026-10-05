import { useState } from "react";
import { useStore } from "./store";
import { Button, Input, Field, Modal } from "./ui";
import { dateLabel, today, fullName } from "./domain";
import type { Cohort } from "./types";
import { PriceLists } from "./PriceLists";
export function FacilityTools({
  facilityId,
  groupsOnly = false,
  groupId,
}: {
  facilityId: string;
  groupsOnly?: boolean;
  groupId?: string;
}) {
  const { data, rpc, run, setNotify } = useStore();
  const [edit, setEdit] = useState<Cohort | true | null>(null),
    [assign, setAssign] = useState<Cohort | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="stack">
      {!groupsOnly && <PriceLists facilityId={facilityId} />}
      <section className="panel">
        <div className="section-heading">
          <h2>Kundengruppen / Besuchsrunden</h2>
          <Button onClick={() => setEdit(true)}>Untergruppe hinzufügen</Button>
        </div>
        <p>
          Erstelle zum Beispiel Runde A und Runde B. Öffne „Kunden zuordnen“, um
          die Kunden auszuwählen. Der Ankertermin und der Wochenrhythmus
          bestimmen, wann die Runde dran ist.
        </p>
        {data.cohorts
          .filter(
            (c) =>
              c.facility_id === facilityId &&
              (!groupId || c.group_id === groupId),
          )
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
              <div className="button-group">
                <Button variant="secondary" onClick={() => setEdit(c)}>
                  Ändern
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAssign(c);
                    setSelected(
                      data.customers
                        .filter((k) => k.cohort_id === c.id)
                        .map((k) => k.id),
                    );
                  }}
                >
                  Kunden zuordnen
                </Button>
              </div>
            </div>
          ))}
      </section>
      {edit && (
        <CohortEditor
          facilityId={facilityId}
          groupId={groupId}
          cohort={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
      {assign && (
        <Modal
          title={"Kunden zuordnen: " + assign.name}
          onClose={() => setAssign(null)}
        >
          <p>
            Mehrere Kunden auswählen. Die bestehende nächste Behandlung bleibt
            erhalten; ihren Termin kannst du im Kundenprofil ändern.
          </p>
          {data.customers
            .filter(
              (c) =>
                c.facility_id === facilityId && c.group_id === assign.group_id,
            )
            .map((c) => (
              <label className="check-row" key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((id) => id !== c.id),
                    )
                  }
                />
                {fullName(c)} · Zimmer {c.room_number || "–"}
              </label>
            ))}
          <Button
            onClick={async () => {
              const ok = await run(async () => {
                for (const c of data.customers.filter(
                  (c) =>
                    c.facility_id === facilityId &&
                    c.group_id === assign.group_id,
                )) {
                  if (selected.includes(c.id) || c.cohort_id === assign.id)
                    await rpc("save_customer", {
                      p_data: {
                        ...c,
                        cohort_id: selected.includes(c.id) ? assign.id : null,
                      },
                      p_services: data.customer_default_services
                        .filter((s) => s.customer_id === c.id)
                        .map((s) => s.service_id),
                    });
                }
                return true;
              });
              if (ok) {
                setAssign(null);
                setNotify("Kundengruppe gespeichert");
              }
            }}
          >
            Zuordnung speichern
          </Button>
        </Modal>
      )}
    </div>
  );
}
function CohortEditor({
  facilityId,
  cohort,
  groupId,
  onClose,
}: {
  facilityId: string;
  cohort?: Cohort;
  groupId?: string;
  onClose: () => void;
}) {
  const { data, rpc, run } = useStore();
  const [name, setName] = useState(cohort?.name || ""),
    [group, setGroup] = useState(cohort?.group_id || groupId || ""),
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
