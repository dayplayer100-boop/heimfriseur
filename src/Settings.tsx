import { firebaseEnabled } from "./firebaseClient";
import { canConfigureConnection } from "./supabase";
import { AccountSecurity } from "./AccountSecurity";
import { appVersion, checkAppUpdate } from "./AppUpdate";
import { PriceLists } from "./PriceLists";
import { AppAdminPanel } from "./AppAdmin";
import { FeedbackSettings, openIntroduction } from "./Assistance";
import { PaymentsSettings } from "./Payments";
import { TeamSettings } from "./Team";
import { InstallAppButton } from "./InstallApp";
import { useState } from "react";
import {
  LogOut,
  Scissors,
  Building2,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { useStore } from "./store";
import { Title, Button, PlusButton, Empty, Modal } from "./ui";
import { EntityForm } from "./Forms";
import { ConnectionForm } from "./Auth";
import { euro, minutes } from "./domain";
import type { Edit } from "./Records";
export function Settings({
  tab: initial = "Unternehmen",
  edit,
}: {
  tab?: string;
  edit: Edit;
}) {
  const {
    data,
    rpc,
    demo,
    logout,
    setNotify,
    run,
    isOwner,
    appAdmin,
    team,
    beforeNavigate,
  } = useStore();
  const [tab, setTab] = useState(
      !isOwner ? "App" : initial === "services" ? "Leistungen" : initial,
    ),
    [confirm, setConfirm] = useState(false);
  return (
    <>
      <Title
        eyebrow="ALLES PASSEND EINRICHTEN"
        title="Einstellungen"
        description="Dein Unternehmen, deine Leistungen und deine App."
      />
      <div className="tabs">
        {(isOwner
          ? [
              "Unternehmen",
              "Leistungen",
              "Team",
              "Abrechnung",
              "Rückmeldungen",
              "App",
              ...(appAdmin?.is_admin ? ["App-Admin"] : []),
            ]
          : ["App"]
        ).map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "Unternehmen" ? (
              <Building2 size={16} />
            ) : t === "Leistungen" ? (
              <Scissors size={16} />
            ) : (
              <Settings2 size={16} />
            )}{" "}
            {t}
          </button>
        ))}
      </div>
      {tab === "App-Admin" && <AppAdminPanel />}
      {tab === "Abrechnung" && isOwner && <PaymentsSettings />}
      {tab === "Rückmeldungen" && isOwner && <FeedbackSettings />}
      {tab === "Team" && isOwner && <TeamSettings />}
      {tab === "Unternehmen" && isOwner && (
        <section className="panel settings-panel">
          <h2>Unternehmensdaten</h2>
          <p className="muted">
            Diese Angaben erscheinen auf deinem Besuchsbericht.
          </p>
          <EntityForm
            table="profiles"
            row={data.profiles[0]}
            onDone={() => setNotify("Unternehmensdaten gespeichert")}
          />
        </section>
      )}
      {tab === "Leistungen" && isOwner && (
        <>
          <PriceLists />
          <div className="section-heading next-heading">
            <h2>Leistungen & Standarddauer</h2>
            <PlusButton onClick={() => edit("services")}>Leistung</PlusButton>
          </div>
          <p className="muted">
            Preisänderungen gelten für neue Behandlungen. Bereits gespeicherte
            Leistungspreise bleiben erhalten.
          </p>
          {firebaseEnabled && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Preisliste vom Foto übernehmen? Passende Standardleistungen werden aktualisiert, fehlende ergänzt. Individuelle Heimpreise und alte Behandlungen bleiben erhalten.",
                    )
                  )
                    return;
                  void run(async () => {
                    await rpc("apply_default_prices", {});
                    setNotify("Standardpreisliste übernommen");
                  });
                }}
              >
                Standardpreisliste vom Foto übernehmen
              </Button>
              <p className="muted">
                Neun Leistungen aus deiner Preisliste. Die vorgeschlagenen
                Behandlungszeiten sind Schätzwerte und lassen sich ändern.
              </p>
            </>
          )}
          <div className="service-grid">
            {data.services.map((s) => (
              <section className="service-card panel" key={s.id}>
                <div>
                  <h3>{s.name}</h3>
                  <span
                    className={`customer-status ${s.is_active ? "active" : ""}`}
                  >
                    {s.is_active ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>
                <strong className="service-price">{euro(s.price)}</strong>
                <span className="muted">
                  {minutes(s.duration_minutes)} Standarddauer
                </span>
                <Button variant="secondary" onClick={() => edit("services", s)}>
                  Bearbeiten
                </Button>
              </section>
            ))}
          </div>
          {!data.services.length && (
            <Empty
              title="Noch keine Leistungen"
              action={
                <Button onClick={() => edit("services")}>
                  Leistung anlegen
                </Button>
              }
            />
          )}
        </>
      )}
      {tab === "App" && (
        <div className="detail-columns">
          <section className="panel">
            <h2>App-Einstellungen</h2>
            <AccountSecurity />
            <Button variant="secondary" onClick={openIntroduction}>
              Einführung erneut ansehen
            </Button>
            <p>
              {appAdmin?.is_admin
                ? "Admin"
                : (team?.membership.display_name || "Mein Konto") +
                  " · " +
                  (isOwner ? "Geschäftsführer" : "Mitarbeiter")}
            </p>
            {isOwner && (
              <Button
                variant="secondary"
                onClick={() => {
                  location.hash = "setup";
                }}
              >
                Unternehmen Schritt für Schritt einrichten
              </Button>
            )}
            <Button variant="secondary" onClick={checkAppUpdate}>
              Neue App-Version prüfen
            </Button>
            <p className="muted">
              Website und installierte App nutzen dieselbe Veröffentlichung.
              Eine neue Version wird oben angezeigt und über „Neue Version
              laden“ übernommen. Zum Aktualisieren ist Internet nötig.
            </p>
            <div className="settings-install">
              <InstallAppButton />
            </div>
            <dl>
              <dt>Zeitzone</dt>
              <dd>Europe/Berlin</dd>
              <dt>Währung</dt>
              <dd>Euro (€)</dd>
              <dt>Sprache</dt>
              <dd>Deutsch</dd>
              <dt>Version</dt>
              <dd>{appVersion} · Website und installierte App</dd>
            </dl>
            <p className="muted">
              Auf dem Smartphone über das Browser-Menü zum Home-Bildschirm
              hinzufügen. Zum Speichern von Behandlungen ist eine
              Internetverbindung erforderlich.
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                void beforeNavigate().then((ok) => {
                  if (ok) return run(logout);
                })
              }
            >
              <LogOut size={17} />
              {demo ? "Vorschau verlassen" : "Abmelden"}
            </Button>
            {isOwner && (
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        {
                          schema_version: 2,
                          exported_at: new Date().toISOString(),
                          data,
                          team,
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob),
                    anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download =
                    "HeimFriseur-Datensicherung-" +
                    new Date().toISOString().slice(0, 10) +
                    ".json";
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Unternehmensdaten exportieren
              </Button>
            )}
            {demo && (
              <>
                <p className="warning">
                  Vorschau mit fiktiven Daten. Bitte keine echten Kundendaten
                  eingeben.
                </p>
                <Button variant="secondary" onClick={() => setConfirm(true)}>
                  <RotateCcw size={17} />
                  Beispieldaten zurücksetzen
                </Button>
              </>
            )}
          </section>
          {isOwner && canConfigureConnection && (
            <section className="panel">
              <h2>Supabase-Verbindung</h2>
              <ConnectionForm />
            </section>
          )}
        </div>
      )}
      {confirm && (
        <Modal
          title="Beispieldaten zurücksetzen?"
          onClose={() => setConfirm(false)}
        >
          <p>
            Alle Änderungen der Vorschau werden entfernt. Deine Supabase-Daten
            bleiben erhalten.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              sessionStorage.removeItem("heimfriseur-demo");
              location.reload();
            }}
          >
            Vorschau zurücksetzen
          </Button>
        </Modal>
      )}
    </>
  );
}
