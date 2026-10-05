import { useState } from "react";
import { useStore } from "./store";
import { Button, Field, Input, Empty } from "./ui";
import { effectivePrice } from "./domain";
export function PriceLists({ facilityId }: { facilityId?: string }) {
  const { data, rpc, run, setNotify, setError } = useStore();
  const [facility, setFacility] = useState(
    facilityId ||
      data.facilities
        .filter((f) => !f.is_provisional)
        .sort(
          (a, b) =>
            (a.created_at || "").localeCompare(b.created_at || "") ||
            a.id.localeCompare(b.id),
        )[0]?.id ||
      "",
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!data.facilities.length)
    return (
      <Empty
        title="Zuerst ein Heim anlegen"
        text="Danach kannst du dessen Preisliste eintragen."
      />
    );
  return (
    <section className="panel">
      <h2>Preisliste je Heim</h2>
      <Field label="Heim für die Preisliste">
        <select
          value={facility}
          onChange={(e) => {
            if (
              Object.keys(draft).length &&
              !window.confirm(
                "Ungespeicherte Preise verwerfen und das Heim wechseln?",
              )
            )
              return;
            setFacility(e.target.value);
            setDraft({});
          }}
        >
          <option value="">Heim auswählen</option>
          {data.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <p>
        Jedes Heim hat seine eigene Preisliste. Die Preise des ersten Heims sind
        die Vorgabe für weitere Heime. Bereits selbst angepasste Listen und alte
        Behandlungen bleiben erhalten.
      </p>
      {facility && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const prices: Record<string, number> = {};
            for (const s of data.services.filter((s) => s.is_active)) {
              const value = Number(
                (
                  draft[s.id] ?? String(effectivePrice(data, s.id, facility))
                ).replace(",", "."),
              );
              if (!Number.isFinite(value) || value < 0) {
                setError("Bitte gültige, nicht negative Preise eingeben.");
                return;
              }
              prices[s.id] = value;
            }
            const ok = await run(async () => {
              await rpc("save_facility_price_list", {
                p_facility: facility,
                p_prices: prices,
              });
              return true;
            });
            if (ok) {
              setDraft({});
              setNotify("Preisliste gespeichert");
            }
          }}
        >
          <div className="form-grid">
            {data.services
              .filter((s) => s.is_active)
              .map((s) => (
                <Input
                  key={facility + s.id}
                  label={s.name + " (€)"}
                  inputMode="decimal"
                  value={
                    draft[s.id] ?? String(effectivePrice(data, s.id, facility))
                  }
                  onChange={(v) => setDraft({ ...draft, [s.id]: v })}
                />
              ))}
          </div>
          <Button type="submit">Preisliste speichern</Button>
        </form>
      )}
    </section>
  );
}
