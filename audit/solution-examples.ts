// Proposal examples, intentionally not imported into the production app.
// Financial document migration and rule changes must accompany conversion.
export function euroInputToCents(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Betrag mit höchstens zwei Nachkommastellen eingeben.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Betrag ist zu groß.");
  return cents;
}
export function sumCents(values: number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Ungültiger Centbetrag.");
    return sum + value;
  }, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Summe ist zu groß.");
  return total;
}
export function shiftCalendarMonth(date: string, direction: number): string {
  const d = new Date(date + "T12:00:00Z");
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== date ||
    !Number.isInteger(direction)
  ) {
    throw new Error("Ungültiges Datum oder Richtung.");
  }
  // Month view needs the target month, never an overflowing day 29/30/31.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}
export function validTreatmentDuration(start: string, end: string): number {
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
    throw new Error("Behandlungsende muss nach dem Beginn liegen.");
  }
  return (b - a) / 60000;
}
