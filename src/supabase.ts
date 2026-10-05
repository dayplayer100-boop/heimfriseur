import { assertPublicSupabaseKey } from "./publicConnection";
import { createClient } from "@supabase/supabase-js";
import { deploymentConnection } from "./deployment";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("heimfriseur-connection") || "{}");
  } catch {
    return {};
  }
})();
export const canConfigureConnection =
  !import.meta.env.VITE_SUPABASE_URL && !deploymentConnection.url;
export const connection = {
  url:
    import.meta.env.VITE_SUPABASE_URL || deploymentConnection.url || saved.url,
  key:
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    deploymentConnection.key ||
    saved.key,
};
assertPublicSupabaseKey(connection.key || "");
export const supabase =
  connection.url && connection.key
    ? createClient(connection.url, connection.key, {
        auth: { flowType: "pkce", detectSessionInUrl: true },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            try {
              const selection = JSON.parse(
                sessionStorage.getItem("heimfriseur-admin-business") || "{}",
              );
              if (selection.businessId)
                headers.set("x-heimfriseur-business-id", selection.businessId);
            } catch {
              /* A malformed local preference grants no privileges. */
            }
            return fetch(input, { ...init, headers });
          },
        },
      })
    : null;
export function configure(url: string, key: string) {
  if (!canConfigureConnection)
    throw Error(
      "Das Supabase-Projekt dieser Veröffentlichung ist fest eingerichtet.",
    );
  url = url.trim();
  key = key.trim();
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/.test(url))
    throw Error("Bitte eine gültige Supabase-Projekt-URL angeben.");
  if (!key.trim()) throw Error("Bitte den öffentlichen Schlüssel angeben.");
  assertPublicSupabaseKey(key);
  localStorage.setItem("heimfriseur-connection", JSON.stringify({ url, key }));
  location.reload();
}
