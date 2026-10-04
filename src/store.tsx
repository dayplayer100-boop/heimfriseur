import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { DemoRepository } from "./demo";
import { emptyData, type Data, type Table } from "./types";
function friendly(e: unknown) {
  const x = e as { message?: string; code?: string };
  if (x.code === "23503")
    return "Dieser Datensatz kann nicht gelöscht oder zugeordnet werden, weil bereits abhängige Daten vorhanden sind.";
  if (x.code === "23505")
    return "Dieser Eintrag ist bereits vorhanden oder eine Behandlung läuft schon.";
  if (x.code === "23514")
    return "Bitte Eingaben prüfen. Beträge dürfen nicht negativ sein und Pflichtfelder müssen ausgefüllt sein.";
  if (x.code === "42501") return "Du hast keinen Zugriff auf diese Daten.";
  if (x.code === "PGRST202" || x.code === "42P01")
    return "Die Datenbank ist noch nicht eingerichtet. Bitte die mitgelieferte Supabase-Migration ausführen.";
  if (x.message?.includes("Failed to fetch"))
    return "Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.";
  return (
    x.message ||
    "Die Aktion konnte nicht gespeichert werden. Bitte erneut versuchen."
  );
}
interface Store {
  data: Data;
  user: User | null;
  demo: boolean;
  loading: boolean;
  error: string;
  busy: boolean;
  notify: string;
  setNotify: (s: string) => void;
  setError: (s: string) => void;
  enterDemo: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  save: (table: Table, row: Record<string, unknown>) => Promise<string>;
  remove: (table: Table, id: string) => Promise<void>;
  rpc: (name: string, p: Record<string, unknown>) => Promise<any>;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(emptyData),
    [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(
      sessionStorage.getItem("heimfriseur-mode") === "demo",
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notify, setNotify] = useState("");
  const repository = useRef<DemoRepository | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  async function refresh() {
    const version = ++generation.current;
    if (demo) {
      repository.current ||= new DemoRepository();
      setData(structuredClone(repository.current.data));
      setLoading(false);
      return;
    }
    if (!supabase || !user) {
      setData(emptyData());
      setLoading(false);
      return;
    }
    try {
      const result = emptyData();
      await Promise.all(
        (Object.keys(result) as Table[]).map(async (table) => {
          let offset = 0;
          const rows: any[] = [];
          while (true) {
            const response = await supabase!
              .from(table)
              .select("*")
              .order("id")
              .range(offset, offset + 999);
            if (response.error) throw response.error;
            rows.push(...response.data);
            if (response.data.length < 1000) break;
            offset += 1000;
          }
          (result[table] as any) = rows;
        }),
      );
      if (version === generation.current) setData(result);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(friendly(error));
      setUser(data.session?.user || null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setData(emptyData());
    if (user && !demo && supabase) {
      setLoading(true);
      supabase.rpc("initialize_account").then(({ error }) => {
        if (error) setError(friendly(error));
        void refresh();
      });
    } else void refresh();
  }, [user?.id, demo]);
  useEffect(() => {
    if (!notify) return;
    const id = setTimeout(() => setNotify(""), 4500);
    return () => clearTimeout(id);
  }, [notify]);
  async function save(table: Table, row: Record<string, unknown>) {
    if (demo) return repository.current!.save(table, row);
    if (!supabase || !user) throw Error("Bitte anmelden.");
    const request = row.id
      ? supabase
          .from(table)
          .update({ ...row, user_id: user.id })
          .eq("id", row.id)
          .eq("user_id", user.id)
      : supabase.from(table).insert({ ...row, user_id: user.id });
    const result = await request.select("id").single();
    if (result.error) throw result.error;
    return result.data.id as string;
  }
  async function remove(table: Table, id: string) {
    if (demo) {
      repository.current!.remove(table, id);
      return;
    }
    const r = await supabase!
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", user!.id);
    if (r.error) throw r.error;
  }
  async function rpc(name: string, p: Record<string, unknown>) {
    if (demo) return repository.current!.rpc(name, p);
    const r = await supabase!.rpc(name, p);
    if (r.error) throw r.error;
    return r.data;
  }
  async function run<T>(fn: () => Promise<T>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      return result;
    } catch (e) {
      setError(friendly(e));
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    generation.current++;
    if (demo) {
      sessionStorage.removeItem("heimfriseur-mode");
      setDemo(false);
    } else {
      const result = await supabase!.auth.signOut();
      if (result.error) {
        setError(friendly(result.error));
        return;
      }
    }
    setData(emptyData());
    setUser(null);
  }
  return (
    <Context.Provider
      value={{
        data,
        user,
        demo,
        loading,
        error,
        busy,
        notify,
        setNotify,
        setError,
        enterDemo: () => {
          sessionStorage.setItem("heimfriseur-mode", "demo");
          setDemo(true);
        },
        logout,
        refresh,
        save,
        remove,
        rpc,
        run,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
