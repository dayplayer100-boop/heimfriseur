import { firebaseEnabled } from "./firebaseClient";
import { firebaseRpc, firebaseSnapshot } from "./firebaseRepository";
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
import {
  emptyData,
  type Data,
  type Table,
  type TeamContext,
  type Permission,
  type AppAdminContext,
} from "./types";
export function friendly(e: unknown) {
  if ((e as { code?: string }).code === "permission-denied")
    return "Kein Zugriff. Bitte neu laden oder den Geschäftsführer fragen.";
  if ((e as { code?: string }).code === "resource-exhausted")
    return "Das kostenlose Firebase-Kontingent ist erreicht. Bitte später erneut versuchen.";
  const x = e as { message?: string; code?: string };
  if (x.code === "23503")
    return "Dieser Datensatz kann nicht gelöscht oder zugeordnet werden, weil bereits abhängige Daten vorhanden sind.";
  if (x.code === "23505")
    return "Dieser Eintrag ist bereits vorhanden oder eine Behandlung läuft schon.";
  if (x.code === "23514")
    return "Bitte Eingaben prüfen. Beträge dürfen nicht negativ sein und Pflichtfelder müssen ausgefüllt sein.";
  if (x.code === "23502") return "Bitte alle Pflichtfelder ausfüllen.";
  if (["22P02", "22003", "22007", "22008"].includes(x.code || ""))
    return "Bitte Zahlen, Datum und Uhrzeit prüfen.";
  if (["40001", "40P01"].includes(x.code || ""))
    return "Dieser Besuch wurde gleichzeitig geändert. Bitte erneut versuchen.";
  if (x.code === "PGRST116")
    return "Dieser Datensatz ist nicht verfügbar. Bitte erneut laden.";
  if (x.code === "42501")
    return x.message?.includes("E-Mail-Adresse bestätigen") ||
      x.message?.includes("Zwei-Faktor")
      ? x.message
      : "Du hast keinen Zugriff auf diese Daten.";
  if (x.code === "PGRST202" || x.code === "42P01")
    return "Die Datenbank ist noch nicht eingerichtet. Bitte die mitgelieferte Supabase-Migration ausführen.";
  if (x.message?.includes("Failed to fetch"))
    return "Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.";
  return (
    x.message ||
    "Die Aktion konnte nicht gespeichert werden. Bitte erneut versuchen."
  );
}
async function backendRpc(name: string, params: Record<string, unknown> = {}) {
  if (!firebaseEnabled) return supabase!.rpc(name, params);
  try {
    return { data: await firebaseRpc(name, params), error: null };
  } catch (error) {
    return { data: null, error: error as any };
  }
}
interface Store {
  mfaRequired: boolean;
  unlockMfa: () => Promise<void>;
  appAdmin: AppAdminContext | null;
  selectAdminBusiness: (id: string) => Promise<void>;
  team: TeamContext | null;
  can: (permission: Permission) => boolean;
  isOwner: boolean;
  actorId: string;
  setNavigationGuard: (guard: (() => Promise<boolean>) | null) => void;
  beforeNavigate: () => Promise<boolean>;
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const mfaBlocked = useRef(false);
  const [appAdmin, setAppAdmin] = useState<AppAdminContext | null>(null);
  const [team, setTeam] = useState<TeamContext | null>(null);
  const navigationGuard = useRef<(() => Promise<boolean>) | null>(null);
  const repository = useRef<DemoRepository | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  async function refresh() {
    if (mfaBlocked.current) {
      setLoading(false);
      return;
    }
    const version = ++generation.current;
    if (demo) {
      repository.current ||= new DemoRepository();
      const member = {
        id: "demo-owner",
        business_id: "demo-business",
        user_id: "demo",
        role: "owner" as const,
        display_name: "Anna",
        is_active: true,
      };
      setTeam({
        business: {
          id: "demo-business",
          owner_user_id: "demo",
          name: "HeimFriseur",
        },
        membership: member,
        members: [member],
        assignments: repository.current.data.appointments.map((a) => ({
          id: a.id,
          appointment_id: a.id,
          user_id: "demo",
          is_responsible: true,
        })),
        invitations: [],
        audit: [],
      });
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
      const adminResponse = await backendRpc("get_app_admin_context");
      if (
        adminResponse.error &&
        !["PGRST202", "42883"].includes(adminResponse.error.code)
      )
        throw adminResponse.error;
      const admin = adminResponse.error
        ? null
        : (adminResponse.data as AppAdminContext);
      if (version !== generation.current) return;
      if (admin?.is_admin) {
        if (admin.selected_business_id)
          sessionStorage.setItem(
            "heimfriseur-admin-business",
            JSON.stringify({
              userId: user.id,
              businessId: admin.selected_business_id,
            }),
          );
        else sessionStorage.removeItem("heimfriseur-admin-business");
      }
      if (version === generation.current) setAppAdmin(admin);
      if (admin?.is_admin && !admin.selected_business_id) {
        if (version === generation.current) {
          setTeam(null);
          setData(emptyData());
        }
        return;
      }
      if (firebaseEnabled) {
        const snapshot = await firebaseSnapshot();
        if (version === generation.current) {
          setTeam(snapshot.team);
          setData(snapshot.data);
        }
        return;
      }
      const ctx = await backendRpc("get_team_context");
      if (ctx.error) throw ctx.error;
      const nextTeam = ctx.data as TeamContext;
      if (version === generation.current) {
        if (
          team?.business.id !== nextTeam.business.id ||
          team?.membership.role !== nextTeam.membership.role
        )
          setData(emptyData());
        setTeam(nextTeam);
      }
      if (nextTeam.membership.role === "employee") {
        const snapshot = await backendRpc("employee_snapshot");
        if (snapshot.error) throw snapshot.error;
        if (version === generation.current) setData(snapshot.data as Data);
        return;
      }
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
      if (version === generation.current) {
        // Keep the current editor and its draft during a connection failure.
        // Permission revocation clears sensitive cached data immediately.
        if ((e as { code?: string }).code === "42501") {
          if ((e as { message?: string }).message?.includes("Zwei-Faktor")) {
            mfaBlocked.current = true;
            setMfaRequired(true);
          }
          setTeam(null);
          setData(emptyData());
        }
        setError(friendly(e));
      }
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
    setTeam(null);
    setAppAdmin(null);
    mfaBlocked.current = false;
    setMfaRequired(false);
    try {
      const selection = JSON.parse(
        sessionStorage.getItem("heimfriseur-admin-business") || "{}",
      );
      if (user && selection.userId !== user.id)
        sessionStorage.removeItem("heimfriseur-admin-business");
    } catch {
      sessionStorage.removeItem("heimfriseur-admin-business");
    }
    if (user && !demo && supabase) {
      setLoading(true);
      void (async () => {
        try {
          const assurance =
            await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
          if (assurance.error) throw assurance.error;
          if (
            assurance.data.nextLevel === "aal2" &&
            assurance.data.currentLevel !== "aal2"
          ) {
            mfaBlocked.current = true;
            setMfaRequired(true);
            setLoading(false);
            return;
          }
          const admin = await backendRpc("get_app_admin_context");
          if (admin.error) throw admin.error;
          if (
            admin.data?.is_admin &&
            sessionStorage.getItem("heimfriseur-invite")
          ) {
            if (!firebaseEnabled) {
              sessionStorage.removeItem("heimfriseur-invite");
              setNotify(
                "Du bist als App-Admin angemeldet. Die Mitarbeitereinladung wurde verlassen.",
              );
            } else {
              const invitation = await backendRpc("usable_team_invite", {
                p_token: sessionStorage.getItem("heimfriseur-invite"),
              });
              if (!invitation.error && !invitation.data)
                sessionStorage.removeItem("heimfriseur-invite");
            }
          }
          if (!sessionStorage.getItem("heimfriseur-invite")) {
            if (!admin.data?.is_admin) {
              const init = await backendRpc("initialize_account");
              if (init.error) throw init.error;
            }
            await refresh();
          } else setLoading(false);
        } catch (error) {
          if (
            (error as { message?: string }).message?.includes("Zwei-Faktor")
          ) {
            mfaBlocked.current = true;
            setMfaRequired(true);
          }
          setError(friendly(error));
          setLoading(false);
        }
      })();
    } else void refresh();
  }, [user?.id, demo]);
  useEffect(() => {
    if (!user || demo || !team) return;
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible" && !lock.current)
          void refresh();
      },
      firebaseEnabled ? 120000 : 15000,
    );
    const visible = () => {
      if (document.visibilityState === "visible" && !lock.current)
        void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id, demo, team?.membership.id]);
  useEffect(() => {
    if (!notify) return;
    const id = setTimeout(() => setNotify(""), 4500);
    return () => clearTimeout(id);
  }, [notify]);
  async function save(table: Table, row: Record<string, unknown>) {
    if (demo) return repository.current!.save(table, row);
    if (!supabase || !user) throw Error("Bitte anmelden.");
    if (team?.membership.role !== "owner")
      throw Error("Nur der Geschäftsführer darf Stammdaten ändern.");
    if (firebaseEnabled) return firebaseRpc("save", { table, row });
    const ownerId = team.business.owner_user_id;
    const request = row.id
      ? supabase
          .from(table)
          .update({ ...row, user_id: ownerId })
          .eq("id", row.id)
          .eq("user_id", ownerId)
      : supabase.from(table).insert({ ...row, user_id: ownerId });
    const result = await request.select("id").single();
    if (result.error) throw result.error;
    return result.data.id as string;
  }
  async function remove(table: Table, id: string) {
    if (!demo && team?.membership.role !== "owner")
      throw Error("Nur der Geschäftsführer darf Daten löschen.");
    if (demo) {
      repository.current!.remove(table, id);
      return;
    }
    if (firebaseEnabled) {
      await firebaseRpc("remove", { table, id });
      return;
    }
    const r = await supabase!
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", team!.business.owner_user_id);
    if (r.error) throw r.error;
  }
  async function rpc(name: string, p: Record<string, unknown>) {
    if (demo) return repository.current!.rpc(name, p);
    const r = await backendRpc(name, p);
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
    sessionStorage.removeItem("heimfriseur-admin-business");
    setAppAdmin(null);
    mfaBlocked.current = false;
    setMfaRequired(false);
    setData(emptyData());
    setTeam(null);
    setUser(null);
  }
  return (
    <Context.Provider
      value={{
        mfaRequired,
        unlockMfa: async () => {
          mfaBlocked.current = false;
          setMfaRequired(false);
          await refresh();
        },
        data,
        team,
        appAdmin,
        selectAdminBusiness: async (id) => {
          if (
            !appAdmin?.is_admin ||
            !user ||
            !(await (navigationGuard.current?.() ?? Promise.resolve(true)))
          )
            return;
          if (
            data.treatments.some(
              (t) => t.performed_by === user.id && !t.end_time,
            )
          ) {
            setError(
              "Bitte zuerst deine laufende Behandlung beenden, bevor du das Unternehmen wechselst.",
            );
            return;
          }
          if (id) {
            const logged = await run(async () => {
              await rpc("audit_admin_business_access", { p_business: id });
              return true;
            });
            if (!logged) return;
            sessionStorage.setItem(
              "heimfriseur-admin-business",
              JSON.stringify({ userId: user.id, businessId: id }),
            );
          } else sessionStorage.removeItem("heimfriseur-admin-business");
          generation.current++;
          setData(emptyData());
          setTeam(null);
          location.hash = "dashboard";
          location.reload();
        },
        isOwner: demo || team?.membership.role === "owner",
        can: (permission) =>
          demo ||
          team?.membership.role === "owner" ||
          (team?.membership.permissions?.[permission] ??
            ["record_payments", "close_visits"].includes(permission)),
        actorId: demo ? "demo" : user?.id || "",
        setNavigationGuard: (guard) => {
          navigationGuard.current = guard;
        },
        beforeNavigate: () =>
          navigationGuard.current?.() ?? Promise.resolve(true),
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
