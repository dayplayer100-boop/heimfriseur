import { useState } from "react";
import {
  GoogleAuthProvider,
  linkWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { firebaseAuth } from "./firebaseClient";
import { firebaseError } from "./FirebaseAuth";
import { useStore } from "./store";
import { Button } from "./ui";
export function FirebaseAccountSecurity() {
  const { setError, setNotify } = useStore();
  const [pending, setPending] = useState(false);
  const [providers, setProviders] = useState(
    () =>
      firebaseAuth?.currentUser?.providerData.map((p) => p.providerId) || [],
  );
  async function action(fn: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    try {
      await fn();
      setProviders(
        firebaseAuth!.currentUser!.providerData.map((p) => p.providerId),
      );
    } catch (e) {
      setError(firebaseError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel">
      <h2>Kontosicherheit</h2>
      <p>
        Angemeldet als {firebaseAuth?.currentUser?.email}. Google und Passwort
        können mit demselben Konto verbunden werden; UID, Rollen und
        Geschäftsdaten bleiben dabei erhalten.
      </p>
      <p>
        Google:{" "}
        {providers.includes("google.com")
          ? "Verbunden"
          : "Noch nicht verbunden"}{" "}
        · Passwort:{" "}
        {providers.includes("password")
          ? "Eingerichtet"
          : "Noch nicht eingerichtet"}
      </p>
      {!providers.includes("google.com") && (
        <Button
          disabled={pending}
          onClick={() =>
            void action(async () => {
              const provider = new GoogleAuthProvider();
              provider.setCustomParameters({ prompt: "select_account" });
              await linkWithPopup(firebaseAuth!.currentUser!, provider);
              setNotify("Google mit deinem bestehenden Konto verbunden.");
            })
          }
        >
          Google mit diesem Konto verbinden
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          void action(async () => {
            await sendPasswordResetEmail(
              firebaseAuth!,
              firebaseAuth!.currentUser!.email!,
              { url: location.origin },
            );
            setNotify(
              "E-Mail zum Einrichten oder Ändern des Passworts angefordert. Bitte auch Spam prüfen.",
            );
          })
        }
      >
        {providers.includes("password")
          ? "Passwort ändern"
          : "Passwort per E-Mail einrichten"}
      </Button>
      <p className="muted">
        Bestätigte E-Mail erforderlich. Sichere dein Google-Konto zusätzlich mit
        Googles Zwei-Faktor-Schutz.
      </p>
    </section>
  );
}
