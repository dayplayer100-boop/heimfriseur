import { firebaseEnabled } from "./firebaseClient";
import { PermissionsEditor } from "./TeamPermissions";
import { BillingEditor } from "./Payments";
import type { Edit } from "./Records";
import { useState } from "react";
import type { TeamMember, AppAdminContext } from "./types";
function teamRoleLabel(
  member: TeamMember,
  appAdmin: AppAdminContext | null | undefined,
) {
  return appAdmin?.admins?.some(
    (a) => a.user_id === member.user_id && a.is_active,
  )
    ? "Admin"
    : member.role === "owner"
      ? "Geschäftsführer"
      : "Mitarbeiter";
}
import { useStore } from "./store";
import { Button, Input, Modal, Title, Empty } from "./ui";
import { euro, minutes, dateLabel, fullName } from "./domain";

const actionLabels: Record<string, string> = {
  permissions_changed: "Berechtigungen geändert",
  payment_recorded: "Zahlung erfasst",
  invite_created: "Einladung erstellt",
  invite_revoked: "Einladung widerrufen",
  invite_accepted: "Einladung angenommen",
  member_active: "Zugang geändert",
  visit_assigned: "Besuch zugewiesen",
  visit_closed: "Besuch abgeschlossen",
  visit_moved: "Besuch verschoben",
  visit_cancelled: "Besuch abgesagt",
  visit_deleted: "Besuch gelöscht",
  treatment_corrected: "Behandlung korrigiert",
  treatment_taken_over: "Behandlung übernommen",
};
export function TeamInvite() {
  const { rpc, run, setNotify, logout, user } = useStore();
  const [name, setName] = useState("");
  return (
    <section className="panel settings-panel">
      <Title
        title="Dem Team beitreten"
        description="Dein Mitarbeiterzugang wird mit deiner bestätigten E-Mail-Adresse verbunden."
      />
      <p>
        Angemeldet als {user?.email}. Du erhältst Zugriff auf die dir
        zugewiesenen Besuche. Ein bestehendes Unternehmenskonto kann nicht als
        Mitarbeiterkonto verwendet werden.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            await rpc("accept_team_invite", {
              p_token: sessionStorage.getItem("heimfriseur-invite"),
              p_name: name,
            });
            sessionStorage.removeItem("heimfriseur-invite");
            return true;
          });
          if (ok) {
            setNotify("Willkommen im Team");
            location.hash = "dashboard";
            location.reload();
          }
        }}
      >
        <Input label="Dein Name" value={name} onChange={setName} required />
        <Button type="submit">Einladung annehmen</Button>
      </form>
      <Button variant="secondary" onClick={() => void logout()}>
        Mit anderem Konto anmelden
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          sessionStorage.removeItem("heimfriseur-invite");
          location.reload();
        }}
      >
        Einladung verlassen
      </Button>
    </section>
  );
}
export function TeamSettings() {
  const { team, demo, rpc, run, setNotify, data, appAdmin } = useStore();
  const [permissionMember, setPermissionMember] = useState<string | null>(null);
  const [email, setEmail] = useState(""),
    [inviteLinks, setInviteLinks] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<string | null>(null);
  if (!team) return <Empty title="Team wird geladen" />;
  const changeMember = team.members.find((m) => m.id === confirm);
  return (
    <div className="stack">
      <section className="panel">
        <h2>Dein Team</h2>
        <p>
          Geschäftsführer verwalten das Unternehmen. Mitarbeiter bearbeiten
          zugewiesene Besuche und ihre eigenen Behandlungen.
          Unternehmensauswertungen, Stammdaten und Preisänderungen bleiben beim
          Geschäftsführer.
        </p>
        {appAdmin?.is_admin &&
          !team.members.some((m) => m.user_id === team.membership.user_id) && (
            <div className="list-row">
              <div>
                <strong>Admin</strong>
                <p>Admin · Plattformzugriff</p>
              </div>
            </div>
          )}
        {team.members.map((m) => (
          <div className="list-row" key={m.id}>
            <div>
              <strong>
                {(teamRoleLabel(m, appAdmin) === "Admin" &&
                m.display_name === "Geschäftsführer"
                  ? "Admin"
                  : m.display_name) ||
                  (teamRoleLabel(m, appAdmin) === "Admin"
                    ? "Admin"
                    : m.role === "owner"
                      ? data.profiles[0]?.first_name || "Geschäftsführer"
                      : "Mitarbeiter")}
              </strong>
              <p>
                {teamRoleLabel(m, appAdmin)} ·{" "}
                {m.is_active ? "Aktiv" : "Deaktiviert"}
              </p>
            </div>
            {m.role === "employee" && (
              <div className="button-group">
                <Button
                  variant="secondary"
                  onClick={() => setPermissionMember(m.id)}
                >
                  Berechtigungen
                </Button>
                <Button variant="secondary" onClick={() => setConfirm(m.id)}>
                  {m.is_active ? "Zugang deaktivieren" : "Aktivieren"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Mitarbeiter einladen</h2>
        <p>
          Der Link ist sieben Tage gültig und an diese E-Mail-Adresse gebunden.
          Kopiere ihn und sende ihn selbst an den Mitarbeiter.
        </p>
        {demo ? (
          <p className="warning">
            Einladungen benötigen ein echtes Unternehmenskonto. Die Vorschau
            versendet keine Einladungen.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run(() =>
                rpc("create_team_invite", { p_email: email }),
              );
              if (result) {
                setInviteLinks((previous) => ({
                  ...previous,
                  [email.trim().toLowerCase()]:
                    location.origin +
                    "/?invite=" +
                    encodeURIComponent(result.token),
                }));
                setEmail("");
              }
            }}
          >
            <Input
              label="E-Mail des Mitarbeiters"
              type="email"
              required
              value={email}
              onChange={setEmail}
            />
            <Button type="submit">Einladungslink erstellen</Button>
          </form>
        )}
        {team.invitations
          .filter((i) => !i.accepted_at)
          .map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <strong>{i.email}</strong>
                <p>
                  {i.revoked_at
                    ? "Widerrufen"
                    : new Date(i.expires_at).getTime() < Date.now()
                      ? "Abgelaufen"
                      : "Gültig bis " + dateLabel(i.expires_at.slice(0, 10))}
                </p>
                {!i.revoked_at &&
                  new Date(i.expires_at).getTime() > Date.now() &&
                  (i.link_token || inviteLinks[i.email]) && (
                    <div className="invite-link">
                      <label>
                        Einladungslink für {i.email}
                        <input
                          readOnly
                          value={
                            i.link_token
                              ? location.origin +
                                "/?invite=" +
                                encodeURIComponent(i.link_token)
                              : inviteLinks[i.email]
                          }
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              i.link_token
                                ? location.origin +
                                    "/?invite=" +
                                    encodeURIComponent(i.link_token)
                                : inviteLinks[i.email],
                            );
                            setNotify("Einladungslink kopiert");
                          } catch {
                            setNotify("Bitte den Link markieren und kopieren.");
                          }
                        }}
                      >
                        Link kopieren
                      </Button>
                    </div>
                  )}
                {firebaseEnabled && !i.accepted_at && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void run(async () => {
                        await rpc("renew_team_invite", { p_invite: i.id });
                        setNotify(
                          "Neuer Link erstellt. Der bisherige Link ist jetzt ungültig.",
                        );
                      })
                    }
                  >
                    Neuen Link erstellen
                  </Button>
                )}
              </div>
              {!i.revoked_at && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      await rpc("revoke_team_invite", { p_invite: i.id });
                      setNotify("Einladung widerrufen");
                    })
                  }
                >
                  Widerrufen
                </Button>
              )}
            </div>
          ))}
      </section>
      {appAdmin?.is_admin && (
        <section className="panel">
          <h2>Änderungsprotokoll</h2>
          <p className="muted">
            Die letzten 100 wichtigen Änderungen. Behandlungsnotizen erscheinen
            hier nicht.
          </p>
          {team.audit.map((e) => (
            <div className="audit-row" key={e.id}>
              <strong>{actionLabels[e.action] || e.action}</strong>
              <span>
                {appAdmin.admins?.some(
                  (a) => a.user_id === e.actor_id && a.is_active,
                )
                  ? "Admin"
                  : team.members.find((m) => m.user_id === e.actor_id)
                      ?.display_name || "Unbekannt"}{" "}
                ·{" "}
                {new Date(e.created_at).toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                })}
              </span>
              {e.action === "treatment_corrected" && (
                <p>
                  {e.details.reason} · Preis {euro(e.details.before.price)} →{" "}
                  {euro(e.details.after.price)} · Material{" "}
                  {euro(e.details.before.material)} →{" "}
                  {euro(e.details.after.material)}
                </p>
              )}
            </div>
          ))}
          {!team.audit.length && (
            <p className="muted">Noch keine Teamänderungen.</p>
          )}
        </section>
      )}
      {permissionMember && (
        <PermissionsEditor
          member={team.members.find((m) => m.id === permissionMember)!}
          onClose={() => setPermissionMember(null)}
        />
      )}
      {changeMember && (
        <Modal
          title={
            changeMember.is_active
              ? "Mitarbeiterzugang deaktivieren?"
              : "Zugang aktivieren?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {changeMember.is_active
              ? "Der Zugriff auf das Unternehmen endet sofort. Behandlungen und Historie bleiben erhalten. Eine offene Behandlung kannst du danach im Besuch übernehmen."
              : "Der Mitarbeiter kann anschließend wieder zugewiesene Besuche öffnen."}
          </p>
          <Button
            onClick={async () => {
              const ok = await run(async () => {
                await rpc("set_member_active", {
                  p_member: changeMember.id,
                  p_active: !changeMember.is_active,
                });
                return true;
              });
              if (ok) setConfirm(null);
            }}
          >
            Bestätigen
          </Button>
        </Modal>
      )}
    </div>
  );
}
export function AssignmentEditor({
  appointmentId,
  onClose,
}: {
  appointmentId: string;
  onClose: () => void;
}) {
  const { team, rpc, run, demo, appAdmin } = useStore();
  const current =
    team?.assignments.filter((a) => a.appointment_id === appointmentId) || [];
  const [users, setUsers] = useState(current.map((a) => a.user_id));
  const [responsible, setResponsible] = useState(
    current.find((a) => a.is_responsible)?.user_id || "",
  );
  return (
    <Modal title="Team für diesen Besuch" onClose={onClose}>
      <p>
        Mehrere Personen können gemeinsam arbeiten. Die verantwortliche Person
        darf den Besuch abschließen. Als Geschäftsführer oder Admin kannst du
        ihn jederzeit abschließen.
      </p>
      {team?.members
        .filter((m) => m.is_active)
        .map((m) => (
          <label className="service-option" key={m.id}>
            <input
              type="checkbox"
              checked={users.includes(m.user_id)}
              onChange={(e) => {
                setUsers(
                  e.target.checked
                    ? [...users, m.user_id]
                    : users.filter((u) => u !== m.user_id),
                );
                if (!e.target.checked && responsible === m.user_id)
                  setResponsible("");
              }}
            />
            {m.display_name || teamRoleLabel(m, appAdmin)}
          </label>
        ))}
      <label>
        Verantwortlich für den Abschluss
        <select
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        >
          <option value="">Geschäftsführer oder Admin</option>
          {team?.members
            .filter((m) => users.includes(m.user_id) && m.is_active)
            .map((m) => (
              <option key={m.id} value={m.user_id}>
                {m.display_name || teamRoleLabel(m, appAdmin)}
              </option>
            ))}
        </select>
      </label>
      {!users.length && (
        <p className="warning">
          Dieser Besuch ist anschließend nicht zugewiesen.
        </p>
      )}
      <Button
        disabled={demo}
        onClick={async () => {
          const ok = await run(async () => {
            await rpc("assign_visit", {
              p_appointment: appointmentId,
              p_users: users,
              p_responsible: responsible || null,
            });
            return true;
          });
          if (ok) onClose();
        }}
      >
        Zuordnung speichern
      </Button>
      {demo && (
        <p className="muted">In der Vorschau bleibt Anna verantwortlich.</p>
      )}
    </Modal>
  );
}
export function CorrectionEditor({
  treatmentId,
  onClose,
}: {
  treatmentId: string;
  onClose: () => void;
}) {
  const { data, rpc, run, demo } = useStore();
  const t = data.treatments.find((t) => t.id === treatmentId)!;
  const [price, setPrice] = useState(String(t.total_price)),
    [material, setMaterial] = useState(String(t.material_cost)),
    [reason, setReason] = useState("");
  return (
    <Modal title="Abgeschlossene Behandlung korrigieren" onClose={onClose}>
      <p>
        Leistungspreise bleiben als historische Snapshots erhalten. Die Änderung
        des Endpreises und der Materialkosten wird mit alten Werten
        protokolliert.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            await rpc("correct_treatment", {
              p_treatment: t.id,
              p_price: Number(price.replace(",", ".")),
              p_material: Number(material.replace(",", ".")),
              p_reason: reason,
            });
            return true;
          });
          if (ok) onClose();
        }}
      >
        <Input
          label="Endpreis (€)"
          value={price}
          onChange={setPrice}
          required
        />
        <Input
          label="Materialkosten (€)"
          value={material}
          onChange={setMaterial}
          required
        />
        <Input
          label="Begründung"
          value={reason}
          onChange={setReason}
          required
        />
        <Button type="submit" disabled={demo}>
          Korrektur speichern
        </Button>
      </form>
    </Modal>
  );
}
export function EmployeeCustomer({ id, edit }: { id: string; edit: Edit }) {
  const { data, can } = useStore();
  const c = data.customers.find((c) => c.id === id);
  if (!c) return <Empty title="Kunde nicht zugewiesen" />;
  return (
    <>
      <Title
        title={fullName(c)}
        description={"Zimmer " + (c.room_number || "–")}
      />
      {can("edit_customers") && (
        <Button onClick={() => edit("customers", c)}>
          Kundendaten bearbeiten
        </Button>
      )}
      <BillingEditor customerId={id} />
      <section className="panel">
        <h2>Behandlungshistorie</h2>
        {data.treatments
          .filter((t) => t.customer_id === id && t.end_time)
          .sort((a, b) => b.start_time.localeCompare(a.start_time))
          .map((t) => (
            <div className="audit-row" key={t.id}>
              <strong>
                {dateLabel(t.start_time.slice(0, 10))} ·{" "}
                {minutes(Number(t.duration_minutes))}
              </strong>
              <p>
                {data.treatment_services
                  .filter((s) => s.treatment_id === t.id)
                  .map((s) => s.service_name_snapshot)
                  .join(" / ")}
              </p>
              {t.notes && <p>{t.notes}</p>}
            </div>
          ))}
      </section>
      <section className="panel">
        <h2>Farbrezepturen</h2>
        {data.color_formulas
          .filter((f) => f.customer_id === id)
          .sort((a, b) => b.formula_date.localeCompare(a.formula_date))
          .map((f) => (
            <div className="audit-row" key={f.id}>
              <strong>
                {dateLabel(f.formula_date)} · {f.product}
              </strong>
              <p>
                {[
                  [f.color_1, f.color_1_amount],
                  [f.color_2, f.color_2_amount],
                  [f.color_3, f.color_3_amount],
                ]
                  .filter(([color]) => color)
                  .map(([color, amount]) => `${color}: ${amount || "–"} g`)
                  .join(" · ")}
              </p>
              <p>
                Entwickler {f.developer_strength} · {f.developer_amount || "–"}{" "}
                g · {f.processing_time_minutes || "–"} Min.
              </p>
              <p>{f.notes}</p>
            </div>
          ))}
      </section>
    </>
  );
}
