import { ScheduleFields, normalizeDate, normalizeTime } from "./ScheduleFields";
import { fullName, dateLabel } from "./domain";
import { useState, type FormEvent } from "react";
import { useStore } from "./store";
import { Button, Field, Input, formObject } from "./ui";
import type { Table, Row, Formula } from "./types";
import { PhotoImport } from "./PhotoImport";
import { today, effectivePrice } from "./domain";
const weekdays = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const definitions: Record<string, [string, string, string?][]> = {
  facilities: [
    ["name", "Name", "required"],
    ["street", "Straße"],
    ["house_number", "Hausnummer"],
    ["postal_code", "PLZ"],
    ["city", "Ort"],
    ["phone", "Telefon", "tel"],
    ["email", "E-Mail", "email"],
    ["contact_name", "Ansprechpartner"],
    ["contact_phone", "Telefon Ansprechpartner", "tel"],
  ],
  groups: [["name", "Gruppenname", "required"]],
  customers: [
    ["first_name", "Vorname"],
    ["last_name", "Nachname"],
    ["room_number", "Zimmer- / Raumnummer"],
  ],
  services: [
    ["name", "Leistung", "required"],
    ["price", "Preis (€)", "number"],
    ["duration_minutes", "Standarddauer (Min.)", "number"],
  ],
  profiles: [
    ["business_name", "Firmenname"],
    ["first_name", "Vorname"],
    ["last_name", "Nachname"],
    ["street", "Straße"],
    ["house_number", "Hausnummer"],
    ["postal_code", "PLZ"],
    ["city", "Ort"],
    ["phone", "Telefon", "tel"],
    ["email", "E-Mail", "email"],
    ["logo_url", "Logo-URL", "url"],
  ],
};
export function EntityForm({
  table,
  row,
  preset,
  onDone,
}: {
  table: Table;
  row?: Row;
  preset?: Record<string, string>;
  onDone: (id: string) => void;
}) {
  const { data, save, rpc, run, setNotify } = useStore();
  const [imported, setImported] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState(false);
  const values = { ...preset, ...row, ...imported } as Record<string, any>;
  const [facility, setFacility] = useState(values.facility_id || "");
  const [group, setGroup] = useState(
    values.group_id ||
      data.groups.find((g) => g.facility_id === facility)?.id ||
      "",
  );
  const [selected, setSelected] = useState(
    data.customer_default_services
      .filter((x) => x.customer_id === row?.id)
      .map((x) => x.service_id),
  );
  const [rhythm, setRhythm] = useState(
    Number(values.recurrence_weeks) > 8
      ? "custom"
      : String(values.recurrence_weeks || 5),
  );
  const [custom, setCustom] = useState(Number(values.recurrence_weeks || 5));
  const [cohort, setCohort] = useState(values.cohort_id || "");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const obj: Record<string, unknown> = { ...formObject(e) };
    if (row) obj.id = row.id;
    if (
      ["facilities", "groups", "services"].includes(table) &&
      !String(obj.name || "").trim()
    )
      obj.name =
        table === "facilities"
          ? "Einrichtung (Name noch offen)"
          : table === "groups"
            ? "Wohnbereich (Name noch offen)"
            : "Leistung (Name noch offen)";
    if (table === "customers") {
      obj.facility_id = facility;
      obj.group_id = group;
      obj.cohort_id = cohort;
      obj.recurrence_weeks = obj.recurrence_weeks
        ? Number(obj.recurrence_weeks)
        : null;
      obj.next_due_date = obj.next_due_date || null;
    }
    if (table === "facilities") {
      obj.visit_recurrence_weeks = Number(obj.visit_recurrence_weeks || 1);
      obj.preferred_weekday = Number(obj.preferred_weekday || 0);
    }
    if (table === "groups") {
      obj.facility_id = facility;
      obj.recurrence_weeks = rhythm === "custom" ? custom : Number(rhythm);
      obj.preferred_weekday = Number(obj.preferred_weekday);
    }
    if (table === "groups" || table === "facilities") {
      try {
        obj.preferred_start_time = normalizeTime(
          String(obj.preferred_start_time || "09:00"),
        );
      } catch (error) {
        await run(async () => {
          throw error;
        });
        return;
      }
    }
    if (table === "services") {
      obj.price = Number(obj.price);
      obj.duration_minutes = Number(obj.duration_minutes);
      obj.is_active = obj.is_active === "on";
    }
    const id = await run(() =>
      table === "customers"
        ? rpc("save_customer", { p_data: obj, p_services: selected })
        : table === "groups"
          ? rpc("save_group_flexible", { p_data: obj })
          : save(table, obj),
    );
    if (id) {
      setNotify("Gespeichert");
      onDone(id);
    }
  }
  return (
    <form onSubmit={submit}>
      {table === "customers" && (
        <>
          <p className="muted">
            Unbekannte Angaben können leer bleiben und später ergänzt werden.
            Ohne Wohnbereich wird „Allgemein / später zuordnen“ verwendet.
          </p>
          <Button variant="secondary" onClick={() => setPhoto(true)}>
            Kundenangaben aus Foto übernehmen
          </Button>
        </>
      )}
      {photo && (
        <PhotoImport
          onClose={() => setPhoto(false)}
          onApply={(v) => {
            setImported(v);
            setPhoto(false);
          }}
        />
      )}
      <div className="form-grid">
        {definitions[table]?.map(([key, label, type]) => (
          <Input
            key={key + (imported[key] || "")}
            label={label}
            name={key}
            value={values[key] ?? (type === "number" ? 0 : "")}
            required={false}
            type={type === "required" ? "text" : type || "text"}
            min={type === "number" ? 0 : undefined}
            step={
              key === "price" ? "0.01" : type === "number" ? "1" : undefined
            }
          />
        ))}
        {(table === "groups" || table === "customers") && (
          <Field label="Einrichtung">
            <select
              value={facility}
              onChange={(e) => {
                setCohort("");
                setFacility(e.target.value);
                setGroup(
                  data.groups.find((g) => g.facility_id === e.target.value)
                    ?.id || "",
                );
              }}
            >
              <option value="">Noch nicht bekannt – später zuordnen</option>
              {data.facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {table === "customers" && (
          <>
            <Field label="Wohnbereich">
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setCohort("");
                }}
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
            <Field label="Untergruppe / Besuchsrunde">
              <select
                value={cohort}
                onChange={(e) => {
                  setCohort(e.target.value);
                  const c = data.cohorts.find((c) => c.id === e.target.value);
                  if (c) setGroup(c.group_id);
                }}
              >
                <option value="">Keine Untergruppe</option>
                {data.cohorts
                  .filter(
                    (c) =>
                      c.facility_id === facility &&
                      (!group || c.group_id === group),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · alle {c.recurrence_weeks} Wochen
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Kundenrhythmus">
              <select
                name="recurrence_weeks"
                defaultValue={values.recurrence_weeks || ""}
              >
                <option value="">
                  Von Untergruppe / Wohnbereich übernehmen
                </option>
                {Array.from({ length: 52 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i === 0 ? "Jede Woche" : "Alle " + (i + 1) + " Wochen"}
                  </option>
                ))}
              </select>
            </Field>
            <Input
              label="Nächste Behandlung (optional)"
              name="next_due_date"
              type="date"
              value={values.next_due_date || ""}
            />
            <Field label="Friseur gewünscht?">
              <select
                key={imported.hair_request || "hair"}
                name="hair_request"
                defaultValue={values.hair_request || "Unbekannt"}
              >
                <option>Unbekannt</option>
                <option>Ja</option>
                <option>Nein</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={values.status || "Aktiv"}>
                {[
                  "Aktiv",
                  "Pausiert",
                  "Krankenhaus",
                  "Ausgezogen",
                  "Inaktiv",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        {table === "facilities" && (
          <>
            <Input
              label="Heimbesuch alle … Wochen"
              name="visit_recurrence_weeks"
              type="number"
              min={1}
              max={52}
              value={values.visit_recurrence_weeks || 1}
            />
            <Field label="Bevorzugter Besuchstag">
              <select
                name="preferred_weekday"
                defaultValue={values.preferred_weekday ?? 2}
              >
                {weekdays.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
            <Input
              label="Übliche Startzeit"
              name="preferred_start_time"
              inputMode="numeric"
              value={String(values.preferred_start_time || "09:00").slice(0, 5)}
            />
          </>
        )}
        {table === "groups" && (
          <>
            <Field label="Wiederholungsrhythmus">
              <select
                value={Number(rhythm) > 8 ? "custom" : rhythm}
                onChange={(e) => setRhythm(e.target.value)}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i === 0 ? "Jede Woche" : `Alle ${i + 1} Wochen`}
                  </option>
                ))}
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </Field>
            {(rhythm === "custom" || Number(rhythm) > 8) && (
              <Input
                label="Anzahl Wochen"
                type="number"
                min={1}
                required
                value={custom}
                onChange={(v) => setCustom(Number(v))}
              />
            )}
            <Field label="Bevorzugter Wochentag">
              <select
                name="preferred_weekday"
                defaultValue={values.preferred_weekday ?? 2}
              >
                {weekdays.map((s, i) => (
                  <option key={s} value={i}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Input
              label="Bevorzugte Startzeit"
              inputMode="numeric"
              name="preferred_start_time"
              value={String(values.preferred_start_time || "09:00").slice(0, 5)}
            />
          </>
        )}
        {table === "services" && (
          <label className="check-row">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={values.is_active ?? true}
            />
            Leistung aktiv
          </label>
        )}
      </div>
      {table === "customers" && (
        <div className="form-section">
          <h3>Standardleistungen</h3>
          <p className="muted">
            Bei jeder Behandlung automatisch vorausgewählt.
          </p>
          {data.services
            .filter((s) => s.is_active)
            .map((s) => (
              <label className="check-row" key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, s.id]
                        : selected.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>{s.name}</span>
                <span className="muted">
                  {effectivePrice(data, s.id, facility).toFixed(2)} €
                </span>
              </label>
            ))}
        </div>
      )}
      {["facilities", "groups", "customers"].includes(table) && (
        <Field label="Notizen">
          <textarea name="notes" defaultValue={values.notes || ""} rows={3} />
        </Field>
      )}
      <div className="form-actions">
        <Button type="submit">Speichern</Button>
      </div>
    </form>
  );
}
export function VisitForm({
  facilityId,
  groupId,
  onDone,
}: {
  groupId?: string;
  facilityId?: string;
  onDone: (id: string) => void;
}) {
  const { data, rpc, run, setNotify, isOwner, team, actorId } = useStore();
  const initial = data.groups.find((g) => g.id === groupId);
  const first =
    data.facilities.find(
      (f) => f.id === (facilityId || initial?.facility_id),
    ) || data.facilities[0];
  const [facility, setFacility] = useState(first?.id || ""),
    [group, setGroup] = useState(initial?.id || ""),
    [cohort, setCohort] = useState(""),
    [customer, setCustomer] = useState(""),
    [date, setDate] = useState(dateLabel(today())),
    [createGroup, setCreateGroup] = useState(false);
  const permittedGroups = data.groups.filter(
    (g) =>
      isOwner ||
      data.appointments.some(
        (a) =>
          a.facility_id === g.facility_id &&
          (a.all_groups || a.group_id === g.id) &&
          team?.assignments.some(
            (x) => x.appointment_id === a.id && x.user_id === actorId,
          ),
      ),
  );
  const [weeks, setWeeks] = useState(
      String(first?.visit_recurrence_weeks || 1),
    ),
    [time, setTime] = useState(
      (first?.preferred_start_time || "09:00").slice(0, 5),
    );
  if (createGroup)
    return (
      <>
        <h3>Gruppe anlegen</h3>
        <EntityForm
          table="groups"
          preset={{ facility_id: facility }}
          onDone={(id) => {
            setGroup(id);
            setCreateGroup(false);
          }}
        />
        <Button variant="secondary" onClick={() => setCreateGroup(false)}>
          Zurück zur Terminplanung
        </Button>
      </>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const obj = formObject(e);
        const id = await run(() =>
          rpc("plan_customer_visit", {
            p_facility: facility || null,
            p_group: group || null,
            p_customer: customer || null,
            p_date: normalizeDate(date),
            p_time: normalizeTime(time || "09:00"),
            p_weeks: weeks ? Number(weeks) : null,
            p_all: obj.all === "on",
            p_cohort: cohort || null,
          }),
        );
        if (id) {
          setNotify("Besuch geplant");
          onDone(id);
        }
      }}
    >
      <Field label="Einrichtung">
        <select
          value={facility}
          onChange={(e) => {
            const f = data.facilities.find((f) => f.id === e.target.value);
            setFacility(e.target.value);
            setGroup("");
            setCustomer("");
            setCohort("");
            setWeeks(String(f?.visit_recurrence_weeks || 1));
            setTime((f?.preferred_start_time || "09:00").slice(0, 5));
          }}
        >
          <option value="">Noch offen – später zuordnen</option>
          {data.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gruppe">
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setCustomer("");
            setCohort("");
          }}
        >
          <option value="">
            {isOwner
              ? "Alle Wohnbereiche des Heims"
              : "Zugewiesene Gruppe auswählen"}
          </option>
          {permittedGroups
            .filter((g) => g.facility_id === facility)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </Field>
      {isOwner && facility && (
        <Button variant="secondary" onClick={() => setCreateGroup(true)}>
          Gruppe anlegen
        </Button>
      )}
      <Field label="Kunde (optional)">
        <select
          value={customer}
          onChange={(e) => {
            setCustomer(e.target.value);
            setWeeks(
              e.target.value ? "" : String(first?.visit_recurrence_weeks || 1),
            );
          }}
        >
          <option value="">Alle fälligen Kunden der Gruppe</option>
          {data.customers
            .filter(
              (c) =>
                c.facility_id === facility &&
                (!group || c.group_id === group) &&
                c.status === "Aktiv" &&
                c.hair_request !== "Nein",
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
                {c.room_number ? " · Zi. " + c.room_number : ""}
              </option>
            ))}
        </select>
      </Field>
      {!customer && (
        <Field label="Untergruppe">
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="">Alle fälligen Untergruppen / Kunden</option>
            {data.cohorts
              .filter(
                (c) =>
                  c.facility_id === facility &&
                  (!group || c.group_id === group),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <ScheduleFields
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
      />
      <Field label="Wiederholung des Heimbesuchs">
        <select value={weeks} onChange={(e) => setWeeks(e.target.value)}>
          <option value="">Einmaliger Besuch</option>
          {Array.from({ length: 52 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i === 0 ? "Jede Woche" : "Alle " + (i + 1) + " Wochen"}
            </option>
          ))}
        </select>
      </Field>
      {!customer && (
        <label className="check-row">
          <input type="checkbox" name="all" defaultChecked />
          Fällige aktive Kunden automatisch hinzufügen
        </label>
      )}
      <p className="muted">
        Das Heim kann jede Woche besucht werden. Kunden werden anhand ihres
        eigenen Rhythmus, ihrer Untergruppe und des nächsten Behandlungstermins
        ausgewählt. Spontane und vorgezogene Kunden können später ergänzt
        werden.
      </p>
      <Button type="submit">Besuch planen</Button>
    </form>
  );
}
export const formulaFields: [keyof Formula, string, string?][] = [
  ["product", "Produkt / Hersteller"],
  ["color_1", "Farbe 1"],
  ["color_1_amount", "Menge Farbe 1 (g)", "number"],
  ["color_2", "Farbe 2"],
  ["color_2_amount", "Menge Farbe 2 (g)", "number"],
  ["color_3", "Farbe 3"],
  ["color_3_amount", "Menge Farbe 3 (g)", "number"],
  ["developer_strength", "Entwicklerstärke"],
  ["developer_amount", "Menge Entwickler (ml)", "number"],
  ["processing_time_minutes", "Einwirkzeit (Min.)", "number"],
];
export function FormulaFields({
  value,
  onChange,
}: {
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  return (
    <>
      <div className="form-grid">
        {formulaFields.map(([name, label, type]) => (
          <Input
            key={name}
            label={label}
            type={type || "text"}
            min={type === "number" ? 0 : undefined}
            step={type === "number" ? "any" : undefined}
            value={value[name] ?? ""}
            onChange={(v) =>
              onChange({
                ...value,
                [name]: type === "number" ? (v === "" ? null : Number(v)) : v,
              })
            }
          />
        ))}
      </div>
      <Field label="Rezeptur-Notizen">
        <textarea
          value={value.notes || ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </Field>
    </>
  );
}
