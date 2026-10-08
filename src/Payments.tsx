import { sumMoney } from "./money";
import { useState } from "react";
import { useStore } from "./store";
import { Button, Input, Field, Modal } from "./ui";
import { euro, fullName, dateLabel } from "./domain";
export function BillingEditor({ customerId }: { customerId: string }) {
  const { data, rpc, run, can, setNotify } = useStore();
  const row = data.customer_billing.find((b) => b.customer_id === customerId);
  const [values, setValues] = useState<Record<string, string>>({
    ...row,
  } as any);
  if (!can("view_billing")) return null;
  return (
    <section className="panel">
      <h2>Abrechnung & Ansprechpartner</h2>
      <p>
        Die Rechnung kann an Angehörige, Betreuer oder das Heim gehen.
        Unbekannte Angaben bleiben leer.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            await rpc("save_billing", {
              p_customer: customerId,
              p_data: values,
            });
            return true;
          });
          if (ok) setNotify("Abrechnungskontakt gespeichert");
        }}
      >
        <div className="form-grid">
          {[
            ["billing_name", "Name Rechnungsempfänger / Ansprechpartner"],
            ["street", "Straße und Hausnummer"],
            ["postal_code", "PLZ"],
            ["city", "Ort"],
            ["phone", "Telefon"],
            ["email", "E-Mail"],
          ].map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={values[key] || ""}
              onChange={(v) => setValues({ ...values, [key]: v })}
            />
          ))}
        </div>
        <Field label="Übliche Zahlungsart">
          <select
            value={values.payment_method_id || ""}
            onChange={(e) =>
              setValues({ ...values, payment_method_id: e.target.value })
            }
          >
            <option value="">Noch offen</option>
            {data.payment_methods
              .filter((m) => m.is_active)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Rechnungsweg">
          <select
            value={values.delivery || "Keine Angabe"}
            onChange={(e) => setValues({ ...values, delivery: e.target.value })}
          >
            <option>Keine Angabe</option>
            <option>Post</option>
            <option>E-Mail</option>
          </select>
        </Field>
        <Button type="submit">Abrechnung speichern</Button>
      </form>
    </section>
  );
}
export function PaymentDialog({
  treatmentId,
  onClose,
}: {
  treatmentId: string;
  onClose: () => void;
}) {
  const { data, rpc, run, can, isOwner } = useStore();
  const t = data.treatments.find((t) => t.id === treatmentId);
  const c = data.customers.find((c) => c.id === t?.customer_id);
  const billing = data.customer_billing.find((b) => b.customer_id === c?.id),
    stored = data.treatment_payments.find(
      (p) => p.treatment_id === treatmentId,
    );
  const [method, setMethod] = useState(
      stored?.payment_method_id || billing?.payment_method_id || "",
    ),
    [status, setStatus] = useState(stored?.status || "Unbekannt"),
    [delivery, setDelivery] = useState(
      stored?.delivery || billing?.delivery || "Keine Angabe",
    );
  if (!t || !can("record_payments")) return null;
  return (
    <Modal title="Zahlung / Abrechnung erfassen" onClose={onClose}>
      <p>
        <strong>
          {c ? fullName(c) : "Kunde"}
          {isOwner && <> · {euro(t.total_price)}</>}
        </strong>
        <br />
        Die Behandlung ist bereits gespeichert. Unbekannte Zahlungsangaben
        kannst du später ergänzen.
      </p>
      <Field label="Zahlungsart">
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            if (
              data.payment_methods.find((m) => m.id === e.target.value)
                ?.name === "Barzahlung"
            )
              setStatus("Bezahlt");
            else setStatus("Offen");
          }}
        >
          <option value="">Noch offen</option>
          {data.payment_methods
            .filter((m) => m.is_active)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Zahlungsstatus">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>Unbekannt</option>
          <option>Offen</option>
          <option>Bezahlt</option>
          <option>Nicht erforderlich</option>
        </select>
      </Field>
      <Field label="Rechnung senden über">
        <select value={delivery} onChange={(e) => setDelivery(e.target.value)}>
          <option>Keine Angabe</option>
          <option>Post</option>
          <option>E-Mail</option>
        </select>
      </Field>
      <p className="muted">
        „Per Post“ ist der Rechnungsweg, zum Beispiel mit Überweisung als
        Zahlungsart. Die App dokumentiert die Angaben; sie versendet keine
        Rechnung.
      </p>
      {can("view_billing") && <BillingEditor customerId={t.customer_id} />}
      <div className="button-group">
        <Button
          onClick={async () => {
            const ok = await run(async () => {
              await rpc("record_payment", {
                p_treatment: t.id,
                p_data: { payment_method_id: method || null, status, delivery },
              });
              return true;
            });
            if (ok) onClose();
          }}
        >
          Zahlung speichern
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Später erfassen
        </Button>
      </div>
    </Modal>
  );
}
export function PaymentsSettings() {
  const { data, rpc, run } = useStore();
  const [name, setName] = useState(""),
    [payment, setPayment] = useState<string | null>(null),
    [facility, setFacility] = useState(""),
    [statusFilter, setStatusFilter] = useState("Alle"),
    [search, setSearch] = useState("");
  const outstanding = data.treatments
    .filter((t) => t.end_time)
    .filter((t) => {
      const p = data.treatment_payments.find((p) => p.treatment_id === t.id);
      return (
        !["Bezahlt", "Nicht erforderlich"].includes(p?.status || "") &&
        (!facility ||
          data.appointments.find((a) => a.id === t.appointment_id)
            ?.facility_id === facility) &&
        (statusFilter === "Alle" ||
          (p?.status || "Unbekannt") === statusFilter) &&
        (
          (data.customers.find((c) => c.id === t.customer_id)
            ? fullName(data.customers.find((c) => c.id === t.customer_id)!)
            : "") +
          " " +
          (p?.billing_name_snapshot ||
            data.customer_billing.find((b) => b.customer_id === t.customer_id)
              ?.billing_name ||
            "")
        )
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    });
  return (
    <div className="stack">
      <section className="panel">
        <h2>Zahlungsarten</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(async () => {
              await rpc("save_payment_method", { p_name: name });
              return true;
            });
            if (ok) setName("");
          }}
        >
          <Input
            label="Neue Zahlungsart, z. B. Heimkonto oder Lastschrift"
            value={name}
            onChange={setName}
          />
          <Button type="submit" disabled={!name.trim()}>
            Zahlungsart hinzufügen
          </Button>
        </form>
        {data.payment_methods.map((m) => (
          <div className="list-row" key={m.id}>
            <span>
              {m.name} · {m.is_active ? "Aktiv" : "Inaktiv"}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                void run(() =>
                  rpc("save_payment_method", {
                    p_id: m.id,
                    p_name: m.name,
                    p_active: !m.is_active,
                  }),
                )
              }
            >
              {m.is_active ? "Deaktivieren" : "Aktivieren"}
            </Button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Offene Zahlungen / noch nicht erfasst</h2>
        <div className="form-grid">
          <Field label="Heim für offene Zahlungen">
            <select
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            >
              <option value="">Alle Heime</option>
              {data.facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Offene Zahlungen filtern">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>Alle</option>
              <option>Offen</option>
              <option>Unbekannt</option>
            </select>
          </Field>
          <Input
            label="Kunde oder Rechnungsempfänger suchen"
            value={search}
            onChange={setSearch}
          />
        </div>
        <p>
          <strong>
            {outstanding.length} offene / ungeklärte Zahlungen ·{" "}
            {euro(sumMoney(outstanding.map((t) => t.total_price)))}
          </strong>
        </p>
        {!outstanding.length && (
          <p>Keine offenen Zahlungen für diese Auswahl.</p>
        )}
        {outstanding.map((t) => (
          <div className="list-row" key={t.id}>
            <div>
              <strong>
                {fullName(data.customers.find((c) => c.id === t.customer_id)!)}
              </strong>
              <p>
                {dateLabel(t.start_time)} · {euro(t.total_price)} ·{" "}
                {data.treatment_payments.find((p) => p.treatment_id === t.id)
                  ?.method_name_snapshot || "Noch offen"}
              </p>
            </div>
            <p>
              Zuständig:{" "}
              {data.treatment_payments.find((p) => p.treatment_id === t.id)
                ?.billing_name_snapshot ||
                data.customer_billing.find(
                  (b) => b.customer_id === t.customer_id,
                )?.billing_name ||
                "Rechnungsempfänger noch offen"}{" "}
              · Status:{" "}
              {data.treatment_payments.find((p) => p.treatment_id === t.id)
                ?.status || "Unbekannt"}
            </p>
            <Button variant="secondary" onClick={() => setPayment(t.id)}>
              Abrechnung öffnen
            </Button>
          </div>
        ))}
      </section>
      {payment && (
        <PaymentDialog treatmentId={payment} onClose={() => setPayment(null)} />
      )}
    </div>
  );
}
