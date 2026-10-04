import { useEffect, useRef, useState } from "react";
// One request at a time. Acknowledgement belongs to the exact submitted draft,
// never to edits made while that request was in flight.
export function useAutosave<T>(
  draft: T,
  enabled: boolean,
  write: (draft: T, finish: boolean) => Promise<void>,
) {
  const encoded = JSON.stringify(draft);
  const latest = useRef({ draft, encoded, enabled, write });
  latest.current = { draft, encoded, enabled, write };
  const acknowledged = useRef(encoded),
    queue = useRef(Promise.resolve()),
    finished = useRef(false),
    mounted = useRef(true);
  const [status, setStatus] = useState<
      "saved" | "pending" | "saving" | "error"
    >("saved"),
    [error, setError] = useState("");
  const dirty =
    enabled && encoded !== acknowledged.current && !finished.current;
  async function flush(finish = false): Promise<boolean> {
    let ok = false;
    const task = queue.current.then(async () => {
      if (finished.current) {
        ok = true;
        return;
      }
      const next = latest.current;
      if (!next.enabled) {
        ok = true;
        return;
      }
      if (!finish && next.encoded === acknowledged.current) {
        ok = true;
        return;
      }
      if (mounted.current) {
        setStatus("saving");
        setError("");
      }
      try {
        await next.write(next.draft, finish);
        acknowledged.current = next.encoded;
        if (finish) finished.current = true;
        ok = true;
        if (mounted.current)
          setStatus(
            latest.current.encoded === next.encoded || finish
              ? "saved"
              : "pending",
          );
      } catch (e) {
        if (mounted.current) {
          setStatus("error");
          setError(
            (e as Error).message ||
              "Speichern fehlgeschlagen. Bitte erneut versuchen.",
          );
        }
      }
    });
    queue.current = task.catch(() => {});
    await task;
    return ok;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty || !enabled) return;
    setStatus("pending");
    const timer = setTimeout(() => void flush(), 900);
    return () => clearTimeout(timer);
  }, [encoded, enabled]);
  useEffect(() => {
    const retry = () => {
      if (latest.current.enabled && !finished.current) void flush();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (
        latest.current.enabled &&
        latest.current.encoded !== acknowledged.current &&
        !finished.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  return { dirty, status, error, flush };
}
