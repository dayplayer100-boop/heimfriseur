import { useState } from "react";
import {
  Users,
  CalendarCheck,
  Euro,
  Leaf,
  Clock,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { useStore } from "./store";
import { Title, Input, Empty } from "./ui";
import {
  dateLabel,
  euro,
  minutes,
  metrics,
  periodRange,
  today,
} from "./domain";
export function Reports({ navigate }: { navigate: (p: string) => void }) {
  const { data, team } = useStore();
  const [period, setPeriod] = useState("Dieser Monat"),
    [facility, setFacility] = useState(""),
    [group, setGroup] = useState(""),
    [performer, setPerformer] = useState(""),
    [start, setStart] = useState(today()),
    [end, setEnd] = useState(today());
  const [from, to] = periodRange(period, start, end);
  const appointments = data.appointments.filter(
    (a) =>
      a.appointment_date >= from &&
      a.appointment_date <= to &&
      (!facility || a.facility_id === facility) &&
      (!group || a.group_id === group),
  );
  const treatments = data.treatments.filter(
    (t) =>
      t.end_time &&
      (!performer || (t.performed_by || t.user_id) === performer) &&
      appointments.some((a) => a.id === t.appointment_id),
  );
  const m = metrics(treatments, appointments);
  const cards = [
    ["Behandelte Kunden", String(m.customers), Users],
    ["Abgeschlossene Besuche", String(m.visits), CalendarCheck],
    ["Umsatz", euro(m.revenue), Euro],
    ["Materialkosten", euro(m.material), Leaf],
    ["Umsatz nach Material", euro(m.net), TrendingUp],
    ["Besuchsdauer", minutes(m.work), Clock],
    ["Behandlungszeit", minutes(m.treatment), Clock],
    ["Umsatz pro Kunde", euro(m.perCustomer), Users],
    [
      performer ? "Umsatz pro Behandlungsstunde" : "Umsatz pro Besuchsstunde",
      euro(
        performer
          ? m.treatment
            ? m.revenue / (m.treatment / 60)
            : 0
          : m.perHour,
      ),
      TrendingUp,
    ],
    ["Ø Behandlungsdauer", minutes(m.average), Clock],
  ] as const;
  return (
    <>
      <Title
        eyebrow="DEIN GESCHÄFT IM BLICK"
        title="Auswertung"
        description="Umsatz, Zeit und Material aus deinen tatsächlichen Behandlungen."
      />
      <div className="toolbar filters">
        <select
          aria-label="Ausführende Person"
          value={performer}
          onChange={(e) => setPerformer(e.target.value)}
        >
          <option value="">Alle ausführenden Personen</option>
          {team?.members.map((m) => (
            <option key={m.id} value={m.user_id}>
              {m.display_name || "Geschäftsführer"}
              {m.is_active ? "" : " (deaktiviert)"}
            </option>
          ))}
        </select>
        <select
          aria-label="Zeitraum"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {[
            "Heute",
            "Diese Woche",
            "Dieser Monat",
            "Dieses Jahr",
            "Benutzerdefiniert",
          ].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Einrichtung"
          value={facility}
          onChange={(e) => {
            setFacility(e.target.value);
            setGroup("");
          }}
        >
          <option value="">Alle Einrichtungen</option>
          {data.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Wohnbereich"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">Alle Wohnbereiche</option>
          {data.groups
            .filter((g) => !facility || g.facility_id === facility)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </div>
      {period === "Benutzerdefiniert" && (
        <div className="date-range">
          <Input label="Von" type="date" value={start} onChange={setStart} />
          <Input label="Bis" type="date" value={end} onChange={setEnd} />
        </div>
      )}
      {from > to && (
        <p className="warning">Das Enddatum muss nach dem Startdatum liegen.</p>
      )}
      <p className="muted">
        {dateLabel(from)} – {dateLabel(to)} · Zuordnung nach Besuchsdatum.
        Besuchsdauer aus abgeschlossenen Besuchen: jeder Besuch wird einmal
        gezählt. Behandlungszeit ist die Summe der tatsächlichen Behandlungen,
        auch bei paralleler Arbeit.
      </p>
      {performer && (
        <p className="muted">
          Der Personenfilter gilt für Behandlungen und Umsatz. Besuchsdauer und
          Besuchszahl zeigen weiterhin die gewählten Besuche des Unternehmens.
          Individuelle Arbeitszeit wird nicht aus Zuweisungen geschätzt.
        </p>
      )}
      <section className="panel cost-chart">
        <div>
          <h2>Umsatz und Materialkosten</h2>
          <p>
            Material: <strong>{euro(m.material)}</strong>
          </p>
          <p>
            Umsatz nach Material: <strong>{euro(m.net)}</strong>
          </p>
          <p className="muted">
            Weitere Betriebsausgaben sind hier nicht erfasst.
          </p>
        </div>
        <svg
          viewBox="0 0 120 120"
          role="img"
          aria-label={`Materialkosten ${euro(m.material)}, Umsatz nach Material ${euro(m.net)}`}
        >
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke={m.revenue ? "#16746c" : "#e3e9e6"}
            strokeWidth="16"
          />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke="#c19b60"
            strokeWidth="16"
            pathLength="100"
            strokeDasharray={`${m.revenue > 0 ? Math.min(100, Math.max(0, (m.material / m.revenue) * 100)) : 0} 100`}
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="57" textAnchor="middle" fontSize="9" fill="#52605b">
            Umsatz
          </text>
          <text x="60" y="70" textAnchor="middle" fontSize="11" fill="#153e39">
            {euro(m.revenue)}
          </text>
        </svg>
        {m.material > m.revenue && (
          <p className="warning">Materialkosten übersteigen den Umsatz.</p>
        )}
      </section>
      <div className="metric-grid">
        {cards.map(([label, value, Icon]) => (
          <section
            className={`metric-card ${label === "Umsatz nach Material" ? "accent" : ""}`}
            key={label}
          >
            <span className="metric-icon">
              <Icon size={20} />
            </span>
            <small>{label}</small>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <div className="section-heading next-heading">
        <h2>Nach Einrichtung</h2>
        <span className="muted">{data.facilities.length} Einrichtungen</span>
      </div>
      <div className="card-grid">
        {data.facilities
          .filter(
            (f) =>
              (!facility || f.id === facility) &&
              appointments.some((a) => a.facility_id === f.id),
          )
          .map((f) => {
            const as = appointments.filter((a) => a.facility_id === f.id),
              ts = treatments.filter((t) =>
                as.some((a) => a.id === t.appointment_id),
              ),
              stats = metrics(ts, as);
            return (
              <button
                className="facility-report panel"
                key={f.id}
                onClick={() => {
                  setFacility(f.id);
                  setGroup("");
                }}
              >
                <div className="section-heading">
                  <h3>{f.name}</h3>
                  <ArrowUpRight size={19} />
                </div>
                <div className="report-revenue">{euro(stats.revenue)}</div>
                <dl>
                  <dt>Abgeschlossene Besuche</dt>
                  <dd>{stats.visits}</dd>
                  <dt>Behandelte Kunden</dt>
                  <dd>{stats.customers}</dd>
                  <dt>Materialkosten</dt>
                  <dd>{euro(stats.material)}</dd>
                  <dt>Besuchsdauer</dt>
                  <dd>{minutes(stats.work)}</dd>
                  <dt>
                    {performer
                      ? "Umsatz / Behandlungsstunde"
                      : "Umsatz / Besuchsstunde"}
                  </dt>
                  <dd>
                    {euro(
                      performer
                        ? stats.treatment
                          ? stats.revenue / (stats.treatment / 60)
                          : 0
                        : stats.perHour,
                    )}
                  </dd>
                </dl>
              </button>
            );
          })}
      </div>
      {!appointments.length && (
        <Empty
          title="Noch keine Daten im Zeitraum"
          text="Sobald du Behandlungen abschließt, werden deine Kennzahlen hier berechnet."
        />
      )}
      {facility && (
        <div className="next-heading">
          <h2>Besuche der Einrichtung</h2>
          {appointments.map((a) => (
            <button
              className="list-row"
              key={a.id}
              onClick={() => navigate("visit/" + a.id)}
            >
              <span>
                {dateLabel(a.appointment_date)} ·{" "}
                {data.groups.find((g) => g.id === a.group_id)?.name}
              </span>
              <span>
                {a.status} <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="muted footnote">
        Umsatz nach Material berücksichtigt ausschließlich Materialkosten.
        Andere Betriebskosten sind nicht enthalten.
      </p>
    </>
  );
}
