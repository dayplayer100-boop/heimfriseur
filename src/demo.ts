import {
  emptyData,
  type Data,
  type Table,
  type Row,
  type Appointment,
} from "./types";
import { today, addWeeks } from "./domain";
const uid = "demo";
const base = (id: string = crypto.randomUUID()) => ({
  id,
  user_id: uid,
  created_at: new Date().toISOString(),
});
export function demoSeed(): Data {
  const d = emptyData();
  d.profiles.push({
    ...base("profile"),
    business_name: "HeimFriseur",
    first_name: "Anna",
    last_name: "",
    street: "",
    house_number: "",
    postal_code: "",
    city: "",
    phone: "",
    email: "",
    logo_url: "",
  });
  d.facilities.push(
    {
      ...base("f1"),
      name: "Seniorenheim Sonnengarten",
      street: "Musterstraße",
      house_number: "25",
      postal_code: "45127",
      city: "Essen",
      phone: "0201 123456",
      email: "",
      contact_name: "Sabine Hoffmann",
      contact_phone: "",
      notes: "",
    },
    {
      ...base("f2"),
      name: "Seniorenresidenz am Park",
      street: "Parkstraße",
      house_number: "12",
      postal_code: "45131",
      city: "Essen",
      phone: "",
      email: "",
      contact_name: "",
      contact_phone: "",
      notes: "",
    },
  );
  d.groups.push(
    {
      ...base("g1"),
      facility_id: "f1",
      name: "Wohnbereich A",
      recurrence_weeks: 5,
      preferred_weekday: 2,
      preferred_start_time: "09:00",
      notes: "",
    },
    {
      ...base("g2"),
      facility_id: "f2",
      name: "Wohnbereich Süd",
      recurrence_weeks: 4,
      preferred_weekday: 4,
      preferred_start_time: "09:30",
      notes: "",
    },
  );
  [
    ["Damenhaarschnitt", 28, 30],
    ["Herrenhaarschnitt", 22, 20],
    ["Waschen", 5, 5],
    ["Föhnen", 12, 15],
    ["Farbe", 35, 45],
    ["Dauerwelle", 55, 70],
    ["Bart", 10, 10],
  ].forEach(([name, price, duration_minutes], i) =>
    d.services.push({
      ...base("s" + i),
      name: String(name),
      price: Number(price),
      duration_minutes: Number(duration_minutes),
      is_active: true,
    }),
  );
  [
    ["Erika", "Müller", "115"],
    ["Hans", "Schneider", "118"],
    ["Gerda", "Weber", "121"],
  ].forEach(([first_name, last_name, room_number], i) => {
    d.customers.push({
      ...base("c" + i),
      facility_id: "f1",
      group_id: "g1",
      first_name,
      last_name,
      room_number,
      status: "Aktiv",
      notes: "",
    });
    (i === 0 ? [0, 2, 3] : i === 1 ? [1] : [0, 3, 4]).forEach((n) =>
      d.customer_default_services.push({
        ...base(),
        customer_id: "c" + i,
        service_id: "s" + n,
      }),
    );
  });
  d.appointments.push(
    {
      ...base("a1"),
      facility_id: "f1",
      group_id: "g1",
      appointment_date: today(),
      start_time: "09:00",
      status: "Geplant",
      recurrence_weeks: 5,
      recurrence_series_id: "series1",
      actual_start_time: null,
      actual_end_time: null,
    },
    {
      ...base("a2"),
      facility_id: "f2",
      group_id: "g2",
      appointment_date: addWeeks(today(), 1),
      start_time: "09:30",
      status: "Geplant",
      recurrence_weeks: 4,
      recurrence_series_id: "series2",
      actual_start_time: null,
      actual_end_time: null,
    },
  );
  d.customers.forEach((c, i) =>
    d.appointment_customers.push({
      ...base(),
      appointment_id: "a1",
      customer_id: c.id,
      status: "Offen",
      sort_order: i,
    }),
  );
  return d;
}
export class DemoRepository {
  data: Data;
  constructor() {
    this.data =
      JSON.parse(sessionStorage.getItem("heimfriseur-demo") || "null") ||
      demoSeed();
  }
  persist() {
    sessionStorage.setItem("heimfriseur-demo", JSON.stringify(this.data));
  }
  save(table: Table, input: Record<string, unknown>) {
    const rows = this.data[table] as Row[];
    const row = { ...base(), ...input } as Row;
    const idx = rows.findIndex((x) => x.id === row.id);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
    else rows.push(row);
    this.persist();
    return row.id;
  }
  remove(table: Table, id: string) {
    const refs = this.data;
    if (
      (table === "facilities" &&
        refs.groups.some((g) => g.facility_id === id)) ||
      (table === "groups" && refs.customers.some((c) => c.group_id === id)) ||
      (table === "customers" &&
        refs.appointment_customers.some((m) => m.customer_id === id))
    )
      throw Error(
        "Dieser Datensatz wird noch verwendet. Bitte Kunden stattdessen auf inaktiv setzen.",
      );
    (this.data[table] as Row[]).splice(
      (this.data[table] as Row[]).findIndex((r) => r.id === id),
      1,
    );
    this.persist();
  }
  async rpc(name: string, p: Record<string, any>) {
    const d = this.data;
    let result: any = null;
    const getA = (id: string) => {
      const a = d.appointments.find((a) => a.id === id);
      if (!a) throw Error("Besuch nicht gefunden.");
      return a;
    };
    switch (name) {
      case "save_customer":
        result = this.save("customers", p.p_data);
        d.customer_default_services = d.customer_default_services.filter(
          (x) => x.customer_id !== result,
        );
        p.p_services.forEach((id: string) =>
          d.customer_default_services.push({
            ...base(),
            customer_id: result,
            service_id: id,
          }),
        );
        break;
      case "plan_visit": {
        const g = d.groups.find((g) => g.id === p.p_group)!;
        const a: Appointment = {
          ...base(),
          facility_id: g.facility_id,
          group_id: g.id,
          appointment_date: p.p_date,
          start_time: p.p_time,
          status: "Geplant",
          recurrence_weeks: p.p_weeks,
          recurrence_series_id: p.p_weeks
            ? p.p_series || crypto.randomUUID()
            : null,
          actual_start_time: null,
          actual_end_time: null,
        };
        d.appointments.push(a);
        if (p.p_all)
          d.customers
            .filter((c) => c.group_id === g.id && c.status === "Aktiv")
            .forEach((c, i) =>
              d.appointment_customers.push({
                ...base(),
                appointment_id: a.id,
                customer_id: c.id,
                status: "Offen",
                sort_order: i,
              }),
            );
        result = a.id;
        break;
      }
      case "add_visit_customer":
        if (
          !d.appointment_customers.some(
            (m) =>
              m.appointment_id === p.p_appointment &&
              m.customer_id === p.p_customer,
          )
        )
          d.appointment_customers.push({
            ...base(),
            appointment_id: p.p_appointment,
            customer_id: p.p_customer,
            status: "Offen",
            sort_order: d.appointment_customers.length,
          });
        break;
      case "start_treatment": {
        const m = d.appointment_customers.find((m) => m.id === p.p_member)!;
        const running = d.treatments.find((t) => !t.end_time);
        if (running) {
          if (running.appointment_customer_id === m.id) {
            result = running.id;
            break;
          }
          throw Error("Bitte zuerst die laufende Behandlung beenden.");
        }
        const a = getA(m.appointment_id);
        if (
          m.status !== "Offen" ||
          a.status === "Abgeschlossen" ||
          a.status === "Abgesagt"
        )
          throw Error("Behandlung kann nicht gestartet werden.");
        const t = {
          ...base(),
          appointment_id: a.id,
          appointment_customer_id: m.id,
          customer_id: m.customer_id,
          start_time: new Date().toISOString(),
          end_time: null,
          duration_minutes: null,
          total_price: 0,
          material_cost: 0,
          notes: "",
        };
        d.treatments.push(t);
        d.customer_default_services
          .filter((x) => x.customer_id === m.customer_id)
          .forEach((x) => {
            const s = d.services.find(
              (s) => s.id === x.service_id && s.is_active,
            );
            if (s) {
              d.treatment_services.push({
                ...base(),
                treatment_id: t.id,
                service_id: s.id,
                service_name_snapshot: s.name,
                price_snapshot: s.price,
                duration_minutes_snapshot: s.duration_minutes,
              });
              t.total_price += s.price;
            }
          });
        m.status = "In Behandlung";
        a.status = "In Bearbeitung";
        a.actual_start_time ||= t.start_time;
        result = t.id;
        break;
      }
      case "save_treatment": {
        const t = d.treatments.find((t) => t.id === p.p_treatment)!;
        if (t.end_time) {
          result = t.id;
          break;
        }
        if (p.p_material < 0 || p.p_price < 0)
          throw Error("Beträge dürfen nicht negativ sein.");
        d.treatment_services = d.treatment_services.filter(
          (s) => s.treatment_id !== t.id || p.p_services.includes(s.service_id),
        );
        p.p_services.forEach((id: string) => {
          if (
            !d.treatment_services.some(
              (s) => s.treatment_id === t.id && s.service_id === id,
            )
          ) {
            const s = d.services.find((s) => s.id === id)!;
            d.treatment_services.push({
              ...base(),
              treatment_id: t.id,
              service_id: id,
              service_name_snapshot: s.name,
              price_snapshot: s.price,
              duration_minutes_snapshot: s.duration_minutes,
            });
          }
        });
        t.total_price =
          p.p_price ??
          d.treatment_services
            .filter((s) => s.treatment_id === t.id)
            .reduce((n, s) => n + s.price_snapshot, 0);
        t.price_override = p.p_price;
        t.material_cost = p.p_material;
        t.notes = p.p_notes;
        if (p.p_formula) {
          d.color_formulas = d.color_formulas.filter(
            (f) => f.treatment_id !== t.id,
          );
          d.color_formulas.push({
            ...base(),
            ...p.p_formula,
            customer_id: t.customer_id,
            treatment_id: t.id,
            formula_date: today(),
          });
        }
        if (p.p_finish) {
          t.end_time = new Date().toISOString();
          t.duration_minutes =
            (Date.now() - new Date(t.start_time).getTime()) / 60000;
          d.appointment_customers.find(
            (m) => m.id === t.appointment_customer_id,
          )!.status = "Erledigt";
        }
        result = t.id;
        break;
      }
      case "skip_customer": {
        const m = d.appointment_customers.find((m) => m.id === p.p_member)!;
        if (m.status !== "Offen")
          throw Error("Nur offene Kunden können übersprungen werden.");
        m.status = "Nicht durchgeführt";
        m.non_completion_reason = p.p_reason;
        break;
      }
      case "close_visit": {
        const a = getA(p.p_appointment);
        if (
          d.appointment_customers.some(
            (m) =>
              m.appointment_id === a.id &&
              ["Offen", "In Behandlung"].includes(m.status),
          )
        )
          throw Error(
            "Bitte alle Kunden erledigen oder als nicht durchgeführt markieren.",
          );
        a.status = "Abgeschlossen";
        if (a.actual_start_time) a.actual_end_time = new Date().toISOString();
        if (a.recurrence_weeks) {
          const next = addWeeks(a.appointment_date, a.recurrence_weeks);
          result = d.appointments.find(
            (x) =>
              x.recurrence_series_id === a.recurrence_series_id &&
              x.appointment_date === next,
          )?.id;
          if (!result)
            result = await this.rpc("plan_visit", {
              p_group: a.group_id,
              p_date: next,
              p_time: a.start_time,
              p_weeks: a.recurrence_weeks,
              p_series: a.recurrence_series_id,
              p_all: true,
            });
        }
        break;
      }
      case "move_visit": {
        const a = getA(p.p_appointment);
        const delta =
          (new Date(p.p_date + "T12:00:00Z").getTime() -
            new Date(a.appointment_date + "T12:00:00Z").getTime()) /
          86400000;
        d.appointments
          .filter(
            (x) =>
              x.id === a.id ||
              (p.p_future &&
                a.recurrence_series_id &&
                x.recurrence_series_id === a.recurrence_series_id &&
                x.appointment_date >= a.appointment_date &&
                ["Geplant", "Verschoben"].includes(x.status)),
          )
          .forEach((x) => {
            const dt = new Date(x.appointment_date + "T12:00:00Z");
            dt.setUTCDate(dt.getUTCDate() + delta);
            x.appointment_date = dt.toISOString().slice(0, 10);
            x.start_time = p.p_time;
            x.status = "Verschoben";
          });
        break;
      }
      case "cancel_visit": {
        const a = getA(p.p_appointment);
        if (d.treatments.some((t) => t.appointment_id === a.id))
          throw Error("Besuche mit Behandlungen bleiben erhalten.");
        if (p.p_delete) {
          d.appointments = d.appointments.filter((x) => x.id !== a.id);
          d.appointment_customers = d.appointment_customers.filter(
            (m) => m.appointment_id !== a.id,
          );
        } else a.status = "Abgesagt";
        break;
      }
    }
    this.persist();
    return result;
  }
}
