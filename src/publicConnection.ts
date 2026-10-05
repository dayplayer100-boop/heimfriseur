export function assertPublicSupabaseKey(key: string) {
  if (!key) return;
  if (key.startsWith("sb_publishable_")) return;
  try {
    const parts = key.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role === "anon") return;
    }
  } catch {
    /* Malformed keys are rejected without echoing their contents. */
  }
  throw Error(
    "Nur öffentliche Supabase-Publishable-/Anon-Keys sind erlaubt. Private Schlüssel dürfen nicht im Browser oder Build verwendet werden.",
  );
}
