import { firebaseEnabled } from "./firebaseClient";
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { Button, Field, formObject } from "./ui";
export function AccountSecurity({ required = false }: { required?: boolean }) {
  const { demo, logout, unlockMfa, setError } = useStore();
  const [open, setOpen] = useState(required),
    [pending, setPending] = useState(false),
    [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>(
      [],
    ),
    [selected, setSelected] = useState(""),
    [enrollment, setEnrollment] = useState<{
      id: string;
      qr: string;
      secret: string;
    } | null>(null),
    [message, setMessage] = useState("");
  const unverified = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (unverified.current)
        void supabase?.auth.mfa.unenroll({ factorId: unverified.current });
    },
    [],
  );
  async function load() {
    if (!supabase || demo) return;
    const r = await supabase.auth.mfa.listFactors();
    if (r.error) throw r.error;
    setFactors(r.data.totp);
    setSelected(r.data.totp[0]?.id || "");
  }
  async function action(fn: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await fn();
    } catch {
      setError(
        "Die Zwei-Faktor-Aktion konnte nicht abgeschlossen werden. Bitte Verbindung und aktuellen sechsstelligen Code prüfen.",
      );
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (required) void action(load);
  }, [required]);
  if (demo) return null;
  if (firebaseEnabled)
    return (
      <section className="panel">
        <h2>Kontosicherheit</h2>
        <p>
          Bestätigte E-Mail erforderlich. Nutze vorzugsweise Google mit
          Zwei-Faktor-Schutz im Google-Konto. Firebase-Spark bietet hier keine
          zusätzliche Authenticator-Einrichtung.
        </p>
      </section>
    );
  return (
    <section className="panel account-security">
      <h2>{required ? "Zwei-Faktor-Anmeldung" : "Kontosicherheit"}</h2>
      <p>
        Ein zusätzlicher Code aus deiner Authenticator-App schützt dein Konto.
        Für Geschäftsführer und App-Admins besonders empfohlen.
      </p>
      {!open ? (
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
            void action(load);
          }}
        >
          Zwei-Faktor-Schutz einrichten
        </Button>
      ) : (
        <>
          {!required && !enrollment && factors.length === 0 && (
            <Button
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  const r = await supabase!.auth.mfa.enroll({
                    factorType: "totp",
                    friendlyName: "HeimFriseur",
                  });
                  if (r.error) throw r.error;
                  unverified.current = r.data.id;
                  setEnrollment({
                    id: r.data.id,
                    qr: r.data.totp.qr_code,
                    secret: r.data.totp.secret,
                  });
                })
              }
            >
              Authenticator verbinden
            </Button>
          )}
          {enrollment && (
            <>
              <p>
                Scanne diesen QR-Code mit deiner Authenticator-App oder trage
                den Schlüssel dort ein. Bewahre den Schlüssel sicher auf und
                teile ihn nicht.
              </p>
              <img
                className="mfa-qr"
                alt="QR-Code für die Authenticator-Einrichtung"
                src={
                  "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(enrollment.qr)
                }
              />
              <p>
                <code>{enrollment.secret}</code>
              </p>
            </>
          )}
          {required && factors.length > 1 && (
            <select
              aria-label="Authenticator"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {factors.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.friendly_name || "Authenticator"}
                </option>
              ))}
            </select>
          )}
          {(enrollment || required) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = formObject(e).code;
                void action(async () => {
                  const factorId = enrollment?.id || selected;
                  if (!factorId) throw Error("Authenticator fehlt");
                  const r = await supabase!.auth.mfa.challengeAndVerify({
                    factorId,
                    code,
                  });
                  if (r.error) throw r.error;
                  unverified.current = null;
                  setEnrollment(null);
                  setMessage("Zwei-Faktor-Schutz aktiv.");
                  await unlockMfa();
                  await load();
                });
              }}
            >
              <Field label="Sechsstelliger Code">
                <input
                  aria-label="Sechsstelliger Code"
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                />
              </Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Wird geprüft …" : "Code bestätigen"}
              </Button>
            </form>
          )}
          {!required && factors.length > 0 && !enrollment && (
            <p className="success">
              Zwei-Faktor-Schutz ist eingerichtet. Beim nächsten Anmelden wird
              ein Code benötigt.
            </p>
          )}
          {message && <p className="success">{message}</p>}
          {!required && enrollment && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  const r = await supabase!.auth.mfa.unenroll({
                    factorId: enrollment.id,
                  });
                  if (r.error) throw r.error;
                  unverified.current = null;
                  setEnrollment(null);
                })
              }
            >
              Einrichtung abbrechen
            </Button>
          )}
          {required && (
            <>
              <p className="muted">
                Authenticator verloren? Wende dich an den Betreiber. Die
                Wiederherstellung erfolgt nach Identitätsprüfung, ohne
                Kundendaten zu löschen.
              </p>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => void logout()}
              >
                Abmelden
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
