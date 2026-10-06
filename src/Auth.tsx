import { firebaseEnabled } from "./firebaseClient";
import { FirebaseAuthScreen } from "./FirebaseAuth";
import { authRedirect, authError } from "./authSupport";
import { PasswordInput } from "./PasswordInput";
import { useEffect, useState } from "react";
import { InstallAppButton } from "./InstallApp";
import { Scissors, ShieldCheck, ArrowLeft } from "lucide-react";
import { supabase, connection, configure } from "./supabase";
import { useStore } from "./store";
import { Button, Input, formObject } from "./ui";
export function ConnectionForm() {
  const { setError } = useStore();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = formObject(e);
        try {
          configure(d.url, d.key);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p>
        Verbinde dein Supabase-Projekt. Die Datenbankmigration findest du im
        Projekt unter <code>supabase/migrations</code>.
      </p>
      <Input
        label="Supabase-Projekt-URL"
        name="url"
        type="url"
        required
        value={connection.url}
      />
      <Input
        label="Öffentlicher Publishable-/Anon-Key"
        name="key"
        required
        value={connection.key}
      />
      <Button type="submit">Verbindung speichern</Button>
      <p className="muted">
        Der öffentliche Schlüssel ist für die Browser-App vorgesehen. Der
        Zugriff wird durch Anmeldung und RLS geschützt.
      </p>
    </form>
  );
}
export function Auth() {
  return firebaseEnabled ? <FirebaseAuthScreen /> : <SupabaseAuthScreen />;
}
function SupabaseAuthScreen() {
  const invitation = sessionStorage.getItem("heimfriseur-invite");
  const { enterDemo, setError } = useStore();
  const [mode, setMode] = useState("login"),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [setup, setSetup] = useState(false),
    [resendAfter, setResendAfter] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const url = new URL(location.href),
      hash = new URLSearchParams(url.hash.slice(1));
    const error = url.searchParams.get("error") || hash.get("error");
    if (error) {
      setError(
        authError({
          code: url.searchParams.get("error_code") || error,
          message: url.searchParams.get("error_description") || "",
        }),
      );
      for (const key of ["error", "error_code", "error_description"]) {
        url.searchParams.delete(key);
        hash.delete(key);
      }
      if (new URLSearchParams(location.hash.slice(1)).has("error"))
        url.hash = hash.toString();
      history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);
  useEffect(() => {
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setMode("update");
      });
      return () => data.subscription.unsubscribe();
    }
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || pending) return;
    const d = formObject(e);
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (mode === "confirm" && Date.now() < resendAfter) return;
      const result =
        mode === "confirm"
          ? await supabase.auth.resend({
              type: "signup",
              email: d.email,
              options: { emailRedirectTo: authRedirect(invitation) },
            })
          : mode === "register"
            ? await supabase.auth.signUp({
                email: d.email,
                password: d.password,
                options: {
                  emailRedirectTo: authRedirect(invitation),
                },
              })
            : mode === "reset"
              ? await supabase.auth.resetPasswordForEmail(d.email, {
                  redirectTo: location.origin + "/?reset=1",
                })
              : mode === "update"
                ? await supabase.auth.updateUser({ password: d.password })
                : await supabase.auth.signInWithPassword({
                    email: d.email,
                    password: d.password,
                  });
      if (result.error) throw result.error;
      if (mode === "register")
        setMessage(
          "Falls die Adresse registriert werden kann, erhältst du eine Bestätigung. Prüfe auch Spam. Kommt keine Mail, nutze „Bestätigung erneut senden“ oder kontaktiere den Betreiber.",
        );
      if (mode === "confirm") {
        setResendAfter(Date.now() + 60000);
        setMessage(
          "Falls eine Bestätigung aussteht, wurde der Versand angefordert. Bitte Postfach und Spam prüfen.",
        );
      }
      if (mode === "reset")
        setMessage(
          "Falls ein Konto existiert, erhältst du eine E-Mail zum Zurücksetzen.",
        );
      if (mode === "update") {
        setMessage("Passwort geändert.");
        setMode("login");
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth">
      <div className="auth-brand">
        <span className="brand-icon">
          <Scissors />
        </span>
        <strong>
          Heim<span>Friseur</span>
        </strong>
        <div className="version">DEIN MOBILER SALON</div>
        <h1>
          Ein guter Tag.
          <br />
          Ein Besuch nach
          <br />
          dem anderen.
        </h1>
        <p>
          Mehr Zeit für deine Kunden. Alles für deinen Arbeitsalltag an einem
          Ort.
        </p>
        <div className="auth-proof">
          <ShieldCheck /> Deine Kundendaten. Sicher in deinem Konto.
        </div>
      </div>
      <section className="auth-card">
        <div className="eyebrow">WILLKOMMEN BEI HEIMFRISEUR</div>
        {invitation && (
          <p className="success">
            Du bist zu einem Team eingeladen. Melde dich mit der eingeladenen
            E-Mail-Adresse an oder registriere sie. Öffne nach der
            E-Mail-Bestätigung erneut den Einladungslink.
          </p>
        )}
        <h2>
          {setup
            ? "Supabase verbinden"
            : mode === "register"
              ? "Konto erstellen"
              : mode === "confirm"
                ? "E-Mail bestätigen"
                : mode === "reset"
                  ? "Passwort vergessen?"
                  : mode === "update"
                    ? "Neues Passwort"
                    : "Schön, dass du da bist."}
        </h2>
        {!setup && mode === "login" && (
          <div className="auth-install">
            <InstallAppButton />
          </div>
        )}
        {setup ? (
          <ConnectionForm />
        ) : supabase ? (
          <form onSubmit={submit}>
            {mode !== "update" && (
              <Input label="E-Mail" name="email" type="email" required />
            )}
            {!["reset", "confirm"].includes(mode) && (
              <PasswordInput
                newPassword={mode === "register" || mode === "update"}
              />
            )}
            {mode === "register" && (
              <p className="muted">
                Mindestens 12 Zeichen. Für ein sicheres Passwort nutze eine
                längere Kombination.
              </p>
            )}
            <Button
              type="submit"
              disabled={pending || (mode === "confirm" && now < resendAfter)}
            >
              {pending
                ? "Bitte warten …"
                : mode === "register"
                  ? "Registrieren"
                  : mode === "confirm"
                    ? now < resendAfter
                      ? "Bitte kurz warten …"
                      : "Bestätigung erneut senden"
                    : mode === "reset"
                      ? "Link senden"
                      : mode === "update"
                        ? "Passwort speichern"
                        : "Anmelden"}
            </Button>
            {message && <p className="success">{message}</p>}
            {["login", "register"].includes(mode) && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError("");
                  try {
                    const result = await supabase!.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: authRedirect(invitation),
                        scopes: "openid email profile",
                        queryParams: { prompt: "select_account" },
                      },
                    });
                    if (result.error) throw result.error;
                  } catch (error) {
                    setError(authError(error));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Mit Google anmelden
              </Button>
            )}
            {mode !== "confirm" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode("confirm");
                  setMessage("");
                }}
              >
                Bestätigung erneut senden
              </button>
            )}
            <div className="auth-links">
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login" ? "Konto erstellen" : "Zur Anmeldung"}
              </button>
              {mode === "login" && (
                <button type="button" onClick={() => setMode("reset")}>
                  Passwort vergessen
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <p>
              Die App ist bereit zur Verbindung mit deinem Supabase-Projekt.
              Danach kannst du ein Konto erstellen und deine Daten sicher
              speichern.
            </p>
            <Button onClick={() => setSetup(true)}>Supabase verbinden</Button>
            <div className="divider">oder erst kennenlernen</div>
            <Button variant="secondary" onClick={enterDemo}>
              Mit Beispieldaten ausprobieren
            </Button>
            <p className="muted">
              Die Vorschau verwendet fiktive Daten in diesem Browser. Keine
              echten Kundendaten eingeben.
            </p>
          </>
        )}
        {setup && (
          <button className="text-button" onClick={() => setSetup(false)}>
            <ArrowLeft size={16} />
            Zurück
          </button>
        )}
        {supabase && !setup && (
          <button className="text-button" onClick={enterDemo}>
            Beispieldaten ausprobieren
          </button>
        )}
      </section>
      <footer>HeimFriseur</footer>
    </div>
  );
}
