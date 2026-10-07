import { useState } from "react";
import { useStore } from "./store";
import { Button, Input, Field } from "./ui";

export function AdminUsers() {
  const { appAdmin, user, run, rpc, busy, setNotify } = useStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState("employee");
  const [company, setCompany] = useState("");
  if (!appAdmin?.is_admin || !appAdmin.users) return null;
  const users = appAdmin.users.filter((u) =>
    `${u.email} ${u.display_name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const target = appAdmin.users.find((u) => u.uid === selected);
  const admins = appAdmin.admins || [];
  const businesses = appAdmin.businesses || [];
  return (
    <section>
      <h3>Benutzer & Rollen</h3>
      <p>
        Nur App-Admins können Rollen wechseln. Neue Konten erscheinen hier nach
        ihrer ersten Anmeldung mit bestätigter E-Mail.
      </p>
      <Input label="Benutzer suchen" value={search} onChange={setSearch} />
      {users.map((u) => {
        const isAdmin = admins.some((a) => a.user_id === u.uid && a.is_active);
        const business = businesses.find((b) => b.id === u.business_id);
        const currentRole = isAdmin
          ? "Admin"
          : business?.owner_user_id === u.uid
            ? "Geschäftsführer"
            : business
              ? "Mitarbeiter"
              : "Noch nicht zugeordnet";
        return (
          <div className="list-row" key={u.uid}>
            <div>
              <strong>{u.display_name}</strong>
              <p>{u.email}</p>
              <p>
                {currentRole} · {business?.name || "App-Verwaltung"}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={busy || u.uid === user?.id}
              onClick={() => {
                setSelected(u.uid);
                setRole(
                  isAdmin
                    ? "admin"
                    : business?.owner_user_id === u.uid
                      ? "owner"
                      : "employee",
                );
                setCompany(
                  u.business_id || appAdmin.selected_business_id || "",
                );
              }}
            >
              Rolle ändern
            </Button>
          </div>
        );
      })}
      {users.length === 0 && <p>Keine passenden Benutzer gefunden.</p>}
      {target && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const label =
              role === "admin"
                ? "App-Admin mit Zugriff auf alle Unternehmen"
                : role === "owner"
                  ? "Geschäftsführer"
                  : "Mitarbeiter";
            if (
              !window.confirm(
                `${target.email} als ${label} einrichten? ${role === "owner" ? "Der bisherige Geschäftsführer wird Mitarbeiter. Ein bisheriger App-Admin behält seinen Plattformzugang." : ""}`,
              )
            )
              return;
            const ok = await run(async () => {
              if (role === "admin")
                await rpc("set_app_admin", {
                  p_email: target.email,
                  p_active: true,
                });
              else
                await rpc("set_admin_business_role", {
                  p_user: target.uid,
                  p_business: company,
                  p_role: role,
                });
              return true;
            });
            if (ok) {
              setSelected("");
              setNotify(
                "Rolle gespeichert. Die Person muss ihre App neu laden.",
              );
            }
          }}
        >
          <h3>{target.email}</h3>
          <Field label="Neue Rolle">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="employee">Mitarbeiter</option>
              <option value="owner">Geschäftsführer</option>
              <option value="admin">App-Admin · alle Unternehmen</option>
            </select>
          </Field>
          {role !== "admin" && (
            <Field label="Unternehmen">
              <select
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="">Bitte auswählen</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.owner_email}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p>
            Geschäftsdaten und abgeschlossene Behandlungen bleiben erhalten.
            Konten eines anderen Unternehmens werden nicht automatisch
            verschoben.
          </p>
          <div className="button-row">
            <Button type="submit" disabled={busy}>
              Rolle speichern
            </Button>
            <Button variant="secondary" onClick={() => setSelected("")}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
