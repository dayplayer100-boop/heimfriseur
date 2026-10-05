import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { Button } from "./ui";
export const appVersion = __APP_VERSION__;
export function checkAppUpdate() {
  window.dispatchEvent(new Event("heimfriseur-check-update"));
}
export function AppUpdate() {
  const { data, actorId, beforeNavigate, busy, setNotify } = useStore();
  const [latest, setLatest] = useState<{
      version: string;
      buildId: string;
    } | null>(null),
    [checking, setChecking] = useState(false),
    [message, setMessage] = useState(""),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    inFlight = useRef(false);
  useEffect(() => {
    let disposed = false,
      announce = false;
    let checkedCurrent = false;
    let controller: AbortController | undefined;
    const inspect = () => {
      if (!disposed && registration.current?.waiting)
        setWaiting(registration.current.waiting);
    };
    const found = () =>
      registration.current?.installing?.addEventListener(
        "statechange",
        inspect,
      );
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then((r) => {
        if (disposed) return;
        registration.current = r;
        inspect();
        r.addEventListener("updatefound", found);
      });
    async function check(manual = false) {
      if (manual) {
        announce = true;
        setChecking(true);
        setMessage("");
      }
      if (inFlight.current) return;
      checkedCurrent = false;
      inFlight.current = true;
      controller = new AbortController();
      const timer = setTimeout(() => controller?.abort(), 10000);
      try {
        if (!navigator.onLine) throw Error("offline");
        const response = await fetch("/version.json?check=" + Date.now(), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error("version");
        const value = await response.json();
        if (
          typeof value.version !== "string" ||
          typeof value.buildId !== "string"
        )
          throw Error("version");
        if (disposed) return;
        setLatest(value);
        checkedCurrent = value.buildId === __APP_BUILD_ID__;
        if (registration.current) await registration.current.update();
        inspect();
      } catch {
        if (announce && !disposed)
          setMessage(
            "Update-Prüfung nicht möglich. Bitte Internetverbindung prüfen und erneut versuchen.",
          );
      } finally {
        clearTimeout(timer);
        inFlight.current = false;
        if (!disposed) {
          if (announce && checkedCurrent)
            setNotify(
              "Website und App sind auf der aktuellen Version " + appVersion,
            );
          setChecking(false);
        }
        announce = false;
      }
    }
    const manual = () => void check(true),
      automatic = () => {
        if (document.visibilityState === "visible") void check();
      };
    window.addEventListener("heimfriseur-check-update", manual);
    window.addEventListener("focus", automatic);
    window.addEventListener("online", automatic);
    document.addEventListener("visibilitychange", automatic);
    const timer = setInterval(automatic, 60000);
    void check();
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      registration.current?.removeEventListener("updatefound", found);
      window.removeEventListener("heimfriseur-check-update", manual);
      window.removeEventListener("focus", automatic);
      window.removeEventListener("online", automatic);
      document.removeEventListener("visibilitychange", automatic);
    };
  }, []);
  const outdated = !!latest && latest.buildId !== __APP_BUILD_ID__;
  const active = data.treatments.some(
    (t) => !t.end_time && (t.performed_by || t.user_id) === actorId,
  );
  async function update() {
    if (active || !navigator.onLine || !(await beforeNavigate())) return;
    if (
      document.querySelector("form") &&
      !window.confirm(
        "Bitte offene Formularangaben zuerst speichern. Jetzt die aktuelle Version laden?",
      )
    )
      return;
    if (registration.current)
      await registration.current.update().catch(() => {});
    const worker = registration.current?.waiting || waiting;
    if (worker) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      worker.postMessage("ACTIVATE_UPDATE");
    } else location.reload();
  }
  return (
    <div className={"version-bar " + (outdated ? "update-banner" : "")}>
      <span>
        Version {appVersion}
        {outdated ? " · Neue Version " + latest.version + " verfügbar" : ""}
        {outdated && active
          ? " – nach der laufenden Behandlung aktualisieren"
          : ""}
      </span>
      {outdated || waiting ? (
        <Button
          variant="secondary"
          disabled={active || busy || !navigator.onLine}
          onClick={() => void update()}
        >
          Neue Version laden
        </Button>
      ) : (
        <button
          className="text-button"
          disabled={checking}
          onClick={checkAppUpdate}
        >
          {checking ? "Prüfe …" : "Auf Updates prüfen"}
        </button>
      )}
      {message && <span role="alert">{message}</span>}
    </div>
  );
}
