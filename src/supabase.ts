import { createClient } from "@supabase/supabase-js";
import { deploymentConnection } from "./deployment";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("heimfriseur-connection") || "{}");
  } catch {
    return {};
  }
})();
export const connection = {
  url:
    import.meta.env.VITE_SUPABASE_URL || saved.url || deploymentConnection.url,
  key:
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    saved.key ||
    deploymentConnection.key,
};
export const supabase =
  connection.url && connection.key
    ? createClient(connection.url, connection.key)
    : null;
export function configure(url: string, key: string) {
  url = url.trim();
  key = key.trim();
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/.test(url))
    throw Error("Bitte eine gültige Supabase-Projekt-URL angeben.");
  if (!key.trim()) throw Error("Bitte den öffentlichen Schlüssel angeben.");
  if (key.startsWith("sb_secret_"))
    throw Error("Bitte nur einen öffentlichen Publishable-Key verwenden.");
  if (key.startsWith("ey")) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role === "service_role")
        throw Error(
          "Service-Role-Schlüssel dürfen nicht im Browser verwendet werden.",
        );
    } catch (e) {
      if (e instanceof Error && e.message.includes("Service-Role")) throw e;
    }
  }
  localStorage.setItem("heimfriseur-connection", JSON.stringify({ url, key }));
  location.reload();
}
