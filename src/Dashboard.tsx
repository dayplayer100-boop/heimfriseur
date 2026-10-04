import {
  CalendarDays,
  Users,
  Euro,
  Clock,
  ArrowUpRight,
  Scissors,
  Leaf,
} from "lucide-react";
import { useStore } from "./store";
import { Button, Title, Empty, Status, Meta } from "./ui";
import { dateLabel, euro, minutes, today, visitStats, metrics } from "./domain";
import type { Appointment } from "./types";
export function VisitCard({
  appointment: a,
  onOpen,
  featured = false,
}: {
  appointment: Appointment;
  onOpen: () => void;
  featured?: boolean;
}) {
  const { data } = useStore();
  const s = visitStats(data, a);
  return (
    <article className={`visit-card ${featured ? "featured" : ""}`}>
      <div className="visit-top">
        <span className="visit-time">
          <Clock size={17} />
          {a.start_time.slice(0, 5)} Uhr
        </span>
        <Status status={a.status} />
      </div>
      <h3>{data.facilities.find((f) => f.id === a.facility_id)?.name}</h3>
      <p>{data.groups.find((g) => g.id === a.group_id)?.name}</p>
      <div className="visit-meta">
        <Meta type="calendar">{dateLabel(a.appointment_date)}</Meta>
        <span className="meta">
          <Users size={16} />
          {s.members.length} Kunden
        </span>
      </div>
      {featured && (
        <>
          <div className="progress-label">
            <span>
              <strong>{s.done}</strong> erledigt
            </span>
            <span>{s.open} offen</span>
          </div>
          <div className="progress">
            <span
              style={{
                width: `${s.members.length ? (s.done / s.members.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="visit-numbers">
            <div>
              <small>Geplanter Umsatz</small>
              <strong>{euro(s.planned)}</strong>
            </div>
            <div>
              <small>Geschätzte Restzeit</small>
              <strong>{minutes(s.remaining)}</strong>
            </div>
          </div>
        </>
      )}
      <Button variant={featured ? "" : "secondary"} onClick={onOpen}>
        Besuch öffnen <ArrowUpRight size={17} />
      </Button>
    </article>
  );
}
export function Dashboard({
  navigate,
  plan,
}: {
  navigate: (p: string) => void;
  plan: () => void;
}) {
  const { data } = useStore();
  const date = today(),
    p = data.profiles[0];
  const todays = data.appointments.filter(
    (a) => a.appointment_date === date && a.status !== "Abgesagt",
  );
  const next = data.appointments
    .filter(
      (a) =>
        a.appointment_date > date &&
        ["Geplant", "Verschoben"].includes(a.status),
    )
    .sort((a, b) =>
      (a.appointment_date + a.start_time).localeCompare(
        b.appointment_date + b.start_time,
      ),
    )
    .slice(0, 5);
  const as = data.appointments.filter(
    (a) => a.appointment_date.slice(0, 7) === date.slice(0, 7),
  );
  const m = metrics(
    data.treatments.filter(
      (t) =>
        t.end_time &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
        }).format(new Date(t.end_time)) === date.slice(0, 7),
    ),
    as,
  );
  return (
    <>
      <Title
        eyebrow={new Intl.DateTimeFormat("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Berlin",
        }).format(new Date())}
        title={`Guten Tag${p?.first_name ? ", " + p.first_name : ""}.`}
        description="Alles bereit für deinen nächsten Besuch."
        action={
          <Button onClick={plan}>
            <CalendarDays size={18} />
            Besuch planen
          </Button>
        }
      />
      <div className="dashboard-columns">
        <section>
          <div className="section-heading">
            <h2>
              Heute <span className="count">{todays.length}</span>
            </h2>
            <span className="muted">{dateLabel(date)}</span>
          </div>
          {todays.length ? (
            <div className="today-grid">
              {todays.map((a) => (
                <VisitCard
                  key={a.id}
                  appointment={a}
                  featured
                  onOpen={() => navigate("visit/" + a.id)}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="Heute sind keine Besuche geplant."
              text="Plane deinen nächsten Besuch in einer Einrichtung."
              action={<Button onClick={plan}>Termin hinzufügen</Button>}
            />
          )}
          <div className="section-heading next-heading">
            <h2>Nächste Besuche</h2>
            <button
              className="text-button"
              onClick={() => navigate("calendar")}
            >
              Kalender öffnen <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="upcoming-list">
            {next.length ? (
              next.map((a) => (
                <button
                  key={a.id}
                  className="upcoming-row"
                  onClick={() => navigate("visit/" + a.id)}
                >
                  <div className="date-tile">
                    <strong>{a.appointment_date.slice(8, 10)}</strong>
                    <span>
                      {new Date(
                        a.appointment_date + "T12:00:00Z",
                      ).toLocaleDateString("de-DE", { month: "short" })}
                    </span>
                  </div>
                  <div className="upcoming-text">
                    <strong>
                      {
                        data.facilities.find((f) => f.id === a.facility_id)
                          ?.name
                      }
                    </strong>
                    <span>
                      {data.groups.find((g) => g.id === a.group_id)?.name} ·{" "}
                      {a.start_time.slice(0, 5)} Uhr
                    </span>
                  </div>
                  <span className="customer-count">
                    <Users size={16} />
                    {
                      data.appointment_customers.filter(
                        (x) => x.appointment_id === a.id,
                      ).length
                    }
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))
            ) : (
              <div className="subtle-empty">
                Noch keine weiteren Besuche geplant.
              </div>
            )}
          </div>
        </section>
        <aside>
          <div className="month-card">
            <div className="month-heading">
              <div>
                <span className="eyebrow">DEIN MONAT IM BLICK</span>
                <h2>
                  {new Date().toLocaleDateString("de-DE", {
                    month: "long",
                    year: "numeric",
                    timeZone: "Europe/Berlin",
                  })}
                </h2>
              </div>
              <span className="round-icon">
                <CalendarDays size={22} />
              </span>
            </div>
            <div className="month-revenue">
              <span>Umsatz</span>
              <strong>{euro(m.revenue)}</strong>
              <span>aus abgeschlossenen Behandlungen</span>
            </div>
            <div className="month-row">
              <Users size={18} />
              <span>Kunden behandelt</span>
              <strong>{m.customers}</strong>
            </div>
            <div className="month-row">
              <Leaf size={18} />
              <span>Materialkosten</span>
              <strong>{euro(m.material)}</strong>
            </div>
            <div className="month-row">
              <Clock size={18} />
              <span>Arbeitszeit</span>
              <strong>{minutes(m.work)}</strong>
            </div>
            <div className="month-net">
              <span>Umsatz nach Material</span>
              <strong>{euro(m.net)}</strong>
            </div>
            <button className="text-button" onClick={() => navigate("reports")}>
              Zur Auswertung <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="workflow-note">
            <Scissors size={24} />
            <div>
              <h3>Ein Kunde nach dem anderen.</h3>
              <p>
                Öffne deinen Besuch, starte die Behandlung und behalte den
                Überblick.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <div className="quick-links">
        <button onClick={() => navigate("facilities")}>
          <span className="round-icon">
            <CalendarDays />
          </span>
          <span>
            <strong>{data.facilities.length} Einrichtungen</strong>
            <small>Deine regelmäßigen Anlaufstellen</small>
          </span>
          <ArrowUpRight />
        </button>
        <button onClick={() => navigate("customers")}>
          <span className="round-icon">
            <Users />
          </span>
          <span>
            <strong>
              {data.customers.filter((c) => c.status === "Aktiv").length} aktive
              Kunden
            </strong>
            <small>Alles Wichtige zu deinen Kunden</small>
          </span>
          <ArrowUpRight />
        </button>
        <button onClick={() => navigate("settings/services")}>
          <span className="round-icon">
            <Euro />
          </span>
          <span>
            <strong>Leistungen & Preise</strong>
            <small>Deine Preisliste verwalten</small>
          </span>
          <ArrowUpRight />
        </button>
      </div>
    </>
  );
}
