import { useState } from "react";
import { useStore } from "./store";
import { Button, Modal } from "./ui";
import type { Permission, TeamMember } from "./types";
export const permissionLabels: [Permission, string][] = [
  ["edit_customers", "Kundendaten und Kundenrhythmus ändern"],
  ["add_customers", "Neue Kunden in zugewiesenen Wohnbereichen anlegen"],
  ["edit_schedule", "Zugewiesene Termine planen und verschieben"],
  ["override_prices", "Endpreis eigener Behandlungen ändern"],
  ["record_payments", "Zahlungen eigener Behandlungen erfassen"],
  ["view_billing", "Abrechnungskontakte sehen und ändern"],
  ["close_visits", "Als verantwortliche Person Besuche abschließen"],
];
export function PermissionsEditor({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const { rpc, run } = useStore();
  const [permissions, setPermissions] = useState<
    Partial<Record<Permission, boolean>>
  >(member.permissions || { record_payments: true, close_visits: true });
  return (
    <Modal title={"Berechtigungen: " + member.display_name} onClose={onClose}>
      <p>
        Die Rechte gelten nur innerhalb zugewiesener Besuche und Wohnbereiche.
        Unternehmensauswertungen, Teamverwaltung und Löschen bleiben beim
        Geschäftsführer.
      </p>
      {permissionLabels.map(([key, label]) => (
        <label className="check-row" key={key}>
          <input
            type="checkbox"
            checked={!!permissions[key]}
            onChange={(e) =>
              setPermissions({ ...permissions, [key]: e.target.checked })
            }
          />
          {label}
        </label>
      ))}
      <Button
        onClick={async () => {
          const ok = await run(async () => {
            await rpc("set_member_permissions", {
              p_member: member.id,
              p_permissions: permissions,
            });
            return true;
          });
          if (ok) onClose();
        }}
      >
        Berechtigungen speichern
      </Button>
    </Modal>
  );
}
