import { useEffect, useState } from "react";
import { useStore } from "./store";
export function SaveStatus() {
  const { busy, error } = useStore();
  const [online, setOnline] = useState(navigator.onLine),
    [draft, setDraft] = useState("saved");
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const changed = (event: Event) =>
      setDraft((event as CustomEvent).detail.status);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    window.addEventListener("heimfriseur-save-status", changed);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("heimfriseur-save-status", changed);
    };
  }, []);
  const label = !online
    ? "Verbindung fehlt"
    : draft === "error" || error
      ? "Speichern prüfen"
      : busy || draft === "saving"
        ? "Wird gespeichert …"
        : draft === "pending"
          ? "Änderungen noch nicht gespeichert"
          : "Gespeichert";
  return (
    <span
      className={
        "save-status " + (!online || draft === "error" ? "warning" : "")
      }
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
