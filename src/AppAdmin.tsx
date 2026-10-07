import { AdminUsers } from "./AdminUsers";
import { useState } from "react";
import { useStore } from "./store";
import { Button, Input, Field } from "./ui";
import { dateLabel } from "./domain";
export function AppAdminPanel({ compact = false }: { compact?: boolean }) {
  const {
    appAdmin,
    team,
    selectAdminBusiness,
    rpc,
    run,
    setNotify,
    busy,
    user,
  } = useStore();
  const tableNames: Record<string, string> = {
    profiles: "Unternehmensdaten",
    facilities: "Einrichtungen",
    groups: "Wohnbereiche",
    customers: "Kunden",
    services: "Leistungen",
    customer_default_services: "Standardleistungen",
    appointments: "Besuche",
    appointment_customers: "Besuchsliste",
    treatments: "Behandlungen",
    treatment_services: "Behandlungsleistungen",
    color_formulas: "Farbrezepturen",
    cohorts: "Untergruppen",
    facility_service_prices: "Heimpreise",
    payment_methods: "Zahlungsarten",
    customer_billing: "Abrechnungskontakte",
    treatment_payments: "Zahlungen",
    feedback: "Rückmeldungen",
    business_memberships: "Team",
    appointment_assignments: "Besuchszuordnung",
  };
  const [email, setEmail] = useState("");
  if (!appAdmin?.is_admin) return null;
  const businesses = appAdmin.businesses || [],
    admins = appAdmin.admins || [];
  return (
    <section className={"panel app-admin-panel" + (compact ? " compact" : "")}>
      <h2>App-Admin</h2>
      <p>
        {team
          ? `Du verwaltest gerade: ${team.business.name}. Änderungen betreffen dieses Unternehmen.`
          : "Wähle ein Unternehmen. Anschließend kannst du es wie der Geschäftsführer verwalten."}
      </p>
      <Field label="Unternehmen verwalten">
        <select
          disabled={busy}
          value={appAdmin.selected_business_id || ""}
          onChange={(e) => void selectAdminBusiness(e.target.value)}
        >
          <option value="">Unternehmen auswählen</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {b.owner_email}
            </option>
          ))}
        </select>
      </Field>
      {!compact && (
        <>
          <AdminUsers />
          <h3>Unternehmen administrieren</h3>
          <p>
            Nach der Auswahl kannst du Einrichtungen, Kunden, Preise, Termine,
            Teamrechte und Auswertungen des Unternehmens vollständig bearbeiten.
            Wünsche findest du unter Einstellungen → Rückmeldungen.
          </p>
          {team && (
            <div className="button-row">
              <Button
                onClick={() => {
                  location.hash = "facilities";
                }}
              >
                Einrichtungen
              </Button>
              <Button
                onClick={() => {
                  location.hash = "customers";
                }}
              >
                Kunden
              </Button>
              <Button
                onClick={() => {
                  location.hash = "calendar";
                }}
              >
                Termine
              </Button>
              <Button
                onClick={() => {
                  location.hash = "reports";
                }}
              >
                Auswertung
              </Button>
            </div>
          )}
          <h3>App-Admin-Zugänge</h3>
          <p>
            Diese Personen können alle Unternehmen verwalten. Der
            Geschäftsführer eines Unternehmens wird dadurch nicht geändert.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(async () => {
                await rpc("set_app_admin", { p_email: email, p_active: true });
                return true;
              });
              if (ok) {
                setEmail("");
                setNotify("App-Admin-Zugang gespeichert");
              }
            }}
          >
            <Input
              label="Bestätigte Konto-E-Mail"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />
            <Button type="submit" disabled={busy}>
              App-Admin hinzufügen / aktivieren
            </Button>
          </form>
          {admins.map((a) => (
            <div className="list-row" key={a.user_id}>
              <div>
                <strong>
                  {a.user_id === user?.id
                    ? "Dein App-Erstellerzugang"
                    : a.email}
                </strong>
                <p>{a.is_active ? "Aktiv" : "Deaktiviert"}</p>
              </div>
              <Button
                variant="secondary"
                disabled={busy || a.user_id === user?.id}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `${a.email}: App-Admin-Zugang ${a.is_active ? "deaktivieren" : "aktivieren"}?`,
                    )
                  )
                    return;
                  await run(async () => {
                    await rpc("set_app_admin", {
                      p_email: a.email,
                      p_active: !a.is_active,
                    });
                    setNotify("App-Admin-Zugang geändert");
                  });
                }}
              >
                {a.is_active ? "Deaktivieren" : "Aktivieren"}
              </Button>
            </div>
          ))}
          <h3>Admin-Protokoll</h3>
          {(appAdmin.audit || []).map((a) => (
            <div className="audit-row" key={a.id}>
              <strong>
                {a.action === "business_role_changed"
                  ? "Benutzerrolle geändert"
                  : a.action === "business_owner_transferred"
                    ? "Geschäftsführer gewechselt"
                    : a.action === "business_opened" ||
                        a.action === "business_access"
                      ? "Unternehmen geöffnet"
                      : a.action === "data_changed"
                        ? a.details.operation === "DELETE"
                          ? "Datensatz gelöscht"
                          : a.details.operation === "INSERT"
                            ? "Datensatz angelegt"
                            : "Datensatz bearbeitet"
                        : a.action === "admin_access_changed"
                          ? "Admin-Zugang geändert"
                          : "App-Admin eingerichtet"}
              </strong>
              <p>
                {dateLabel(a.created_at)} ·{" "}
                {a.actor_id === user?.id
                  ? "Du"
                  : admins.find((admin) => admin.user_id === a.actor_id)
                      ?.email ||
                    (a.actor_id
                      ? "Unternehmen / Team"
                      : "SQL-Einrichtung")}{" "}
                ·{" "}
                {businesses.find((b) => b.id === a.business_id)?.name ||
                  "App-Verwaltung"}
                {a.details.table
                  ? ` · ${tableNames[String(a.details.table)] || "Daten"}`
                  : ""}
              </p>
              {Boolean(a.details.target_user_id) && (
                <p>
                  Benutzer:{" "}
                  {appAdmin.users?.find(
                    (u) => u.uid === a.details.target_user_id,
                  )?.email ||
                    admins.find((u) => u.user_id === a.details.target_user_id)
                      ?.email ||
                    "Registriertes Konto"}
                  {a.details.role
                    ? ` · ${a.details.role === "owner" ? "Geschäftsführer" : "Mitarbeiter"}`
                    : ""}
                </p>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
