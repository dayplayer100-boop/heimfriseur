export const MAX_CENTS = 900_000_000_000;
export function eurosToCents(value: number | string): number {
  if (typeof value === "string") {
    const input = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(input))
      throw Error("Betrag mit höchstens zwei Nachkommastellen eingeben.");
    const [whole, fraction = ""] = input.split(".");
    return checkedCents(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  }
  const scaled = value * 100,
    cents = Math.round(scaled);
  if (!Number.isFinite(value) || value < 0 || Math.abs(scaled - cents) > 1e-7)
    throw Error("Ungültiger Betrag oder mehr als zwei Nachkommastellen.");
  return checkedCents(cents);
}
export function checkedCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS)
    throw Error("Ungültiger Centbetrag.");
  return value;
}
export function sumCents(values: number[]): number {
  return checkedCents(values.reduce((a, b) => a + checkedCents(b), 0));
}
// Euro numbers exist only at the UI/legacy API boundary; all summation is integer.
export function sumMoney(values: (number | null | undefined)[]): number {
  return sumCents(values.map((v) => eurosToCents(v ?? 0))) / 100;
}
export function moneyDifference(a: number, b: number): number {
  return (eurosToCents(a) - eurosToCents(b)) / 100;
}
export function moneyRate(a: number, divisor: number): number {
  return divisor > 0 ? Math.round(eurosToCents(a) / divisor) / 100 : 0;
}
