import { visitArea } from "./domain";
import { PaymentDialog } from "./Payments";
import { useAutosave } from "./useAutosave";
import { AssignmentEditor, CorrectionEditor } from "./Team";
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
import { useStore, friendly } from "./store";
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
  addWeeks,
  effectivePrice,
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
  const { data, rpc, run, setNotify, isOwner, team, actorId, can } = useStore();
  const [dialog, setDialog] = useState(() => {
      const pending = sessionStorage.getItem("heimfriseur-payment-prompt");
      return pending &&
        data.treatments.some((t) => t.id === pending && t.appointment_id === id)
        ? "payment/" + pending
        : "";
    }),
    [member, setMember] = useState(""),
    [reason, setReason] = useState("Nicht anwesend"),
    [entryType, setEntryType] = useState("Spontan"),
    [nextDate, setNextDate] = useState(
      addWeeks(
        data.appointments.find((a) => a.id === id)?.appointment_date || today(),
        data.facilities.find(
          (f) =>
            f.id === data.appointments.find((a) => a.id === id)?.facility_id,
        )?.visit_recurrence_weeks || 1,
      ),
    );
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
  const canClose =
    isOwner ||
    (can("close_visits") &&
      team?.assignments.some(
        (x) =>
          x.appointment_id === id && x.user_id === actorId && x.is_responsible,
      ));
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
        description={`${visitArea(data, a)} · ${dateLabel(a.appointment_date)} · ${a.start_time.slice(0, 5)} Uhr`}
        action={
          <div className="button-group">
            <Status status={a.status} />
            {(isOwner || can("edit_schedule")) && (
              <button
                aria-label="Besuchsaktionen"
                className="icon-button"
                onClick={() => setDialog("actions")}
              >
                <MoreHorizontal />
              </button>
            )}
          </div>
        }
      />
      <section className="panel assignment-summary">
        <div>
          <strong>Team</strong>
          <p>
            {team?.assignments
              .filter((x) => x.appointment_id === id)
              .map(
                (x) =>
                  (team.members.find((m) => m.user_id === x.user_id)
                    ?.display_name || "Geschäftsführer") +
                  (x.is_responsible ? " (verantwortlich)" : ""),
              )
              .join(" · ") || "Noch nicht zugewiesen"}
          </p>
        </div>
        {isOwner && editable && (
          <Button variant="secondary" onClick={() => setDialog("assign")}>
            Team zuweisen
          </Button>
        )}
      </section>
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
        {isOwner && (
          <>
            <div>
              <small>Aktueller Umsatz</small>
              <strong>{euro(s.revenue)}</strong>
            </div>
            <div>
              <small>Geplanter Umsatz</small>
              <strong>{euro(s.planned)}</strong>
            </div>
          </>
        )}
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
                  (c.first_name?.[0] || "?") + (c.last_name?.[0] || "")
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
                  {(isOwner ||
                    !t ||
                    (t.performed_by || t.user_id) === actorId) && (
                    <strong>
                      {euro(
                        t?.total_price ??
                          defaults.reduce((n, s) => n + Number(s.price), 0),
                      )}
                    </strong>
                  )}
                  {t && (
                    <span>
                      {team?.members.find(
                        (x) => x.user_id === (t.performed_by || t.user_id),
                      )?.display_name || "Geschäftsführer"}
                    </span>
                  )}
                  {m.entry_type && m.entry_type !== "Regulär" && (
                    <span className="entry-tag">{m.entry_type}</span>
                  )}
                  {m.followup_date && (
                    <span>Nächster Termin: {dateLabel(m.followup_date)}</span>
                  )}
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
                {m.status === "In Behandlung" &&
                  t &&
                  (t.performed_by || t.user_id) === actorId && (
                    <Button onClick={() => navigate("treatment/" + t.id)}>
                      Fortsetzen
                    </Button>
                  )}
                {m.status === "In Behandlung" &&
                  t &&
                  (t.performed_by || t.user_id) !== actorId &&
                  isOwner && (
                    <Button
                      variant="secondary"
                      onClick={() => setDialog("takeover/" + t.id)}
                    >
                      Behandlung übernehmen
                    </Button>
                  )}
                {m.status === "Erledigt" &&
                  t &&
                  can("record_payments") &&
                  (isOwner || (t.performed_by || t.user_id) === actorId) && (
                    <Button
                      variant="secondary"
                      onClick={() => setDialog("payment/" + t.id)}
                    >
                      Zahlung / Abrechnung
                    </Button>
                  )}
                {m.status === "Erledigt" && t && isOwner && (
                  <Button
                    variant="secondary"
                    onClick={() => setDialog("correct/" + t.id)}
                  >
                    Korrigieren
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
        {a.status === "Abgeschlossen" && isOwner ? (
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
        ) : editable && canClose ? (
          <Button onClick={() => setDialog("close")}>
            <CheckCircle2 size={18} />
            Besuch abschließen
          </Button>
        ) : null}
      </div>
      {dialog === "assign" && isOwner && (
        <AssignmentEditor appointmentId={id} onClose={() => setDialog("")} />
      )}
      {dialog.startsWith("correct/") && isOwner && (
        <CorrectionEditor
          treatmentId={dialog.split("/")[1]}
          onClose={() => setDialog("")}
        />
      )}
      {dialog.startsWith("takeover/") && isOwner && (
        <Modal
          title="Offene Behandlung übernehmen?"
          onClose={() => setDialog("")}
        >
          <p>
            Der bisherige Mitarbeiter kann diese Behandlung anschließend nicht
            weiter bearbeiten. Die Übernahme wird protokolliert. Prüfe vorher,
            ob die Behandlung noch läuft.
          </p>
          <Button
            onClick={async () => {
              const tid = dialog.split("/")[1];
              const ok = await run(async () => {
                await rpc("take_over_treatment", { p_treatment: tid });
                return true;
              });
              if (ok) navigate("treatment/" + tid);
            }}
          >
            Übernehmen
          </Button>
        </Modal>
      )}
      {dialog.startsWith("payment/") && can("record_payments") && (
        <PaymentDialog
          treatmentId={dialog.split("/")[1]}
          onClose={() => {
            sessionStorage.removeItem("heimfriseur-payment-prompt");
            setDialog("");
          }}
        />
      )}
      {dialog === "skip" && (
        <Modal title="Nicht durchgeführt" onClose={() => setDialog("")}>
          <p>Warum kann die Behandlung heute nicht stattfinden?</p>
          <Field label="Grund">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {[
                "Krank",
                "Nicht vor Ort",
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
          <Input
            label="Wann ist der nächste Behandlungstermin?"
            type="date"
            value={nextDate}
            onChange={setNextDate}
          />
          <Button variant="secondary" onClick={() => setNextDate("")}>
            Termin noch offen lassen
          </Button>
          <p className="muted">
            Der Kunde bleibt erhalten. Das Datum bestimmt, ab wann er wieder für
            einen Besuch fällig ist.
          </p>
          <Button
            onClick={async () => {
              const ok = await run(async () => {
                await rpc("skip_customer_followup", {
                  p_member: member,
                  p_reason: reason,
                  p_next_date: nextDate || null,
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
          <Field label="Anlass">
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
            >
              <option>Spontan</option>
              <option>Vorgezogen</option>
              <option>Nachgeholt</option>
            </select>
          </Field>
          <div className="add-customer-list">
            {data.customers
              .filter(
                (c) =>
                  c.facility_id === a.facility_id &&
                  (a.all_groups || c.group_id === a.group_id) &&
                  c.hair_request !== "Nein" &&
                  !members.some((m) => m.customer_id === c.id),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className="list-row"
                  onClick={async () => {
                    const ok = await run(async () => {
                      await rpc("add_customer_to_visit", {
                        p_appointment: id,
                        p_customer: c.id,
                        p_entry_type: entryType,
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
          {can("add_customers") && (
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
          )}
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
            {isOwner && (
              <>
                <dt>Umsatz</dt>
                <dd>{euro(s.revenue)}</dd>
                <dt>Materialkosten</dt>
                <dd>{euro(s.material)}</dd>
                <dt>Umsatz nach Material</dt>
                <dd>
                  <strong>{euro(s.revenue - s.material)}</strong>
                </dd>
              </>
            )}
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
                {isOwner && (
                  <Button
                    variant="secondary"
                    onClick={() => setDialog("cancel")}
                  >
                    Besuch absagen
                  </Button>
                )}
              </>
            )}
            {isOwner &&
              !data.treatments.some((t) => t.appointment_id === id) && (
                <Button
                  variant="danger-text"
                  onClick={() => setDialog("delete")}
                >
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
                {isOwner && a.recurrence_series_id && (
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
  const {
    data,
    rpc,
    refresh,
    setNotify,
    setError,
    isOwner,
    can,
    actorId,
    setNavigationGuard,
  } = useStore();
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
    [finishing, setFinishing] = useState(false);
  const ownsTreatment = !!t && (t.performed_by || t.user_id) === actorId;
  const hasColor = selected.some((sid) =>
    /farbe/i.test(data.services.find((s) => s.id === sid)?.name || ""),
  );
  const draft = {
    selected,
    price,
    material,
    notes,
    formula: hasColor ? formula : null,
  };
  const autosave = useAutosave(
    draft,
    ownsTreatment && !t?.end_time,
    async (next, finish) => {
      const m = Number(next.material.replace(",", ".")),
        p =
          next.price === "" || !can("override_prices")
            ? null
            : Number(next.price.replace(",", "."));
      if (
        !Number.isFinite(m) ||
        m < 0 ||
        (p !== null && (!Number.isFinite(p) || p < 0))
      )
        throw Error("Bitte gültige, nicht negative Beträge eingeben.");
      try {
        await rpc("save_treatment", {
          p_treatment: id,
          p_services: next.selected,
          p_price: p,
          p_material: m,
          p_notes: next.notes,
          p_formula: next.formula,
          p_finish: finish,
        });
      } catch (e) {
        throw Error(friendly(e) + " Änderungen sind noch nicht gespeichert.");
      }
    },
  );
  const dirty = autosave.dirty;
  useEffect(() => {
    setNavigationGuard(async () => autosave.flush());
    return () => setNavigationGuard(null);
  }, [id, autosave.flush]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!t) return <Empty title="Behandlung nicht gefunden" />;
  const c = data.customers.find((c) => c.id === t.customer_id)!;
  const a = data.appointments.find((a) => a.id === t.appointment_id)!;
  if (!c || !a)
    return (
      <Empty title="Behandlung gehört nicht zu einem zugewiesenen Besuch" />
    );
  const services = data.services.filter(
    (s) => s.is_active || selected.includes(s.id),
  );
  const total = selected.reduce(
    (n, id) =>
      n +
      Number(
        snapshots.find((s) => s.service_id === id)?.price_snapshot ??
          effectivePrice(data, id, c.facility_id),
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
    if (finishing) return false;
    if (finish) setFinishing(true);
    const ok = await autosave.flush(finish);
    if (ok) {
      await refresh();
      if (finish) {
        setNotify(
          `${fullName(c)} abgeschlossen · ${euro(price === "" ? total : Number(price.replace(",", ".")))} · ${minutes(elapsed / 60)}`,
        );
        if (can("record_payments"))
          sessionStorage.setItem("heimfriseur-payment-prompt", id);
        navigate("visit/" + a.id);
      } else setNotify("Zwischenstand gespeichert");
    } else
      setError(
        autosave.error ||
          "Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen.",
      );
    if (finish) setFinishing(false);
    return ok;
  }
  if (!ownsTreatment && !t.end_time)
    return (
      <Empty
        title="Diese Behandlung wird von einer anderen Person bearbeitet"
        action={
          <Button onClick={() => navigate("visit/" + a.id)}>
            Zur Kundenliste
          </Button>
        }
      />
    );
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
      <fieldset
        disabled={finishing}
        className="treatment-layout treatment-fields"
      >
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
                  }}
                />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.duration_minutes} Min.</small>
                </span>
                <strong>
                  {euro(
                    snapshots.find((x) => x.service_id === s.id)
                      ?.price_snapshot ??
                      effectivePrice(data, s.id, c.facility_id),
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
                  }}
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormula({});
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
          {can("override_prices") && (
            <>
              <Input
                label="Manueller Endpreis (€)"
                inputMode="decimal"
                value={price}
                onChange={(v) => {
                  setPrice(v);
                }}
              />
              <p className="muted">
                Leer lassen, um den berechneten Preis zu übernehmen.
              </p>
            </>
          )}
          <Input
            label="Materialkosten (€)"
            inputMode="decimal"
            value={material}
            onChange={(v) => {
              setMaterial(v);
            }}
          />
          <Field label="Behandlungsnotizen">
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
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
          <p
            role="status"
            className={autosave.status === "error" ? "warning" : "muted"}
          >
            {autosave.status === "saving"
              ? "Wird gespeichert …"
              : autosave.status === "error"
                ? autosave.error
                : dirty
                  ? "Änderungen werden gleich gespeichert …"
                  : "Alle Änderungen gespeichert"}
          </p>
          <p className="muted">
            Eingaben werden automatisch gespeichert. Der Timer läuft nach einem
            Neuladen weiter. Bei Verbindungsproblemen diese Ansicht geöffnet
            lassen und erneut speichern.
          </p>
        </aside>
      </fieldset>
    </>
  );
}
