export function shiftCalendarDate(
  anchor: string,
  view: string,
  direction: number,
) {
  const date = new Date(anchor + "T12:00:00Z");
  if (view === "Monat") {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + direction);
  } else date.setUTCDate(date.getUTCDate() + direction * 7);
  return date.toISOString().slice(0, 10);
}
