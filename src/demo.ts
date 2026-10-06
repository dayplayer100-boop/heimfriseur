import {
  emptyData,
  type Data,
  type Table,
  type Row,
  type Appointment,
} from "./types";
import { today, addWeeks } from "./domain";
import { WorkflowRepository } from "./workflowRepository";
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
  d.payment_methods = [
    { ...base("pay-cash"), name: "Barzahlung", is_active: true },
    { ...base("pay-bank"), name: "Überweisung", is_active: true },
    { ...base("pay-home"), name: "Heimkonto", is_active: true },
  ];
  return d;
}
export class DemoRepository extends WorkflowRepository {
  constructor() {
    const data = {
      ...emptyData(),
      ...(JSON.parse(sessionStorage.getItem("heimfriseur-demo") || "null") ||
        demoSeed()),
    };
    if (!data.payment_methods.length)
      data.payment_methods = demoSeed().payment_methods;
    super(data);
  }
  override persist() {
    sessionStorage.setItem("heimfriseur-demo", JSON.stringify(this.data));
  }
}
