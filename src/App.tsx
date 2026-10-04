import { Assistance } from "./Assistance";
import { AppUpdate } from "./AppUpdate";
import { TeamInvite, EmployeeCustomer } from "./Team";
import { InstallAppButton } from "./InstallApp";
import { useState, useEffect } from "react";
import {
  Scissors,
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  X,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  ArrowLeft,
} from "lucide-react";
import { useStore } from "./store";
import { Auth } from "./Auth";
import { supabase } from "./supabase";
import { Dashboard } from "./Dashboard";
import { Calendar } from "./Calendar";
import {
  Facilities,
  FacilityDetail,
  GroupDetail,
  Customers,
  CustomerDetail,
} from "./Records";
import { Visit, TreatmentView } from "./Visit";
import { Reports } from "./Reports";
import { Settings as SettingsPage } from "./Settings";
import { EntityForm, VisitForm } from "./Forms";
import { Button, Modal, Input, formObject } from "./ui";
import type { Table, Row } from "./types";
const navigation = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["calendar", "Kalender", CalendarDays],
  ["facilities", "Einrichtungen", Building2],
  ["customers", "Kunden", Users],
  ["reports", "Auswertung", ChartNoAxesCombined],
] as const;
export function App() {
  const store = useStore();
  const {
    data,
    user,
    demo,
    loading,
    error,
    notify,
    setError,
    setNotify,
    run,
    save,
    remove,
    rpc,
    logout,
    isOwner,
    team,
    can,
  } = store;
  const visibleNavigation = isOwner
    ? navigation
    : navigation.filter(([key]) => ["dashboard", "calendar"].includes(key));
  const [path, setPath] = useState(location.hash.slice(1) || "dashboard"),
    [modal, setModal] = useState<{
      type: "edit" | "plan" | "delete";
      table?: Table;
      row?: Row;
      preset?: Record<string, string>;
      group?: string;
      facility?: string;
    } | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [recovery, setRecovery] = useState(
      new URLSearchParams(location.search).has("reset"),
    );
  useEffect(() => {
    const handler = async () => {
      const nextPath = location.hash.slice(1) || "dashboard";
      if (!(await store.beforeNavigate())) {
        history.replaceState(null, "", "#" + path);
        return;
      }
      setPath(nextPath);
      setModal(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    const connected = () => setOnline(navigator.onLine);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      listener?.data.subscription.unsubscribe();
    };
  }, [path]);
  const navigate = (p: string) => {
    location.hash = p;
  };
  const edit = (table: Table, row?: Row, preset?: Record<string, string>) =>
    (isOwner ||
      (table === "customers" &&
        can(row ? "edit_customers" : "add_customers"))) &&
    setModal({ type: "edit", table, row, preset });
  const plan = (group?: string, facility?: string) => {
    if (!isOwner) return;
    setModal({ type: "plan", group, facility });
  };
  const confirmDelete = (table: Table, row: Row) =>
    isOwner && setModal({ type: "delete", table, row });
  const [page, id] = path.split("/");
  const active =
    page === "facility" || page === "group"
      ? "facilities"
      : page === "customer"
        ? "customers"
        : page === "visit" || page === "treatment"
          ? "calendar"
          : page;
  const labels: Record<string, string> = {
    facilities: "Einrichtung",
    groups: "Wohnbereich",
    customers: "Kunde",
    services: "Leistung",
  };
  let content;
  if (loading)
    content = (
      <div className="loading">
        <Scissors className="spin" />
        <p>Deine Daten werden geladen …</p>
      </div>
    );
  else if (recovery)
    content = (
      <section className="panel recovery">
        <h2>Neues Passwort festlegen</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = formObject(e);
            const ok = await run(async () => {
              const r = await supabase!.auth.updateUser({
                password: form.password,
              });
              if (r.error)
                throw Error(
                  "Passwort konnte nicht gespeichert werden. Nutze mindestens 6 Zeichen.",
                );
              return true;
            });
            if (ok) {
              setRecovery(false);
              history.replaceState(null, "", location.pathname + location.hash);
              setNotify("Passwort gespeichert");
            }
          }}
        >
          <Input
            label="Neues Passwort"
            name="password"
            type="password"
            required
          />
          <Button type="submit">Passwort speichern</Button>
        </form>
      </section>
    );
  else if (!user && !demo) content = <Auth />;
  else if (!demo && sessionStorage.getItem("heimfriseur-invite"))
    content = <TeamInvite />;
  else if (!demo && !team)
    content = (
      <section className="panel">
        <h2>Unternehmenszugang nicht verfügbar</h2>
        <p>
          Bitte Verbindung prüfen. Ein deaktivierter Zugang muss vom
          Geschäftsführer freigeschaltet werden. Bei einem App-Update muss die
          Team-Migration ausgeführt sein.
        </p>
        <Button onClick={() => void store.refresh()}>Erneut laden</Button>
        <Button variant="secondary" onClick={() => void logout()}>
          Abmelden
        </Button>
      </section>
    );
  else if (
    !isOwner &&
    ![
      "dashboard",
      "calendar",
      "visit",
      "treatment",
      "settings",
      "customer",
    ].includes(page)
  )
    content = <Dashboard navigate={navigate} plan={() => {}} />;
  else
    switch (page) {
      case "calendar":
        content = <Calendar navigate={navigate} plan={() => plan()} />;
        break;
      case "facilities":
        content = <Facilities navigate={navigate} edit={edit} />;
        break;
      case "facility":
        content = (
          <FacilityDetail
            key={id}
            id={id}
            navigate={navigate}
            edit={edit}
            plan={plan}
            confirmDelete={confirmDelete}
          />
        );
        break;
      case "group":
        content = (
          <GroupDetail
            key={id}
            id={id}
            navigate={navigate}
            edit={edit}
            plan={plan}
            confirmDelete={confirmDelete}
          />
        );
        break;
      case "customers":
        content = <Customers navigate={navigate} edit={edit} />;
        break;
      case "customer":
        content = !isOwner ? (
          <EmployeeCustomer id={id} edit={edit} />
        ) : (
          <CustomerDetail
            key={id}
            id={id}
            navigate={navigate}
            edit={edit}
            confirmDelete={confirmDelete}
          />
        );
        break;
      case "visit":
        content = <Visit key={id} id={id} navigate={navigate} edit={edit} />;
        break;
      case "treatment":
        content = <TreatmentView key={id} id={id} navigate={navigate} />;
        break;
      case "reports":
        content = <Reports navigate={navigate} />;
        break;
      case "settings":
        content = <SettingsPage key={id} tab={id} edit={edit} />;
        break;
      default:
        content = <Dashboard navigate={navigate} plan={() => plan()} />;
    }
  return (
    <>
      {(user || demo) && !recovery ? (
        <div className="app-shell">
          <aside className="sidebar">
            <a className="brand" href="#dashboard">
              <span className="brand-icon">
                <Scissors size={23} />
              </span>
              <strong>
                Heim<span>Friseur</span>
              </strong>
            </a>
            <span className="sidebar-caption">DEIN ARBEITSTAG</span>
            <nav>
              {visibleNavigation.map(([key, label, Icon]) => (
                <a
                  key={key}
                  href={"#" + key}
                  className={active === key ? "active" : ""}
                >
                  <Icon size={21} />
                  <span>{label}</span>
                  {key === "calendar" &&
                    data.appointments.some(
                      (a) => a.status === "In Bearbeitung",
                    ) && <span className="nav-dot" />}
                </a>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <a
                href="#settings"
                className={page === "settings" ? "active" : ""}
              >
                <Settings size={20} />
                Einstellungen
              </a>
              <div className="sidebar-profile">
                <span className="avatar">
                  {data.profiles[0]?.first_name?.[0] || "H"}
                </span>
                <div>
                  <strong>
                    {team?.membership.display_name ||
                      data.profiles[0]?.first_name ||
                      "Mein Konto"}
                  </strong>
                  <span>
                    {data.profiles[0]?.business_name || "HeimFriseur"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Abmelden"
                  onClick={() =>
                    void store.beforeNavigate().then((ok) => {
                      if (ok) return run(logout);
                    })
                  }
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <a className="mobile-brand brand" href="#dashboard">
                <span className="brand-icon">
                  <Scissors size={20} />
                </span>
                <strong>
                  Heim<span>Friseur</span>
                </strong>
              </a>
              <div className="breadcrumb">
                HeimFriseur <span>/</span>{" "}
                {navigation.find(([key]) => key === active)?.[1] ||
                  "Einstellungen"}
              </div>
              <div className="topbar-right">
                <InstallAppButton />
                <span className="desktop-only">
                  {data.profiles[0]?.business_name ||
                    team?.business.name ||
                    "Mein mobiler Salon"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Einstellungen"
                  onClick={() => navigate("settings")}
                >
                  <Settings size={21} />
                </button>
              </div>
            </header>
            {demo && (
              <div className="demo-banner">
                <span>
                  Vorschau · Fiktive Beispieldaten, nur in diesem Browser.
                </span>
                <button
                  onClick={() =>
                    void store.beforeNavigate().then((ok) => {
                      if (ok) return run(logout);
                    })
                  }
                >
                  Mit Supabase verbinden
                </button>
              </div>
            )}
            {!online && (
              <div className="offline-banner">
                <WifiOff size={16} />
                Du bist offline. Speichern ist wieder möglich, sobald du
                verbunden bist.
              </div>
            )}
            <AppUpdate />
            <main>{content}</main>
            <footer className="app-footer">
              <Scissors size={14} />
              <span>HeimFriseur</span>
              <span>Mit Ruhe durch deinen Arbeitstag.</span>
            </footer>
          </div>
          <nav className="bottom-nav">
            {visibleNavigation.map(([key, label, Icon]) => (
              <a
                href={"#" + key}
                key={key}
                className={active === key ? "active" : ""}
              >
                <Icon size={21} />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </div>
      ) : (
        content
      )}
      <Assistance />
      {error && (
        <div className="toast error" role="alert">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button aria-label="Fehler schließen" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {notify && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{notify}</span>
        </div>
      )}
      {modal?.type === "edit" && (
        <Modal
          title={(modal.row ? "Bearbeiten: " : "Neu: ") + labels[modal.table!]}
          onClose={() => setModal(null)}
        >
          <EntityForm
            table={modal.table!}
            row={modal.row}
            preset={modal.preset}
            onDone={async (newId) => {
              const visitId = modal.preset?.appointment_id;
              setModal(null);
              if (visitId) {
                const ok = await run(async () => {
                  await rpc("add_customer_to_visit", {
                    p_appointment: visitId,
                    p_customer: newId,
                    p_entry_type: "Spontan",
                  });
                  return true;
                });
                if (ok) navigate("visit/" + visitId);
              } else if (!modal.row && modal.table === "facilities")
                navigate("facility/" + newId);
              else if (!modal.row && modal.table === "groups")
                navigate("group/" + newId);
            }}
          />
        </Modal>
      )}
      {modal?.type === "plan" && (
        <Modal title="Besuch planen" onClose={() => setModal(null)}>
          <VisitForm
            facilityId={modal.facility}
            groupId={modal.group}
            onDone={(id) => {
              setModal(null);
              navigate("visit/" + id);
            }}
          />
        </Modal>
      )}
      {modal?.type === "delete" && (
        <Modal
          title={
            modal.table === "customers"
              ? "Kunde entfernen?"
              : "Datensatz löschen?"
          }
          onClose={() => setModal(null)}
        >
          <p>
            {modal.table === "customers"
              ? "Kunden mit Behandlungen oder geplanten Besuchen bleiben in der Historie erhalten und werden auf inaktiv gesetzt."
              : "Verknüpfte Daten und historische Behandlungen müssen erhalten bleiben. Verwendete Einrichtungen oder Wohnbereiche können nicht gelöscht werden."}
          </p>
          <div className="button-group">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const table = modal.table!,
                  row = modal.row!;
                const hasHistory =
                  table === "customers" &&
                  data.appointment_customers.some(
                    (m) => m.customer_id === row.id,
                  );
                const ok = await run(async () => {
                  if (hasHistory)
                    await save("customers", { id: row.id, status: "Inaktiv" });
                  else await remove(table, row.id);
                  return true;
                });
                if (ok) {
                  setModal(null);
                  setNotify(
                    hasHistory
                      ? "Kunde auf inaktiv gesetzt"
                      : "Datensatz gelöscht",
                  );
                  if (!hasHistory)
                    navigate(
                      table === "customers" ? "customers" : "facilities",
                    );
                }
              }}
            >
              {modal.table === "customers" &&
              data.appointment_customers.some(
                (m) => m.customer_id === modal.row?.id,
              )
                ? "Auf inaktiv setzen"
                : "Löschen"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
