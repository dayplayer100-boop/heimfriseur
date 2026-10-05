import { useState } from "react";
import { Input, Button, Field } from "./ui";
import { today } from "./domain";
export function normalizeTime(value: string) {
  const digits = value
    .trim()
    .replace(/^(\d{2}:\d{2}):00$/, "$1")
    .replace(/[:.\s]/g, "");
  if (!/^\d{3,4}$/.test(digits))
    throw Error("Bitte die Uhrzeit als 0930 oder 09:30 eingeben.");
  const padded = digits.padStart(4, "0");
  if (Number(padded.slice(0, 2)) > 23 || Number(padded.slice(2)) > 59)
    throw Error(
      "Bitte eine gültige Uhrzeit zwischen 00:00 und 23:59 eingeben.",
    );
  return padded.slice(0, 2) + ":" + padded.slice(2);
}
export function normalizeDate(value: string) {
  let iso = value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = value.replace(/[.\s/]/g, "");
    if (!/^\d{8}$/.test(d))
      throw Error("Bitte das Datum als 06102026 oder 06.10.2026 eingeben.");
    iso = d.slice(4) + "-" + d.slice(2, 4) + "-" + d.slice(0, 2);
  }
  const parsed = new Date(iso + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    throw Error("Bitte ein gültiges Datum eingeben.");
  return iso;
}
export function ScheduleFields({
  date,
  setDate,
  time,
  setTime,
}: {
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
}) {
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <div className="form-grid">
        <Field label="Datum">
          <input
            inputMode={calendar ? undefined : "numeric"}
            type={calendar ? "date" : "text"}
            value={date}
            placeholder="DD.MM.YYYY"
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Input
          label="Uhrzeit (HHMM oder HH:MM)"
          inputMode="numeric"
          value={time}
          onChange={setTime}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          try {
            const d = normalizeDate(date);
            setDate(
              calendar
                ? d.slice(8) + "." + d.slice(5, 7) + "." + d.slice(0, 4)
                : d,
            );
          } catch {
            const d = today();
            setDate(
              calendar
                ? d.slice(8) + "." + d.slice(5, 7) + "." + d.slice(0, 4)
                : d,
            );
          }
          setCalendar(!calendar);
        }}
      >
        {calendar ? "Datum mit Zahlen eingeben" : "Datum im Kalender auswählen"}
      </Button>
    </>
  );
}
