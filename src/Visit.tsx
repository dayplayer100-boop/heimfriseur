import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Clock,
  Users,
  FileDown,
  Printer,
  Plus,
  MoreHorizontal,
  SkipForward,
} from "lucide-react";
import { useStore } from "./store";
import {
  Title,
  Button,
  Status,
  Meta,
  Modal,
  Field,
  Input,
  formObject,
  Empty,
} from "./ui";
import {
  today,
  dateLabel,
  euro,
  minutes,
  fullName,
  visitStats,
  customerDefaults,
} from "./domain";

import { FormulaFields, formulaFields } from "./Forms";
import type { Edit } from "./Records";
export function Visit({
  id,
  navigate,
  edit,
}: {
  id: string;
  navigate: (p: string) => void;
  edit: Edit;
}) {
  const { data, rpc, run, setNotify } = useStore();
  const [dialog, setDialog] = useState(""),
    [member, setMember] = useState(""),
    [reason, setReason] = useState("Nicht anwesend");
  const a = data.appointments.find((a) => a.id === id);
  if (!a) return <Empty title="Besuch nicht gefunden" />;
  const s = visitStats(data, a),
    f = data.facilities.find((f) => f.id === a.facility_id),
    g = data.groups.find((g) => g.id === a.group_id);
  const ranking = ["In Behandlung", "Offen", "Erledigt", "Nicht durchgeführt"];
  const members = [...s.members].sort(
    (a, b) =>
      ranking.indexOf(a.status) - ranking.indexOf(b.status) ||
      a.sort_order - b.sort_order,
  );
  const editable = !["Abgeschlossen", "Abgesagt"].includes(a.status);
  return (
    <>
      <button className="text-button back" onClick={() => navigate("calendar")}>
        <ArrowLeft size={17} />
        Kalender
      </button>
      <Title
        eyebrow="DEIN BESUCH"
        title={f?.name || "Besuch"}
        description={`${g?.name} · ${dateLabel(a.appointment_date)} · ${a.start_time.slice(0, 5)} Uhr`}
        action={
          <div className="button-group">
            <Status status={a.status} />
            <button
              aria-label="Besuchsaktionen"
              className="icon-button"
              onClick={() => setDialog("actions")}
            >
              <MoreHorizontal />
            </button>
          </div>
        }
      />
      <section className="visit-overview">
        <div>
          <span className="eyebrow">FORTSCHRITT</span>
          <h2>
            {s.done} <span>von {s.members.length} erledigt</span>
          </h2>
          <div className="progress">
            <span
              style={{
                width: `${s.members.length ? ((s.done + s.skipped) / s.members.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {s.skipped > 0 ? `${s.skipped} nicht durchgeführt · ` : ""}
            {s.open} offen
          </small>
        </div>
        <div>
          <small>Aktueller Umsatz</small>
          <strong>{euro(s.revenue)}</strong>
        </div>
        <div>
          <small>Geplanter Umsatz</small>
          <strong>{euro(s.planned)}</strong>
        </div>
        <div>
          <small>Geschätzte Restzeit</small>
          <strong>{minutes(s.remaining)}</strong>
        </div>
      </section>
      <div className="section-heading next-heading">
        <h2>
          Kundenliste <span className="count">{members.length}</span>
        </h2>
        {editable && (
          <Button variant="secondary" onClick={() => setDialog("add")}>
            <Plus size={18} />
            Kunde
          </Button>
        )}
      </div>
      <div className="visit-customer-list">
        {members.map((m) => {
          const c = data.customers.find((c) => c.id === m.customer_id);
          if (!c) return null;
          const defaults = customerDefaults(data, c.id),
            t = data.treatments.find((t) => t.appointment_customer_id === m.id),
            ts = t
              ? data.treatment_services.filter((x) => x.treatment_id === t.id)
              : [];
          return (
            <article
              className={`visit-customer ${m.status === "In Behandlung" ? "in-treatment" : ""} ${m.status === "Erledigt" ? "is-done" : ""}`}
              key={m.id}
            >
              <span className="avatar">
                {m.status === "Erledigt" ? (
                  <CheckCircle2 size={22} />
                ) : (
                  c.first_name[0] + c.last_name[0]
                )}
              </span>
              <div className="visit-customer-info">
                <button
                  className="name-link"
                  onClick={() => navigate("customer/" + c.id)}
                >
                  {fullName(c)}
                </button>
                <span className="muted">Zimmer {c.room_number || "–"}</span>
                <p>
                  {t
                    ? ts.map((s) => s.service_name_snapshot).join(" + ") ||
                      "Keine Leistungen"
                    : defaults.map((s) => s.name).join(" + ") ||
                      "Leistungen bei Behandlung wählen"}
                </p>
                <div className="visit-customer-meta">
                  <span>
                    <Clock size={14} />
                    {t?.end_time
                      ? minutes(Number(t.duration_minutes))
                      : "ca. " +
                        minutes(
                          defaults.reduce((n, s) => n + s.duration_minutes, 0),
                        )}
                  </span>
                  <strong>
                    {euro(
                      t?.total_price ??
                        defaults.reduce((n, s) => n + Number(s.price), 0),
                    )}
                  </strong>
                  {m.non_completion_reason && (
                    <span>{m.non_completion_reason}</span>
                  )}
                </div>
              </div>
              <div className="customer-actions">
                <Status status={m.status} />
                {m.status === "Offen" && editable && (
                  <div className="button-group">
                    <Button
                      onClick={async () => {
                        const treatment = await run(() =>
                          rpc("start_treatment", { p_member: m.id }),
                        );
                        if (treatment) navigate("treatment/" + treatment);
                      }}
                    >
                      <Play size={16} />
                      Start
                    </Button>
                    <button
                      className="icon-button"
                      aria-label={`${fullName(c)} nicht durchgeführt`}
                      onClick={() => {
                        setMember(m.id);
                        setDialog("skip");
                      }}
                    >
                      <SkipForward size={20} />
                    </button>
                  </div>
                )}
                {m.status === "In Behandlung" && t && (
                  <Button onClick={() => navigate("treatment/" + t.id)}>
                    Fortsetzen
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {!members.length && (
          <Empty
            title="Noch keine Kunden im Besuch"
            text="Füge einen Kunden aus diesem Wohnbereich hinzu."
            action={
              editable ? (
                <Button onClick={() => setDialog("add")}>
                  Kunde hinzufügen
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
      <div className="visit-bottom">
        {a.status === "Abgeschlossen" ? (
          <>
            <Button
              onClick={() =>
                void run(async () =>
                  (await import("./pdf")).createReport(data, a),
                )
              }
            >
              <FileDown size={18} />
              PDF herunterladen
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () =>
                  (await import("./pdf")).createReport(data, a, true),
                )
              }
            >
              <Printer size={18} />
              Drucken
            </Button>
          </>
        ) : editable ? (
          <Button onClick={() => setDialog("close")}>
            <CheckCircle2 size={18} />
            Besuch abschließen
          </Button>
        ) : null}
      </div>
      {dialog === "skip" && (
        <Modal title="Nicht durchgeführt" onClose={() => setDialog("")}>
          <p>Warum kann die Behandlung heute nicht stattfinden?</p>
          <Field label="Grund">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {[
                "Möchte heute nicht",
                "Nicht anwesend",
                "Krankenhaus",
                "Verschoben",
                "Nächstes Mal",
                "Sonstiges",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Button
            onClick={async () => {
              const ok = await run(async () => {
                await rpc("skip_customer", {
                  p_member: member,
                  p_reason: reason,
                });
                return true;
              });
              if (ok) {
                setNotify("Als nicht durchgeführt markiert");
                setDialog("");
              }
            }}
          >
            Speichern
          </Button>
        </Modal>
      )}
      {dialog === "add" && (
        <Modal
          title="Kunde zum Besuch hinzufügen"
          onClose={() => setDialog("")}
        >
          <div className="add-customer-list">
            {data.customers
              .filter(
                (c) =>
                  c.group_id === a.group_id &&
                  !members.some((m) => m.customer_id === c.id),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className="list-row"
                  onClick={async () => {
                    const ok = await run(async () => {
                      await rpc("add_visit_customer", {
                        p_appointment: id,
                        p_customer: c.id,
                      });
                      return true;
                    });
                    if (ok) setDialog("");
                  }}
                >
                  <span>
                    {fullName(c)} · Zi. {c.room_number}
                  </span>
                  <Plus size={18} />
                </button>
              ))}
          </div>
          <Button
            onClick={() => {
              setDialog("");
              edit("customers", undefined, {
                facility_id: a.facility_id,
                group_id: a.group_id,
                appointment_id: id,
              });
            }}
          >
            <Plus size={18} />
            Neuen Kunden anlegen
          </Button>
        </Modal>
      )}
      {dialog === "close" && (
        <Modal title="Besuch abschließen" onClose={() => setDialog("")}>
          <dl className="summary">
            <dt>Geplante Kunden</dt>
            <dd>{members.length}</dd>
            <dt>Erledigt</dt>
            <dd>{s.done}</dd>
            <dt>Nicht durchgeführt</dt>
            <dd>{s.skipped}</dd>
            <dt>Beginn</dt>
            <dd>
              {a.actual_start_time
                ? new Date(a.actual_start_time).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Berlin",
                  })
                : "–"}
            </dd>
            <dt>Ende</dt>
            <dd>
              {new Date().toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Berlin",
              })}
            </dd>
            <dt>Besuchsdauer</dt>
            <dd>{minutes(s.work)}</dd>
            <dt>Behandlungszeit</dt>
            <dd>{minutes(s.treatment)}</dd>
            <dt>Umsatz</dt>
            <dd>{euro(s.revenue)}</dd>
            <dt>Materialkosten</dt>
            <dd>{euro(s.material)}</dd>
            <dt>Umsatz nach Material</dt>
            <dd>
              <strong>{euro(s.revenue - s.material)}</strong>
            </dd>
          </dl>
          {s.open > 0 ? (
            <p className="warning">
              {s.open} Kunden sind noch offen. Bitte zuerst erledigen oder als
              nicht durchgeführt markieren.
            </p>
          ) : (
            <p className="muted">
              {a.recurrence_weeks
                ? `Der nächste Besuch in ${a.recurrence_weeks} Wochen wird automatisch angelegt.`
                : "Dieser Besuch ist einmalig."}
            </p>
          )}
          <Button
            disabled={s.open > 0}
            onClick={async () => {
              const ok = await run(async () => {
                await rpc("close_visit", { p_appointment: id });
                return true;
              });
              if (ok) {
                setNotify("Besuch abgeschlossen");
                setDialog("");
              }
            }}
          >
            Besuch endgültig abschließen
          </Button>
        </Modal>
      )}
      {dialog === "actions" && (
        <Modal title="Besuchsaktionen" onClose={() => setDialog("")}>
          <div className="stack">
            {["Geplant", "Verschoben"].includes(a.status) && (
              <>
                <Button variant="secondary" onClick={() => setDialog("move")}>
                  Termin verschieben
                </Button>
                <Button variant="secondary" onClick={() => setDialog("cancel")}>
                  Besuch absagen
                </Button>
              </>
            )}
            {!data.treatments.some((t) => t.appointment_id === id) && (
              <Button variant="danger-text" onClick={() => setDialog("delete")}>
                Termin löschen
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDialog("")}>
              Zurück
            </Button>
          </div>
        </Modal>
      )}
      {dialog === "move" && (
        <Modal title="Termin verschieben" onClose={() => setDialog("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = formObject(e);
              const ok = await run(async () => {
                await rpc("move_visit", {
                  p_appointment: id,
                  p_date: form.date,
                  p_time: form.time,
                  p_future: form.scope === "future",
                });
                return true;
              });
              if (ok) {
                setDialog("");
                setNotify("Termin verschoben");
              }
            }}
          >
            <Input
              label="Neues Datum"
              name="date"
              type="date"
              value={a.appointment_date}
              required
            />
            <Input
              label="Startzeit"
              name="time"
              type="time"
              value={a.start_time}
              required
            />
            <Field label="Was möchtest du ändern?">
              <select name="scope">
                <option value="single">Nur diesen Termin</option>
                {a.recurrence_series_id && (
                  <option value="future">Diesen und zukünftige Termine</option>
                )}
              </select>
            </Field>
            <p className="muted">
              Vergangene oder begonnene Besuche bleiben unverändert.
            </p>
            <Button type="submit">Verschieben</Button>
          </form>
        </Modal>
      )}
      {["delete", "cancel"].includes(dialog) && (
        <Modal
          title={dialog === "delete" ? "Termin löschen?" : "Besuch absagen?"}
          onClose={() => setDialog("")}
        >
          <p>
            {dialog === "delete"
              ? "Der Termin und seine offene Kundenliste werden gelöscht."
              : "Der Termin bleibt als abgesagt im Kalender erhalten."}
          </p>
          <Button
            variant="danger"
            onClick={async () => {
              const deleting = dialog === "delete";
              const ok = await run(async () => {
                await rpc("cancel_visit", {
                  p_appointment: id,
                  p_delete: deleting,
                });
                return true;
              });
              if (ok) {
                setDialog("");
                if (deleting) navigate("calendar");
              }
            }}
          >
            {dialog === "delete" ? "Endgültig löschen" : "Besuch absagen"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function TreatmentView({
  id,
  navigate,
}: {
  id: string;
  navigate: (p: string) => void;
}) {
  const { data, rpc, run, setNotify, setError } = useStore();
  const t = data.treatments.find((t) => t.id === id)!;
  const snapshots = data.treatment_services.filter(
    (s) => s.treatment_id === id,
  );
  const [selected, setSelected] = useState(snapshots.map((s) => s.service_id)),
    [price, setPrice] = useState(
      t?.price_override != null ? String(t.price_override) : "",
    ),
    [material, setMaterial] = useState(String(t?.material_cost || 0)),
    [notes, setNotes] = useState(t?.notes || ""),
    [formula, setFormula] = useState<Record<string, any> | null>(() => {
      const f = data.color_formulas.find((f) => f.treatment_id === id);
      return f
        ? Object.fromEntries([
            ...formulaFields.map(([key]) => [key, f[key]]),
            ["notes", f.notes],
          ])
        : null;
    }),
    [tick, setTick] = useState(Date.now()),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  if (!t) return <Empty title="Behandlung nicht gefunden" />;
  const c = data.customers.find((c) => c.id === t.customer_id)!;
  const a = data.appointments.find((a) => a.id === t.appointment_id)!;
  const services = data.services.filter(
    (s) => s.is_active || selected.includes(s.id),
  );
  const total = selected.reduce(
    (n, id) =>
      n +
      Number(
        snapshots.find((s) => s.service_id === id)?.price_snapshot ??
          data.services.find((s) => s.id === id)?.price ??
          0,
      ),
    0,
  );
  const elapsed = Math.max(
    0,
    Math.floor(
      ((t.end_time ? new Date(t.end_time).getTime() : tick) -
        new Date(t.start_time).getTime()) /
        1000,
    ),
  );
  const timer = [
    Math.floor(elapsed / 3600),
    Math.floor(elapsed / 60) % 60,
    elapsed % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const color = selected.some((id) =>
    /farbe/i.test(data.services.find((s) => s.id === id)?.name || ""),
  );
  const lastFormula = data.color_formulas
    .filter((f) => f.customer_id === c.id && f.treatment_id !== id)
    .sort((a, b) =>
      (b.formula_date + (b.created_at || "")).localeCompare(
        a.formula_date + (a.created_at || ""),
      ),
    )[0];
  async function save(finish: boolean) {
    const m = Number(material.replace(",", ".")),
      p = price === "" ? null : Number(price.replace(",", "."));
    if (
      !Number.isFinite(m) ||
      m < 0 ||
      (p !== null && (!Number.isFinite(p) || p < 0))
    ) {
      setError("Bitte gültige, nicht negative Beträge eingeben.");
      return false;
    }
    const ok = await run(async () => {
      await rpc("save_treatment", {
        p_treatment: id,
        p_services: selected,
        p_price: p,
        p_material: m,
        p_notes: notes,
        p_formula: color ? formula : null,
        p_finish: finish,
      });
      return true;
    });
    if (ok) {
      setDirty(false);
      if (finish) {
        setNotify(
          `${fullName(c)} abgeschlossen · ${euro(p ?? total)} · ${minutes(elapsed / 60)}`,
        );
        navigate("visit/" + a.id);
      } else setNotify("Zwischenstand gespeichert");
    }
    return Boolean(ok);
  }
  if (t.end_time)
    return (
      <>
        <Empty
          title="Behandlung ist abgeschlossen"
          action={
            <Button onClick={() => navigate("visit/" + a.id)}>
              Zur Kundenliste
            </Button>
          }
        />
      </>
    );
  return (
    <>
      <button
        className="text-button back"
        onClick={async () => {
          if (!dirty || (await save(false))) navigate("visit/" + a.id);
        }}
      >
        <ArrowLeft size={17} />
        Zur Kundenliste
      </button>
      <Title
        eyebrow="IN BEHANDLUNG"
        title={fullName(c)}
        description={`Zimmer ${c.room_number || "–"} · ${data.facilities.find((f) => f.id === a.facility_id)?.name}`}
      />
      <div className="treatment-layout">
        <div>
          <section className="timer-panel">
            <span>
              <span className="live-dot" />
              Behandlungszeit läuft
            </span>
            <div className="timer" role="timer">
              {timer}
            </div>
            <p>
              Gestartet um{" "}
              {new Date(t.start_time).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Berlin",
              })}{" "}
              Uhr
            </p>
            <Button onClick={() => void save(true)}>
              <CheckCircle2 size={18} />
              Behandlung beenden
            </Button>
          </section>
          <section className="panel">
            <h2>Leistungen</h2>
            <p className="muted">Die Standardleistungen sind vorausgewählt.</p>
            {services.map((s) => (
              <label
                className={`service-select ${selected.includes(s.id) ? "selected" : ""}`}
                key={s.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, s.id]
                        : selected.filter((id) => id !== s.id),
                    );
                    setDirty(true);
                  }}
                />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.duration_minutes} Min.</small>
                </span>
                <strong>
                  {euro(
                    snapshots.find((x) => x.service_id === s.id)
                      ?.price_snapshot ?? s.price,
                  )}
                </strong>
              </label>
            ))}
          </section>
          {color && (
            <section className="panel">
              <div className="section-heading">
                <h2>Farbrezeptur</h2>
              </div>
              {lastFormula && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormula(
                      Object.fromEntries([
                        ...formulaFields.map(([key]) => [
                          key,
                          lastFormula[key],
                        ]),
                        ["notes", lastFormula.notes],
                      ]),
                    );
                    setDirty(true);
                  }}
                >
                  Letzte Farbrezeptur übernehmen
                </Button>
              )}
              {formula ? (
                <FormulaFields
                  value={formula}
                  onChange={(v) => {
                    setFormula(v);
                    setDirty(true);
                  }}
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormula({});
                    setDirty(true);
                  }}
                >
                  Rezeptur hinzufügen
                </Button>
              )}
            </section>
          )}
        </div>
        <aside className="panel treatment-costs">
          <h2>Preis & Material</h2>
          <div className="calculated-price">
            <span>Berechneter Preis</span>
            <strong>{euro(total)}</strong>
          </div>
          <Input
            label="Manueller Endpreis (€)"
            inputMode="decimal"
            value={price}
            onChange={(v) => {
              setPrice(v);
              setDirty(true);
            }}
          />
          <p className="muted">
            Leer lassen, um den berechneten Preis zu übernehmen.
          </p>
          <Input
            label="Materialkosten (€)"
            inputMode="decimal"
            value={material}
            onChange={(v) => {
              setMaterial(v);
              setDirty(true);
            }}
          />
          <Field label="Behandlungsnotizen">
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              rows={3}
            />
          </Field>
          <div className="total-row">
            <span>Endpreis</span>
            <strong>
              {euro(price === "" ? total : Number(price.replace(",", ".")))}
            </strong>
          </div>
          <Button variant="secondary" onClick={() => void save(false)}>
            Zwischenstand speichern
          </Button>
          <p className="muted">
            Der Timer läuft nach einem Neuladen weiter. Ungespeicherte Eingaben
            werden dabei nicht übernommen.
          </p>
        </aside>
      </div>
    </>
  );
}
