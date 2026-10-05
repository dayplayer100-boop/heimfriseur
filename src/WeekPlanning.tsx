import { useState } from "react";
import { useStore } from "./store";
import { Button, Field, Modal, Empty } from "./ui";
import { ScheduleFields, normalizeDate, normalizeTime } from "./ScheduleFields";
import { today, fullName, customerDue, dateLabel } from "./domain";
export function WeekPlanning({ navigate }: { navigate: (p: string) => void }) {
  const { data, isOwner, can, rpc, run, setNotify } = useStore();
  const [facility, setFacility] = useState(data.facilities[0]?.id || ""),
    [anchor, setAnchor] = useState(today()),
    [customer, setCustomer] = useState(""),
    [date, setDate] = useState(dateLabel(today())),
    [time, setTime] = useState("09:00"),
    [showAll, setShowAll] = useState(false);
  const monday = new Date(anchor + "T12:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const start = monday.toISOString().slice(0, 10);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const end = sunday.toISOString().slice(0, 10);
  const customers = data.customers
    .filter(
      (c) =>
        c.facility_id === facility &&
        c.status === "Aktiv" &&
        c.hair_request !== "Nein" &&
        (showAll ||
          Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setUTCDate(d.getUTCDate() + i);
            return customerDue(data, c, d.toISOString().slice(0, 10));
          }).some(Boolean)),
    )
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "de"));
  return (
    <section className="panel">
      <h2>Wochenplanung je Heim</h2>
      <div className="form-grid">
        <Field label="Heim für die Wochenplanung">
          <select
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
          >
            <option value="">Heim auswählen</option>
            {data.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Woche ab">
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
        </Field>
      </div>
      <p>
        {dateLabel(start)} – {dateLabel(end)}
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        Auch später fällige Kunden anzeigen, um sie vorzuziehen
      </label>
      <p className="muted">
        Fälligkeit nach Kundenrhythmus. Behandelte Kunden können bei langen oder
        vergangenen Wochen bereits erledigt sein; die Besuchsliste zeigt den
        tatsächlichen Status.
      </p>
      {customers.map((c) => (
        <div className="list-row" key={c.id}>
          <div>
            <strong>{fullName(c)}</strong>
            <p>
              Zimmer {c.room_number || "–"} ·{" "}
              {c.temporary_due_date
                ? "Einmalig: " + dateLabel(c.temporary_due_date)
                : c.next_due_date
                  ? "Fällig ab " + dateLabel(c.next_due_date)
                  : "Nach Gruppenrhythmus"}
            </p>
          </div>
          {(isOwner || can("edit_schedule")) && (
            <Button
              variant="secondary"
              onClick={() => {
                setCustomer(c.id);
                setDate(
                  dateLabel(c.temporary_due_date || c.next_due_date || today()),
                );
                setTime(
                  (
                    data.facilities.find((f) => f.id === c.facility_id)
                      ?.preferred_start_time || "09:00"
                  ).slice(0, 5),
                );
              }}
            >
              Einmalig ändern
            </Button>
          )}
        </div>
      ))}
      {!customers.length && (
        <Empty title="Keine fälligen Kunden in dieser Woche" />
      )}
      {customer && (
        <Modal
          title="Einmalig vorziehen oder verschieben"
          onClose={() => setCustomer("")}
        >
          <p>
            Der normale Kundenrhythmus bleibt erhalten. Für diese Behandlung
            wird ein Einzeltermin angelegt; ein offener bisheriger Termin dieser
            Runde wird entsprechend markiert.
          </p>
          <ScheduleFields
            date={date}
            setDate={setDate}
            time={time}
            setTime={setTime}
          />
          <Button
            onClick={async () => {
              const id = await run(() =>
                rpc("reschedule_customer_once", {
                  p_customer: customer,
                  p_date: normalizeDate(date),
                  p_time: normalizeTime(time),
                }),
              );
              if (id) {
                setCustomer("");
                setNotify(
                  "Einmaliger Termin gespeichert – normaler Rhythmus bleibt erhalten",
                );
                navigate("visit/" + id);
              }
            }}
          >
            Einmaligen Termin speichern
          </Button>
        </Modal>
      )}
    </section>
  );
}
