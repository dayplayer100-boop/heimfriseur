import { useState, type FormEvent } from "react";
import { useStore } from "./store";
import { Button, Field, Input, formObject } from "./ui";
import type { Table, Row, Formula } from "./types";
import { today } from "./domain";
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
    ["first_name", "Vorname", "required"],
    ["last_name", "Nachname", "required"],
    ["room_number", "Zimmernummer"],
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
  const values = { ...preset, ...row } as Record<string, any>;
  const [facility, setFacility] = useState(
    values.facility_id || data.facilities[0]?.id || "",
  );
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const obj: Record<string, unknown> = { ...formObject(e) };
    if (row) obj.id = row.id;
    if (table === "customers") {
      obj.facility_id = facility;
      obj.group_id = group;
    }
    if (table === "groups") {
      obj.facility_id = facility;
      obj.recurrence_weeks = rhythm === "custom" ? custom : Number(rhythm);
      obj.preferred_weekday = Number(obj.preferred_weekday);
    }
    if (table === "services") {
      obj.price = Number(obj.price);
      obj.duration_minutes = Number(obj.duration_minutes);
      obj.is_active = obj.is_active === "on";
    }
    const id = await run(() =>
      table === "customers"
        ? rpc("save_customer", { p_data: obj, p_services: selected })
        : save(table, obj),
    );
    if (id) {
      setNotify("Gespeichert");
      onDone(id);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {definitions[table]?.map(([key, label, type]) => (
          <Input
            key={key}
            label={label}
            name={key}
            value={values[key] ?? (type === "number" ? 0 : "")}
            required={type === "required" || type === "number"}
            type={type === "required" ? "text" : type || "text"}
            min={type === "number" ? 0 : undefined}
            step={
              key === "price" ? "0.01" : type === "number" ? "1" : undefined
            }
          />
        ))}
        {(table === "groups" || table === "customers") && (
          <Field label="Einrichtung *">
            <select
              required
              value={facility}
              onChange={(e) => {
                setFacility(e.target.value);
                setGroup(
                  data.groups.find((g) => g.facility_id === e.target.value)
                    ?.id || "",
                );
              }}
            >
              <option value="">Bitte wählen</option>
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
            <Field label="Wohnbereich *">
              <select
                required
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">Bitte wählen</option>
                {data.groups
                  .filter((g) => g.facility_id === facility)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
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
              type="time"
              name="preferred_start_time"
              required
              value={values.preferred_start_time || "09:00"}
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
                <span className="muted">{Number(s.price).toFixed(2)} €</span>
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
  groupId,
  onDone,
}: {
  groupId?: string;
  onDone: (id: string) => void;
}) {
  const { data, rpc, run, setNotify } = useStore();
  const initial = data.groups.find((g) => g.id === groupId) || data.groups[0];
  const [facility, setFacility] = useState(initial?.facility_id || ""),
    [group, setGroup] = useState(initial?.id || ""),
    [weeks, setWeeks] = useState(String(initial?.recurrence_weeks || 5)),
    [time, setTime] = useState(initial?.preferred_start_time || "09:00");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const obj = formObject(e);
    const id = await run(() =>
      rpc("plan_visit", {
        p_group: group,
        p_date: obj.date,
        p_time: time,
        p_weeks: weeks ? Number(weeks) : null,
        p_all: obj.all === "on",
      }),
    );
    if (id) {
      setNotify("Besuch geplant");
      onDone(id);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Einrichtung *">
        <select
          required
          value={facility}
          onChange={(e) => {
            setFacility(e.target.value);
            const g = data.groups.find((g) => g.facility_id === e.target.value);
            setGroup(g?.id || "");
            setWeeks(String(g?.recurrence_weeks || 5));
            setTime(g?.preferred_start_time || "09:00");
          }}
        >
          <option value="">Bitte wählen</option>
          {data.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Wohnbereich *">
        <select
          required
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            const g = data.groups.find((g) => g.id === e.target.value)!;
            setWeeks(String(g.recurrence_weeks));
            setTime(g.preferred_start_time);
          }}
        >
          <option value="">Bitte wählen</option>
          {data.groups
            .filter((g) => g.facility_id === facility)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </Field>
      <div className="form-grid">
        <Input name="date" label="Datum" type="date" required value={today()} />
        <Input
          label="Startzeit"
          type="time"
          required
          value={time}
          onChange={setTime}
        />
      </div>
      <Field label="Wiederholung">
        <select value={weeks} onChange={(e) => setWeeks(e.target.value)}>
          <option value="">Einmaliger Besuch</option>
          {Array.from({ length: 52 }, (_, i) => (
            <option value={i + 1} key={i}>
              Alle {i + 1} Woche{i ? "n" : ""}
            </option>
          ))}
        </select>
      </Field>
      <label className="check-row">
        <input type="checkbox" name="all" defaultChecked />
        Alle aktiven Kunden dieses Wohnbereichs hinzufügen
      </label>
      <p className="muted">
        Der nächste Besuch wird beim Abschluss automatisch angelegt. Jeder
        Termin bleibt einzeln bearbeitbar.
      </p>
      <div className="form-actions">
        <Button type="submit" disabled={!group}>
          Besuch planen
        </Button>
      </div>
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
