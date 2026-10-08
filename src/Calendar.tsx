import { shiftCalendarDate } from "./calendarDates";
import { WeekPlanning } from "./WeekPlanning";
import { scheduledCustomerLabel } from "./domain";
import { visitArea } from "./domain";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useStore } from "./store";
import { Button, Title, Empty, Status } from "./ui";
import { dateLabel, today } from "./domain";
export function Calendar({
  navigate,
  plan,
}: {
  navigate: (p: string) => void;
  plan: () => void;
}) {
  const { data, isOwner, can } = useStore();
  const [view, setView] = useState("Liste"),
    [anchor, setAnchor] = useState(today());
  const date = new Date(anchor + "T12:00:00Z");
  function shift(direction: number) {
    setAnchor(shiftCalendarDate(anchor, view, direction));
  }
  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12),
  );
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const endWeek = new Date(monday);
  endWeek.setUTCDate(monday.getUTCDate() + 6);
  const visits = data.appointments
    .filter((a) =>
      view === "Liste"
        ? a.appointment_date >= anchor
        : view === "Monat"
          ? a.appointment_date.slice(0, 7) === anchor.slice(0, 7)
          : a.appointment_date >= monday.toISOString().slice(0, 10) &&
            a.appointment_date <= endWeek.toISOString().slice(0, 10),
    )
    .sort((a, b) =>
      (a.appointment_date + a.start_time).localeCompare(
        b.appointment_date + b.start_time,
      ),
    );
  const days =
    view === "Monat"
      ? Array.from({ length: 42 }, (_, i) => {
          const d = new Date(first);
          d.setUTCDate(1 - ((first.getUTCDay() + 6) % 7) + i);
          return d.toISOString().slice(0, 10);
        })
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setUTCDate(d.getUTCDate() + i);
          return d.toISOString().slice(0, 10);
        });
  return (
    <>
      <Title
        eyebrow="DEIN BESUCHSPLAN"
        title="Kalender"
        description="Regelmäßige Besuche. Ein klarer Überblick."
        action={
          (isOwner || can("edit_schedule")) && (
            <Button onClick={plan}>
              <CalendarDays size={18} />
              Besuch planen
            </Button>
          )
        }
      />
      <details className="week-planning">
        <summary>Wochenplanung je Heim · fällige Kunden</summary>
        <WeekPlanning navigate={navigate} />
      </details>
      <div className="calendar-toolbar">
        <div className="segmented">
          {["Monat", "Woche", "Liste"].map((v) => (
            <button
              key={v}
              className={v === view ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="calendar-date">
          <button
            className="icon-button"
            aria-label="Vorheriger Zeitraum"
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </button>
          <strong>
            {view === "Monat"
              ? date.toLocaleDateString("de-DE", {
                  month: "long",
                  year: "numeric",
                })
              : view === "Woche"
                ? dateLabel(monday.toISOString().slice(0, 10)) +
                  " – " +
                  dateLabel(endWeek.toISOString().slice(0, 10))
                : "Ab " + dateLabel(anchor)}
          </strong>
          <button
            className="icon-button"
            aria-label="Nächster Zeitraum"
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </button>
          <button className="text-button" onClick={() => setAnchor(today())}>
            Heute
          </button>
        </div>
      </div>
      {view === "Liste" ? (
        <div className="calendar-list">
          {visits.map((a) => (
            <button
              className="calendar-list-item"
              key={a.id}
              onClick={() => navigate("visit/" + a.id)}
            >
              <div className="date-tile">
                <strong>{a.appointment_date.slice(8)}</strong>
                <span>
                  {new Date(
                    a.appointment_date + "T12:00:00Z",
                  ).toLocaleDateString("de-DE", { month: "short" })}
                </span>
              </div>
              <div>
                <span className="muted">
                  {dateLabel(a.appointment_date)} · {a.start_time.slice(0, 5)}{" "}
                  Uhr
                </span>
                <h3>
                  {data.facilities.find((f) => f.id === a.facility_id)?.name}
                </h3>
                <p>
                  {visitArea(data, a)} ·{" "}
                  {
                    data.appointment_customers.filter(
                      (m) => m.appointment_id === a.id,
                    ).length
                  }{" "}
                  Kunden
                </p>
                {a.selected_customer_id && (
                  <p>{scheduledCustomerLabel(data, a)}</p>
                )}
              </div>
              <Status status={a.status} />
            </button>
          ))}
          {!visits.length && (
            <Empty
              title="Keine Besuche in diesem Zeitraum"
              action={
                isOwner || can("edit_schedule") ? (
                  <Button onClick={plan}>Besuch planen</Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <div className={`calendar-grid ${view === "Woche" ? "week-grid" : ""}`}>
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
            <div className="weekday" key={d}>
              {d}
            </div>
          ))}
          {days.map((day) => (
            <div
              key={day}
              className={`calendar-cell ${day === today() ? "is-today" : ""} ${day.slice(0, 7) !== anchor.slice(0, 7) && view === "Monat" ? "outside" : ""}`}
            >
              <span className="day-number">{Number(day.slice(8))}</span>
              {data.appointments
                .filter((a) => a.appointment_date === day)
                .map((a) => (
                  <button
                    key={a.id}
                    className={`calendar-event ${a.status === "Abgesagt" ? "cancelled" : ""}`}
                    onClick={() => navigate("visit/" + a.id)}
                  >
                    <strong>{a.start_time.slice(0, 5)}</strong>
                    <span>
                      {
                        data.facilities.find((f) => f.id === a.facility_id)
                          ?.name
                      }
                    </span>
                    <small>{visitArea(data, a)}</small>
                    {a.selected_customer_id && (
                      <small>{scheduledCustomerLabel(data, a)}</small>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
