import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Button } from "./ui";
export function AppUpdate() {
  const { data, actorId, beforeNavigate } = useStore();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const inspect = () => {
      if (!disposed && registration?.waiting) setWaiting(registration.waiting);
    };
    const found = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", inspect);
    };
    void navigator.serviceWorker.ready.then((r) => {
      registration = r;
      inspect();
      r.addEventListener("updatefound", found);
    });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", found);
    };
  }, []);
  if (!waiting) return null;
  const active = data.treatments.some(
    (t) => !t.end_time && (t.performed_by || t.user_id) === actorId,
  );
  return (
    <div className="update-banner">
      <span>
        {active
          ? "Neue App-Version verfügbar. Beende zuerst deine laufende Behandlung."
          : "Eine neue App-Version ist verfügbar."}
      </span>
      <Button
        variant="secondary"
        disabled={active}
        onClick={async () => {
          if (!(await beforeNavigate())) return;
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );
          waiting.postMessage("ACTIVATE_UPDATE");
        }}
      >
        Jetzt aktualisieren
      </Button>
    </div>
  );
}
