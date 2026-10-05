import { useStore } from "./store";
import { Button } from "./ui";
import { today, fullName } from "./domain";
export function Workday({ navigate }: { navigate: (p: string) => void }) {
  const { data, actorId, rpc, run } = useStore();
  const running = data.treatments.find(
    (t) => !t.end_time && (t.performed_by || t.user_id) === actorId,
  );
  const visits = data.appointments
    .filter(
      (a) =>
        a.appointment_date === today() &&
        !["Abgeschlossen", "Abgesagt"].includes(a.status),
    )
    .sort(
      (a, b) =>
        a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id),
    );
  const visit = visits[0],
    member =
      visit &&
      data.appointment_customers
        .filter((m) => m.appointment_id === visit.id && m.status === "Offen")
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
        )[0],
    customer = data.customers.find(
      (c) => c.id === (running?.customer_id || member?.customer_id),
    );
  return (
    <section className="panel workday">
      <h2>Mein Arbeitstag</h2>
      {running ? (
        <>
          <p>
            In Behandlung:{" "}
            <strong>{customer ? fullName(customer) : "Kunde"}</strong>
          </p>
          <Button onClick={() => navigate("treatment/" + running.id)}>
            Laufende Behandlung öffnen
          </Button>
        </>
      ) : visit ? (
        <>
          <p>
            {data.facilities.find((f) => f.id === visit.facility_id)?.name} ·{" "}
            {visit.start_time.slice(0, 5)} Uhr
          </p>
          {member ? (
            <>
              <p>
                Als Nächstes:{" "}
                <strong>{customer ? fullName(customer) : "Kunde"}</strong>
                {customer?.room_number
                  ? " · Zimmer " + customer.room_number
                  : ""}
              </p>
              <Button
                onClick={async () => {
                  const id = await run(() =>
                    rpc("start_treatment", { p_member: member.id }),
                  );
                  if (id) navigate("treatment/" + id);
                }}
              >
                Nächsten Kunden starten
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate("visit/" + visit.id)}>
              Besuch prüfen und abschließen
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => navigate("visit/" + visit.id)}
          >
            Reihenfolge und Kundenliste öffnen
          </Button>
        </>
      ) : (
        <p>
          Heute ist kein offener Besuch zugewiesen. Im Kalender findest du die
          nächsten Termine.
        </p>
      )}
      <p className="muted">
        Die Reihenfolge entspricht der Besuchsliste. Bei Bedarf kannst du dort
        einen anderen Kunden starten.
      </p>
    </section>
  );
}
