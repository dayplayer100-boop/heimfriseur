import { FacilityTools } from "./FacilityTools";
import { BillingEditor } from "./Payments";
import { useState } from "react";
import {
  Building2,
  Users,
  MapPin,
  Phone,
  ArrowLeft,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { useStore } from "./store";
import {
  Button,
  Title,
  Empty,
  SearchBox,
  PlusButton,
  Meta,
  Status,
  Modal,
  Field,
} from "./ui";
import {
  euro,
  fullName,
  customerDefaults,
  minutes,
  dateLabel,
  today,
} from "./domain";
import { FormulaFields, formulaFields } from "./Forms";
import { VisitCard } from "./Dashboard";
import type { Table, Row, Customer } from "./types";
export type Edit = (
  table: Table,
  row?: Row,
  preset?: Record<string, string>,
) => void;
export function Facilities({
  navigate,
  edit,
}: {
  navigate: (p: string) => void;
  edit: Edit;
}) {
  const { data, isOwner } = useStore();
  const [q, setQ] = useState("");
  return (
    <>
      <Title
        eyebrow="DEINE ANLAUFSTELLEN"
        title="Einrichtungen"
        description="Alle Häuser und Wohnbereiche an einem Ort."
        action={
          isOwner && (
            <PlusButton onClick={() => edit("facilities")}>
              Einrichtung
            </PlusButton>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Einrichtung oder Ort suchen …"
        />
        <span className="muted">{data.facilities.length} Einrichtungen</span>
      </div>
      <div className="card-grid">
        {data.facilities
          .filter((f) =>
            (f.name + " " + f.city).toLowerCase().includes(q.toLowerCase()),
          )
          .map((f) => {
            const next = data.appointments
              .filter(
                (a) =>
                  a.facility_id === f.id &&
                  a.appointment_date >= today() &&
                  ["Geplant", "Verschoben"].includes(a.status),
              )
              .sort((a, b) =>
                a.appointment_date.localeCompare(b.appointment_date),
              )[0];
            return (
              <button
                className="facility-card"
                key={f.id}
                onClick={() => navigate("facility/" + f.id)}
              >
                <div className="facility-card-head">
                  <span className="round-icon">
                    <Building2 />
                  </span>
                  <ArrowUpRight size={19} />
                </div>
                <h3>{f.name}</h3>
                <p>
                  <MapPin size={16} />
                  {[f.street, f.house_number].filter(Boolean).join(" ")}
                  {f.city && (
                    <>
                      <br />
                      {f.postal_code} {f.city}
                    </>
                  )}
                </p>
                <div className="facility-stats">
                  <span>
                    <Users size={16} />
                    {
                      data.customers.filter(
                        (c) => c.facility_id === f.id && c.status === "Aktiv",
                      ).length
                    }{" "}
                    aktive Kunden
                  </span>
                  <span>
                    {data.groups.filter((g) => g.facility_id === f.id).length}{" "}
                    Gruppen
                  </span>
                </div>
                <div className="facility-next">
                  <span>Nächster Besuch</span>
                  <strong>
                    {next
                      ? dateLabel(next.appointment_date)
                      : "Noch nicht geplant"}
                  </strong>
                </div>
              </button>
            );
          })}
      </div>
      {!data.facilities.length && (
        <Empty
          title="Noch keine Einrichtungen"
          text="Lege deine erste Einrichtung an."
          action={
            isOwner && (
              <Button onClick={() => edit("facilities")}>
                Einrichtung erstellen
              </Button>
            )
          }
        />
      )}
    </>
  );
}
export function FacilityDetail({
  id,
  navigate,
  edit,
  plan,
  confirmDelete,
}: {
  id: string;
  navigate: (p: string) => void;
  edit: Edit;
  plan: (group?: string, facility?: string) => void;
  confirmDelete: (table: Table, row: Row) => void;
}) {
  const { data, isOwner, can } = useStore();
  const [tab, setTab] = useState("Übersicht");
  const f = data.facilities.find((f) => f.id === id);
  if (!f) return <Empty title="Einrichtung nicht gefunden" />;
  const groups = data.groups.filter((g) => g.facility_id === id),
    customers = data.customers.filter((c) => c.facility_id === id),
    visits = data.appointments
      .filter((a) => a.facility_id === id)
      .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
  return (
    <>
      <button
        className="text-button back"
        onClick={() => navigate("facilities")}
      >
        <ArrowLeft size={17} />
        Einrichtungen
      </button>
      <Title
        eyebrow="EINRICHTUNG"
        title={f.name}
        description={`${f.street} ${f.house_number} · ${f.postal_code} ${f.city}`}
        action={
          <div className="button-group">
            {isOwner && (
              <Button variant="secondary" onClick={() => edit("facilities", f)}>
                Bearbeiten
              </Button>
            )}
            {(isOwner || can("edit_schedule")) && (
              <Button onClick={() => plan(undefined, id)}>Besuch planen</Button>
            )}
          </div>
        }
      />
      <div className="tabs">
        {[
          "Übersicht",
          "Gruppen",
          "Kunden",
          "Besuche",
          ...(isOwner ? ["Preise & Runden"] : []),
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Preise & Runden" && isOwner && (
        <FacilityTools facilityId={id} />
      )}
      {tab === "Übersicht" && (
        <div className="detail-columns">
          <section className="panel">
            <h2>Kontakt & Informationen</h2>
            <dl>
              <dt>Telefon</dt>
              <dd>
                {f.phone ? (
                  <a href={"tel:" + f.phone}>
                    <Phone size={16} />
                    {f.phone}
                  </a>
                ) : (
                  "Nicht hinterlegt"
                )}
              </dd>
              <dt>E-Mail</dt>
              <dd>
                {f.email ? (
                  <a href={"mailto:" + f.email}>{f.email}</a>
                ) : (
                  "Nicht hinterlegt"
                )}
              </dd>
              <dt>Ansprechpartner</dt>
              <dd>{f.contact_name || "Nicht hinterlegt"}</dd>
              <dt>Telefon Ansprechpartner</dt>
              <dd>{f.contact_phone || "Nicht hinterlegt"}</dd>
            </dl>
            {f.notes && (
              <div className="note">
                <strong>Notizen</strong>
                <p>{f.notes}</p>
              </div>
            )}
            {isOwner && (
              <Button
                variant="danger-text"
                onClick={() => confirmDelete("facilities", f)}
              >
                Einrichtung löschen
              </Button>
            )}
          </section>
          <section className="panel">
            <h2>Wohnbereiche</h2>
            {groups.map((g) => (
              <button
                className="list-row"
                key={g.id}
                onClick={() => navigate("group/" + g.id)}
              >
                <div>
                  <strong>{g.name}</strong>
                  <span>
                    {
                      data.customers.filter(
                        (c) => c.group_id === g.id && c.status === "Aktiv",
                      ).length
                    }{" "}
                    aktive Kunden · alle {g.recurrence_weeks} Wochen
                  </span>
                </div>
                <ArrowUpRight size={18} />
              </button>
            ))}
            {isOwner && (
              <PlusButton
                onClick={() => edit("groups", undefined, { facility_id: id })}
              >
                Wohnbereich
              </PlusButton>
            )}
          </section>
        </div>
      )}
      {tab === "Gruppen" && (
        <>
          <div className="section-heading">
            <h2>{groups.length} Wohnbereiche</h2>
            {isOwner && (
              <PlusButton
                onClick={() => edit("groups", undefined, { facility_id: id })}
              >
                Wohnbereich
              </PlusButton>
            )}
          </div>
          <div className="card-grid">
            {groups.map((g) => (
              <button
                className="panel record-card"
                key={g.id}
                onClick={() => navigate("group/" + g.id)}
              >
                <h3>{g.name}</h3>
                <p>
                  {
                    data.customers.filter(
                      (c) => c.group_id === g.id && c.status === "Aktiv",
                    ).length
                  }{" "}
                  aktive Kunden
                </p>
                <Meta type="calendar">Alle {g.recurrence_weeks} Wochen</Meta>
              </button>
            ))}
          </div>
          {!groups.length && (
            <Empty
              title="Noch keine Wohnbereiche"
              text="Fasse die Kunden deiner Einrichtung in Wohnbereichen zusammen."
            />
          )}
        </>
      )}
      {tab === "Gruppen" && isOwner && (
        <FacilityTools facilityId={id} groupsOnly />
      )}
      {tab === "Kunden" && (
        <>
          <div className="section-heading">
            <h2>{customers.length} Kunden</h2>
            {(isOwner || can("add_customers")) && (
              <PlusButton
                onClick={() =>
                  edit("customers", undefined, {
                    facility_id: id,
                    group_id: groups[0]?.id || "",
                  })
                }
              >
                Kunde
              </PlusButton>
            )}
          </div>
          <CustomerList customers={customers} navigate={navigate} />
        </>
      )}
      {tab === "Besuche" && (
        <div className="card-grid">
          {visits.map((a) => (
            <VisitCard
              key={a.id}
              appointment={a}
              onOpen={() => navigate("visit/" + a.id)}
            />
          ))}
          {!visits.length && (
            <Empty
              title="Noch keine Besuche"
              action={
                <Button onClick={() => plan(undefined, id)}>
                  Besuch planen
                </Button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
export function GroupDetail({
  id,
  navigate,
  edit,
  plan,
  confirmDelete,
}: {
  id: string;
  navigate: (p: string) => void;
  edit: Edit;
  plan: (id?: string) => void;
  confirmDelete: (table: Table, row: Row) => void;
}) {
  const { data, isOwner, can } = useStore();
  const g = data.groups.find((g) => g.id === id);
  if (!g)
    return (
      <Empty
        title="Gruppe nicht verfügbar"
        text="Wähle eine vorhandene Gruppe in der Einrichtung oder lege dort eine neue an."
        action={
          <Button onClick={() => navigate("facilities")}>
            Einrichtungen öffnen
          </Button>
        }
      />
    );
  const visits = data.appointments.filter((a) => a.group_id === id),
    last = visits
      .filter((a) => a.status === "Abgeschlossen")
      .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))[0],
    next = visits
      .filter(
        (a) =>
          a.appointment_date >= today() &&
          ["Geplant", "Verschoben"].includes(a.status),
      )
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))[0];
  return (
    <>
      <button
        className="text-button back"
        onClick={() => navigate("facility/" + g.facility_id)}
      >
        <ArrowLeft size={17} />
        {data.facilities.find((f) => f.id === g.facility_id)?.name}
      </button>
      <Title
        title={g.name}
        eyebrow="WOHNBEREICH"
        action={
          <div className="button-group">
            {isOwner && (
              <Button variant="secondary" onClick={() => edit("groups", g)}>
                Bearbeiten
              </Button>
            )}
            {(isOwner || can("edit_schedule")) && (
              <Button onClick={() => plan(id)}>Besuch planen</Button>
            )}
          </div>
        }
      />
      <section className="panel">
        <div className="group-summary">
          <div>
            <small>Rhythmus</small>
            <strong>Alle {g.recurrence_weeks} Wochen</strong>
          </div>
          <div>
            <small>Bevorzugter Tag</small>
            <strong>
              {
                [
                  "Sonntag",
                  "Montag",
                  "Dienstag",
                  "Mittwoch",
                  "Donnerstag",
                  "Freitag",
                  "Samstag",
                ][g.preferred_weekday]
              }
            </strong>
          </div>
          <div>
            <small>Startzeit</small>
            <strong>{g.preferred_start_time.slice(0, 5)} Uhr</strong>
          </div>
          <div>
            <small>Letzter Besuch</small>
            <strong>{last ? dateLabel(last.appointment_date) : "–"}</strong>
          </div>
          <div>
            <small>Nächster Besuch</small>
            <strong>{next ? dateLabel(next.appointment_date) : "–"}</strong>
          </div>
        </div>
        {g.notes && <p>{g.notes}</p>}
      </section>
      <div className="section-heading next-heading">
        <h2>Kunden im Wohnbereich</h2>
        {(isOwner || can("add_customers")) && (
          <PlusButton
            onClick={() =>
              edit("customers", undefined, {
                facility_id: g.facility_id,
                group_id: id,
              })
            }
          >
            Kunde
          </PlusButton>
        )}
      </div>
      <CustomerList
        customers={data.customers.filter((c) => c.group_id === id)}
        navigate={navigate}
      />
      {isOwner && (
        <>
          <FacilityTools facilityId={g.facility_id} groupId={g.id} groupsOnly />
          <Button
            variant="danger-text"
            onClick={() => confirmDelete("groups", g)}
          >
            Wohnbereich löschen
          </Button>
        </>
      )}
    </>
  );
}
export function CustomerList({
  customers,
  navigate,
}: {
  customers: Customer[];
  navigate: (p: string) => void;
}) {
  const { data } = useStore();
  return customers.length ? (
    <div className="customer-list">
      {customers
        .sort((a, b) => a.last_name.localeCompare(b.last_name, "de"))
        .map((c) => (
          <button
            key={c.id}
            className="customer-row"
            onClick={() => navigate("customer/" + c.id)}
          >
            <span className="avatar">
              {c.first_name[0]}
              {c.last_name[0]}
            </span>
            <div className="customer-main">
              <strong>{fullName(c)}</strong>
              <span>
                {data.facilities.find((f) => f.id === c.facility_id)?.name} ·{" "}
                {data.groups.find((g) => g.id === c.group_id)?.name}
              </span>
            </div>
            <span className="room">
              {c.room_number ? "Zi. " + c.room_number : "–"}
            </span>
            <span
              className={`customer-status ${c.status === "Aktiv" ? "active" : ""}`}
            >
              {c.status}
            </span>
            <ArrowUpRight size={18} />
          </button>
        ))}
    </div>
  ) : (
    <Empty
      title="Keine Kunden gefunden"
      text="Lege Kunden an oder passe die Suche an."
    />
  );
}
export function Customers({
  navigate,
  edit,
}: {
  navigate: (p: string) => void;
  edit: Edit;
}) {
  const { data, isOwner, can } = useStore();
  const [q, setQ] = useState(""),
    [facility, setFacility] = useState(""),
    [group, setGroup] = useState(""),
    [status, setStatus] = useState("");
  const customers = data.customers.filter(
    (c) =>
      (fullName(c) + " " + c.room_number)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!facility || c.facility_id === facility) &&
      (!group || c.group_id === group) &&
      (!status || c.status === status),
  );
  return (
    <>
      <Title
        eyebrow="PERSÖNLICH. GUT ORGANISIERT."
        title="Kunden"
        description="Stammdaten, Leistungen und die letzte Behandlung."
        action={
          (isOwner || can("add_customers")) && (
            <PlusButton onClick={() => edit("customers")}>Kunde</PlusButton>
          )
        }
      />
      <div className="toolbar filters">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Name oder Zimmernummer suchen …"
        />
        <select
          aria-label="Einrichtung filtern"
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
          aria-label="Gruppe filtern"
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
        <select
          aria-label="Status filtern"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Alle Status</option>
          {["Aktiv", "Pausiert", "Krankenhaus", "Ausgezogen", "Inaktiv"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </div>
      <p className="muted">{customers.length} Kunden</p>
      <CustomerList customers={customers} navigate={navigate} />
    </>
  );
}
export function CustomerDetail({
  id,
  navigate,
  edit,
  confirmDelete,
}: {
  id: string;
  navigate: (p: string) => void;
  edit: Edit;
  confirmDelete: (table: Table, row: Row) => void;
}) {
  const { data, save, run, setNotify } = useStore();
  const [tab, setTab] = useState("Übersicht"),
    [formula, setFormula] = useState<Record<string, any> | null>(null);
  const c = data.customers.find((c) => c.id === id);
  if (!c) return <Empty title="Kunde nicht gefunden" />;
  const services = customerDefaults(data, id),
    history = data.treatments
      .filter((t) => t.customer_id === id && t.end_time)
      .sort((a, b) => b.start_time.localeCompare(a.start_time));
  const formulas = data.color_formulas
    .filter((f) => f.customer_id === id)
    .sort((a, b) =>
      (b.formula_date + (b.created_at || "")).localeCompare(
        a.formula_date + (a.created_at || ""),
      ),
    );
  const next = data.appointments
    .filter(
      (a) =>
        a.appointment_date >= today() &&
        ["Geplant", "Verschoben", "In Bearbeitung"].includes(a.status) &&
        data.appointment_customers.some(
          (m) => m.appointment_id === a.id && m.customer_id === id,
        ),
    )
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))[0];
  return (
    <>
      <button
        className="text-button back"
        onClick={() => navigate("customers")}
      >
        <ArrowLeft size={17} />
        Kunden
      </button>
      <Title
        eyebrow={"KUNDENPROFIL · ZIMMER " + (c.room_number || "–")}
        title={fullName(c)}
        description={data.facilities.find((f) => f.id === c.facility_id)?.name}
        action={
          <Button onClick={() => edit("customers", c)}>Bearbeiten</Button>
        }
      />
      <div className="tabs">
        {["Übersicht", "Historie", "Farbe", "Abrechnung"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Abrechnung" && <BillingEditor customerId={id} />}
      {tab === "Übersicht" && (
        <div className="detail-columns">
          <section className="panel">
            <h2>Gut zu wissen</h2>
            <dl>
              <dt>Einrichtung</dt>
              <dd>
                {data.facilities.find((f) => f.id === c.facility_id)?.name}
              </dd>
              <dt>Wohnbereich</dt>
              <dd>{data.groups.find((g) => g.id === c.group_id)?.name}</dd>
              <dt>Zimmer</dt>
              <dd>{c.room_number || "–"}</dd>
              <dt>Kundenrhythmus</dt>
              <dd>
                {c.recurrence_weeks
                  ? "Alle " + c.recurrence_weeks + " Wochen"
                  : "Von Untergruppe / Wohnbereich"}
              </dd>
              <dt>Untergruppe</dt>
              <dd>
                {data.cohorts.find((g) => g.id === c.cohort_id)?.name ||
                  "Keine"}
              </dd>
              <dt>Nächste fällige Behandlung</dt>
              <dd>
                {c.next_due_date ? dateLabel(c.next_due_date) : "Noch offen"}
              </dd>
              <dt>Friseur gewünscht</dt>
              <dd>{c.hair_request || "Unbekannt"}</dd>
              <dt>Status</dt>
              <dd>{c.status}</dd>
              <dt>Letzte Behandlung</dt>
              <dd>
                {history[0] ? dateLabel(history[0].start_time) : "Noch keine"}
              </dd>
              <dt>Nächster Termin</dt>
              <dd>
                {next ? dateLabel(next.appointment_date) : "Noch nicht geplant"}
              </dd>
            </dl>
            {c.notes && (
              <div className="note">
                <strong>Notizen</strong>
                <p>{c.notes}</p>
              </div>
            )}
            <Button
              variant="danger-text"
              onClick={() => confirmDelete("customers", c)}
            >
              {history.length ? "Auf inaktiv setzen" : "Kunde löschen"}
            </Button>
          </section>
          <section className="panel">
            <h2>Standardleistungen</h2>
            {services.map((s) => (
              <div className="list-row" key={s.id}>
                <span>{s.name}</span>
                <strong>{euro(s.price)}</strong>
              </div>
            ))}
            {!services.length && <p>Keine Standardleistungen hinterlegt.</p>}
            <div className="total-row">
              <span>Standardpreis</span>
              <strong>
                {euro(services.reduce((n, s) => n + Number(s.price), 0))}
              </strong>
            </div>
            <Meta type="clock">
              {minutes(services.reduce((n, s) => n + s.duration_minutes, 0))}{" "}
              Standarddauer
            </Meta>
            <Button variant="secondary" onClick={() => edit("customers", c)}>
              Standardleistungen bearbeiten
            </Button>
          </section>
        </div>
      )}
      {tab === "Historie" && (
        <div className="history-list">
          {history.map((t) => (
            <section className="panel" key={t.id}>
              <div className="section-heading">
                <h3>{dateLabel(t.start_time)}</h3>
                <strong>{euro(t.total_price)}</strong>
              </div>
              <p>
                {data.treatment_services
                  .filter((s) => s.treatment_id === t.id)
                  .map((s) => s.service_name_snapshot)
                  .join(" / ") || "Keine Leistungen"}
              </p>
              <div className="visit-meta">
                <Meta type="clock">{minutes(Number(t.duration_minutes))}</Meta>
                <span>Material: {euro(t.material_cost)}</span>
                <Meta type="building">
                  {
                    data.facilities.find(
                      (f) =>
                        f.id ===
                        data.appointments.find((a) => a.id === t.appointment_id)
                          ?.facility_id,
                    )?.name
                  }
                </Meta>
              </div>
            </section>
          ))}
          {!history.length && (
            <Empty
              title="Noch keine Behandlungen"
              text="Abgeschlossene Behandlungen erscheinen hier automatisch."
            />
          )}
        </div>
      )}
      {tab === "Farbe" && (
        <>
          <div className="section-heading">
            <h2>Farbrezepturen</h2>
            <PlusButton onClick={() => setFormula({})}>Rezeptur</PlusButton>
          </div>
          {formulas.map((f) => (
            <section className="panel formula-card" key={f.id}>
              <div className="section-heading">
                <h3>{f.product || "Farbrezeptur"}</h3>
                <span>{dateLabel(f.formula_date)}</span>
              </div>
              <dl>
                {formulaFields
                  .filter(([key]) => f[key] != null && f[key] !== "")
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{String(f[key])}</dd>
                    </div>
                  ))}
              </dl>
              {f.notes && <p>{f.notes}</p>}
              <Button
                variant="secondary"
                onClick={() => {
                  const v = Object.fromEntries(
                    formulaFields.map(([key]) => [key, f[key]]),
                  );
                  setFormula({ ...v, notes: f.notes });
                }}
              >
                Als neue Rezeptur übernehmen
              </Button>
            </section>
          ))}
          {!formulas.length && (
            <Empty
              title="Noch keine Farbrezepturen"
              text="Speichere eine Rezeptur hier oder während einer Behandlung."
            />
          )}
        </>
      )}
      {formula && (
        <Modal title="Neue Farbrezeptur" onClose={() => setFormula(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run(() =>
                save("color_formulas", {
                  ...formula,
                  customer_id: id,
                  formula_date: today(),
                }),
              );
              if (result) {
                setNotify("Farbrezeptur gespeichert");
                setFormula(null);
              }
            }}
          >
            <FormulaFields value={formula} onChange={setFormula} />
            <Button type="submit">Rezeptur speichern</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
