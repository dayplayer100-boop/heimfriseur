/** Prices transcribed from the supplied price sheet. Durations are editable estimates. */
export const defaultServices = [
  {
    name: "Damenschnitt",
    price: 22,
    duration_minutes: 30,
    aliases: ["Damenhaarschnitt"],
  },
  {
    name: "Waschen / Schneiden / Föhnen",
    price: 30,
    duration_minutes: 40,
    aliases: [],
  },
  {
    name: "Wasserwelle / Föhnen",
    price: 19,
    duration_minutes: 30,
    aliases: [],
  },
  {
    name: "Färben / Strähnen / Tönen",
    price: 30,
    duration_minutes: 45,
    aliases: ["Farbe"],
  },
  { name: "Färben komplett", price: 60, duration_minutes: 75, aliases: [] },
  {
    name: "Dauerwelle komplett",
    price: 60,
    duration_minutes: 90,
    aliases: ["Dauerwelle"],
  },
  {
    name: "Herrenschnitt trocken",
    price: 18.5,
    duration_minutes: 20,
    aliases: ["Herrenhaarschnitt"],
  },
  { name: "Herrenschnitt nass", price: 22, duration_minutes: 25, aliases: [] },
  {
    name: "Kur / Bartpflege / Wimpern / Bett",
    price: 5,
    duration_minutes: 10,
    aliases: [],
  },
] as const;
export function authReturnUrl(origin: string, token: string | null) {
  return token ? `${origin}/?invite=${encodeURIComponent(token)}` : origin;
}
