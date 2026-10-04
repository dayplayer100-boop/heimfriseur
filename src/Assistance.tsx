import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { useStore } from "./store";
import { Button, Modal, Field } from "./ui";
export function openIntroduction() {
  window.dispatchEvent(new Event("heimfriseur-introduction"));
}
export function Assistance() {
  const { team, user, demo, isOwner, rpc, run, setNotify, beforeNavigate } =
    useStore();
  const [mode, setMode] = useState(""),
    [step, setStep] = useState(0),
    [category, setCategory] = useState("Fehler"),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (
      user &&
      team &&
      !demo &&
      team.membership.onboarding_completed === false
    ) {
      setMode("tour");
      setStep(0);
    }
  }, [user?.id, team?.membership.id]);
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setMode("tour");
    };
    window.addEventListener("heimfriseur-introduction", handler);
    return () =>
      window.removeEventListener("heimfriseur-introduction", handler);
  }, []);
  if (!team || (!user && !demo)) return null;
  const steps = isOwner
    ? [
        [
          "Willkommen bei HeimFriseur",
          "Ein Heim nach dem anderen: erst einrichten, dann Kunden behandeln und danach abrechnen. Alle Angaben lassen sich später ändern.",
          "dashboard",
        ],
        [
          "Heime und Wohnbereiche",
          "Unter Einrichtungen legst du das Heim an. Ein wöchentlicher Heimbesuch und die längeren Kundenrhythmen sind getrennt. Untergruppen bestimmen, welche Runde in welcher Woche fällig ist.",
          "facilities",
        ],
        [
          "Kunden und Rechnungsadresse",
          "Trage Name und Zimmer ein. Unbekannte Angaben dürfen offenbleiben. Standardleistungen sparen Tipparbeit. Ein Angehöriger oder Betreuer kann als Rechnungsempfänger eingetragen werden.",
          "customers",
        ],
        [
          "Besuch durchführen",
          "Im Kalender einen Besuch öffnen. Start drücken, Leistungen und Material erfassen, Behandlung beenden. Nicht anwesende Kunden überspringen und einen Nachholtermin wählen. Spontane Kunden lassen sich hinzufügen.",
          "calendar",
        ],
        [
          "Zahlung, Auswertung und Team",
          "Nach jeder Behandlung wird die Zahlung abgefragt; unbekannte Angaben darfst du später ergänzen. Du verwaltest Heimpreise, Mitarbeiterrechte und Berichte. Über Hilfe & Feedback kannst du jederzeit Probleme melden.",
          "settings",
        ],
      ]
    : [
        [
          "Willkommen im Team",
          "Dein Dashboard zeigt die dir zugewiesenen Besuche. Dein Geschäftsführer legt fest, was du bearbeiten darfst.",
          "dashboard",
        ],
        [
          "Kunden behandeln",
          "Besuch öffnen, beim Kunden Start drücken. Der Timer läuft. Wähle Leistungen, trage Material und Arbeitsnotizen ein. Änderungen werden automatisch gespeichert.",
          "calendar",
        ],
        [
          "Abschließen und Hilfe holen",
          "Behandlung beenden und die Zahlung erfassen, soweit erlaubt. Bei Abwesenheit den nächsten Termin wählen. Bei Problemen Hilfe & Feedback öffnen. Die Einführung findest du auch in Einstellungen.",
          "settings",
        ],
      ];
  async function finish() {
    const ok = demo
      ? true
      : await run(async () => {
          await rpc("complete_onboarding", {});
          return true;
        });
    if (ok) setMode("");
  }
  return (
    <>
      <button className="help-launcher" onClick={() => setMode("menu")}>
        <HelpCircle size={18} />
        Hilfe & Feedback
      </button>
      {mode === "menu" && (
        <Modal title="Hilfe & Feedback" onClose={() => setMode("")}>
          <div className="stack">
            <Button
              onClick={() => {
                setStep(0);
                setMode("tour");
              }}
            >
              Einführung ansehen
            </Button>
            <Button variant="secondary" onClick={() => setMode("feedback")}>
              Fehler oder Verbesserung melden
            </Button>
          </div>
        </Modal>
      )}
      {mode === "tour" && (
        <Modal
          title={"Einführung · " + (step + 1) + " von " + steps.length}
          onClose={() => void finish()}
        >
          <div className="tour-step">
            <h2>{steps[step][0]}</h2>
            <p>{steps[step][1]}</p>
            <div className="button-group">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  Zurück
                </Button>
              )}
              <Button
                onClick={() =>
                  step + 1 < steps.length ? setStep(step + 1) : void finish()
                }
              >
                {step + 1 < steps.length ? "Weiter" : "Los geht’s"}
              </Button>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                if (await beforeNavigate()) {
                  await finish();
                  location.hash = steps[step][2];
                }
              }}
            >
              Bereich öffnen
            </Button>
            <Button variant="secondary" onClick={() => void finish()}>
              Einführung schließen
            </Button>
          </div>
        </Modal>
      )}
      {mode === "feedback" && (
        <Modal
          title="Fehler oder Verbesserung melden"
          onClose={() => setMode("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(async () => {
                await rpc("submit_feedback", {
                  p_category: category,
                  p_message: message,
                  p_route: location.hash.slice(1),
                });
                return true;
              });
              if (ok) {
                setMessage("");
                setMode("");
                setNotify("Rückmeldung beim Geschäftsführer gespeichert");
              }
            }}
          >
            <Field label="Art der Rückmeldung">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>Fehler</option>
                <option>Verbesserung</option>
              </select>
            </Field>
            <Field label="Was ist passiert oder was könnte einfacher sein?">
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
              />
            </Field>
            <p className="muted">
              Aktueller Bereich: {location.hash.slice(1) || "Dashboard"}. Die
              Rückmeldung wird im Unternehmen gespeichert. Sie wird nicht
              automatisch an einen externen Entwickler versendet.
            </p>
            <Button type="submit" disabled={message.trim().length < 5}>
              Rückmeldung speichern
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function FeedbackSettings() {
  const { data, rpc, run } = useStore();
  return (
    <section className="panel">
      <h2>Fehler & Verbesserungsvorschläge</h2>
      <p>
        Rückmeldungen aus deinem Unternehmen. Bei einer Support-Anfrage kannst
        du den Text kopieren und gezielt weitergeben.
      </p>
      {data.feedback.map((f) => (
        <div className="audit-row" key={f.id}>
          <strong>
            {f.category} · {f.status}
          </strong>
          <p className="feedback-text">{f.message}</p>
          <small>
            {f.route} ·{" "}
            {f.created_at ? new Date(f.created_at).toLocaleString("de-DE") : ""}
          </small>
          {f.status === "Offen" && (
            <Button
              variant="secondary"
              onClick={() =>
                void run(() => rpc("resolve_feedback", { p_id: f.id }))
              }
            >
              Als erledigt markieren
            </Button>
          )}
        </div>
      ))}
      {!data.feedback.length && (
        <p className="muted">Noch keine Rückmeldungen.</p>
      )}
    </section>
  );
}
