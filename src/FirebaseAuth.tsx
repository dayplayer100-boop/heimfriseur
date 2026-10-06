import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  reload,
} from "firebase/auth";
import { Scissors } from "lucide-react";
import { firebaseAuth } from "./firebaseClient";
import { PasswordInput } from "./PasswordInput";
import { InstallAppButton } from "./InstallApp";
import { Button, Input, formObject } from "./ui";
import { useStore } from "./store";
export function firebaseError(error: unknown) {
  const code = (error as { code?: string }).code;
  if (code === "auth/too-many-requests" || code === "resource-exhausted")
    return "Zu viele Anfragen oder das kostenlose Kontingent ist erreicht. Bitte später erneut versuchen.";
  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/unauthorized-domain"
  )
    return "Diese Anmeldeart oder Website ist in Firebase noch nicht freigeschaltet.";
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
    return "Die Google-Anmeldung wurde abgebrochen.";
  if (code === "auth/network-request-failed" || code === "unavailable")
    return "Keine Verbindung. Bitte Internetverbindung prüfen.";
  if (
    code === "auth/weak-password" ||
    code === "auth/password-does-not-meet-requirements"
  )
    return "Bitte ein sicheres Passwort mit mindestens 12 Zeichen verwenden.";
  return "Die Aktion konnte nicht abgeschlossen werden. Bitte Eingaben und Verbindung prüfen.";
}
export function FirebaseAuthScreen() {
  const { setError, enterDemo } = useStore();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login"),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [unverified, setUnverified] = useState(false),
    [resendAfter, setResendAfter] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!firebaseAuth) return;
    const stop = onAuthStateChanged(firebaseAuth, (u) =>
      setUnverified(!!u && !u.emailVerified),
    );
    void getRedirectResult(firebaseAuth).catch((e) =>
      setError(firebaseError(e)),
    );
    return stop;
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  async function action(fn: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(firebaseError(e));
    } finally {
      setPending(false);
    }
  }
  async function verifyEmail() {
    if (!firebaseAuth?.currentUser || Date.now() < resendAfter) return;
    await sendEmailVerification(firebaseAuth.currentUser, {
      url: location.origin,
    });
    setResendAfter(Date.now() + 60000);
    setMessage("Bestätigung angefordert. Bitte Postfach und Spam prüfen.");
  }
  return (
    <div className="auth">
      <div className="auth-brand"><div className="brand-icon"><Scissors /></div><strong>Heim<span>Friseur</span></strong><h1>Mit Ruhe durch deinen Arbeitstag.</h1><p>Die Firebase-Testversion für deine Friseurbesuche in Einrichtungen.</p></div>
      <section className="auth-card">
        <p className="warning">
          Firebase-Testversion · getrennt von deiner bisherigen App
        </p>
        <InstallAppButton />
        {!firebaseAuth ? (
          <>
            <h2>Firebase noch einrichten</h2>
            <p>
              Die öffentliche Web-App-Konfiguration fehlt. Die Anleitung steht
              in FIREBASE-SPARK.md.
            </p>
          </>
        ) : unverified ? (
          <>
            <h2>E-Mail bestätigen</h2>
            <p>
              Bestätige {firebaseAuth.currentUser?.email} über den Link in
              deiner E-Mail. Erst danach werden Geschäftsdaten freigegeben.
            </p>
            <Button
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  await reload(firebaseAuth!.currentUser!);
                  await firebaseAuth!.currentUser!.getIdToken(true);
                  if (!firebaseAuth!.currentUser!.emailVerified)
                    setMessage("Die Bestätigung steht noch aus.");
                  else location.reload();
                })
              }
            >
              Ich habe meine E-Mail bestätigt
            </Button>
            <Button
              variant="secondary"
              disabled={pending || now < resendAfter}
              onClick={() => void action(verifyEmail)}
            >
              Bestätigung erneut senden
            </Button>
            <Button
              variant="secondary"
              onClick={() => void firebaseAuth!.signOut()}
            >
              Anderes Konto verwenden
            </Button>
          </>
        ) : (
          <>
            <h2>
              {mode === "register"
                ? "Konto erstellen"
                : mode === "reset"
                  ? "Passwort zurücksetzen"
                  : "Anmelden"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = formObject(e);
                void action(async () => {
                  if (mode === "register") {
                    if (d.password.length < 12)
                      throw { code: "auth/weak-password" };
                    await createUserWithEmailAndPassword(
                      firebaseAuth!,
                      d.email,
                      d.password,
                    );
                    await verifyEmail();
                  } else if (mode === "reset") {
                    await sendPasswordResetEmail(firebaseAuth!, d.email, {
                      url: location.origin,
                    });
                    setMessage(
                      "Falls ein passendes Konto vorhanden ist, erhältst du einen Link. Bitte auch Spam prüfen.",
                    );
                  } else
                    await signInWithEmailAndPassword(
                      firebaseAuth!,
                      d.email,
                      d.password,
                    );
                });
              }}
            >
              <Input label="E-Mail" name="email" type="email" required />
              {mode !== "reset" && (
                <PasswordInput newPassword={mode === "register"} />
              )}
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Bitte warten …"
                  : mode === "register"
                    ? "Registrieren"
                    : mode === "reset"
                      ? "Link senden"
                      : "Anmelden"}
              </Button>
            </form>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  const provider = new GoogleAuthProvider();
                  provider.setCustomParameters({ prompt: "select_account" });
                  try {
                    await signInWithPopup(firebaseAuth!, provider);
                  } catch (e) {
                    if ((e as { code?: string }).code === "auth/popup-blocked")
                      await signInWithRedirect(firebaseAuth!, provider);
                    else throw e;
                  }
                })
              }
            >
              Mit Google anmelden
            </Button>
            <div className="auth-links">
              <button
                onClick={() => {
                  setMode(mode === "register" ? "login" : "register");
                  setMessage("");
                }}
              >
                {" "}
                {mode === "register" ? "Zur Anmeldung" : "Konto erstellen"}
              </button>
              <button
                onClick={() => setMode(mode === "reset" ? "login" : "reset")}
              >
                {mode === "reset" ? "Zur Anmeldung" : "Passwort vergessen"}
              </button>
            </div>
          </>
        )}
        {message && <p className="success">{message}</p>}
        <button className="text-button" onClick={enterDemo}>
          Beispieldaten ausprobieren
        </button>
        <p className="muted">
          Bisherige Supabase-Passwörter werden hier nicht automatisch
          übernommen.
        </p>
      </section>
    </div>
  );
}
