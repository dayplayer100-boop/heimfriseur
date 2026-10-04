// Only extract candidates. No source image or consent form is saved.
export function parseCustomerForm(text: string): Record<string, string> {
  const flat = text.replace(/\r/g, "");
  const result: Record<string, string> = {};
  const room = flat.match(
    /(?:Zimmer|Raum)(?:nummer)?\s*[:.]?\s*([\d]{1,4}[a-z]?)/i,
  );
  if (room) result.room_number = room[1];
  const named =
    flat.match(/(?:Bewohner|Bewohnerin)\s*[:.]\s*([^\n]+)/i) ||
    flat.match(/(?:Name\s*,?\s*Vorname)\s*[:.]\s*([^\n]+)/i);
  if (named) {
    const line = named[1].replace(/Wohnbereich.*$/i, "").trim();
    const parts = line.split(",").map((x) => x.trim());
    if (parts.length === 2) {
      result.last_name = parts[0];
      result.first_name = parts[1];
    }
  }
  const explicit = flat.match(/Friseur gewünscht\s*[:.]\s*(Ja|Nein)/i);
  if (explicit)
    result.hair_request = explicit[1].toLowerCase() === "ja" ? "Ja" : "Nein";
  const yes = flat.match(
    /(?:wird der|ist der) Friseur gewünscht([^]*?)(?:\n\s*2\.|Es wird keine|Bewohner|Name)/i,
  );
  const no = flat.match(
    /(?:keine Friseur gewünscht|kein Friseur gewünscht)([^]*?)(?:Bewohner|Name)/i,
  );
  if (yes && /[xX☒✕]/.test(yes[1])) result.hair_request = "Ja";
  if (no && /[xX☒✕]/.test(no[1]))
    result.hair_request = result.hair_request === "Ja" ? "Unbekannt" : "Nein";
  return result;
}
