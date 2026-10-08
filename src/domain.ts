import { sumMoney, moneyDifference, moneyRate } from "./money";
import type { Appointment, Data, Treatment } from "./types";
export const euro = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(date.length === 10 ? date + "T12:00:00Z" : date));
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const addWeeks = (date: string, weeks: number) => {
  if (!Number.isInteger(weeks) || weeks < 1) throw Error("Ungültiger Rhythmus");
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};
export const minutes = (n: number) => {
  const rounded = Math.max(0, Math.round(n));
  return rounded >= 60
    ? `${Math.floor(rounded / 60)} Std. ${rounded % 60} Min.`
    : `${rounded} Min.`;
};
export const fullName = (c: { first_name: string; last_name: string }) =>
  `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Name noch offen";
export function customerDefaults(d: Data, id: string) {
  return d.customer_default_services
    .filter((x) => x.customer_id === id)
    .flatMap((x) =>
      d.services
        .filter((s) => s.id === x.service_id && s.is_active)
        .map((s) => ({
          ...s,
          price: effectivePrice(
            d,
            s.id,
            d.customers.find((c) => c.id === id)?.facility_id,
          ),
        })),
    );
}
export function visitStats(d: Data, a: Appointment) {
  const members = d.appointment_customers.filter(
    (m) => m.appointment_id === a.id,
  );
  const completed = d.treatments.filter(
    (t) => t.appointment_id === a.id && t.end_time,
  );
  const open = members.filter(
    (m) => m.status === "Offen" || m.status === "In Behandlung",
  );
  return {
    members,
    completed,
    done: members.filter((m) => m.status === "Erledigt").length,
    skipped: members.filter((m) => m.status === "Nicht durchgeführt").length,
    open: open.length,
    revenue: sumMoney(completed.map((t) => t.total_price)),
    material: sumMoney(completed.map((t) => t.material_cost)),
    treatment: completed.reduce((s, t) => s + Number(t.duration_minutes), 0),
    planned: sumMoney(
      members
        .filter((m) => m.status !== "Nicht durchgeführt")
        .map(
          (m) =>
            completed.find((t) => t.appointment_customer_id === m.id)
              ?.total_price ??
            sumMoney(customerDefaults(d, m.customer_id).map((s) => s.price)),
        ),
    ),
    remaining: open.reduce(
      (s, m) =>
        s +
        customerDefaults(d, m.customer_id).reduce(
          (n, x) => n + x.duration_minutes,
          0,
        ),
      0,
    ),
    work: a.actual_start_time
      ? (new Date(a.actual_end_time || Date.now()).getTime() -
          new Date(a.actual_start_time).getTime()) /
        60000
      : 0,
  };
}
export function metrics(ts: Treatment[], as: Appointment[]) {
  const completed = ts.filter((t) => t.end_time);
  const revenue = sumMoney(completed.map((t) => t.total_price)),
    material = sumMoney(completed.map((t) => t.material_cost)),
    treatment = completed.reduce((s, t) => s + Number(t.duration_minutes), 0);
  const visits = as.filter((a) => a.status === "Abgeschlossen");
  const work = visits.reduce(
    (s, a) =>
      s +
      (a.actual_end_time && a.actual_start_time
        ? (new Date(a.actual_end_time).getTime() -
            new Date(a.actual_start_time).getTime()) /
          60000
        : 0),
    0,
  );
  return {
    customers: completed.length,
    visits: visits.length,
    revenue,
    material,
    net: moneyDifference(revenue, material),
    work,
    treatment,
    perCustomer: completed.length ? moneyRate(revenue, completed.length) : 0,
    perHour: work ? moneyRate(revenue, work / 60) : 0,
    average: completed.length ? treatment / completed.length : 0,
  };
}
export function periodRange(
  period: string,
  customStart = today(),
  customEnd = today(),
) {
  const end = today(),
    d = new Date(end + "T12:00:00Z");
  if (period === "Heute") return [end, end];
  if (period === "Diese Woche") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return [d.toISOString().slice(0, 10), end];
  }
  if (period === "Dieses Jahr") return [end.slice(0, 4) + "-01-01", end];
  if (period === "Benutzerdefiniert") return [customStart, customEnd];
  return [end.slice(0, 7) + "-01", end];
}

export function effectivePrice(
  data: Data,
  serviceId: string,
  facilityId?: string,
) {
  return Number(
    data.facility_service_prices?.find(
      (p) => p.service_id === serviceId && p.facility_id === facilityId,
    )?.price ??
      data.services.find((s) => s.id === serviceId)?.price ??
      0,
  );
}
export function customerDue(
  data: Data,
  customer: Data["customers"][number],
  date: string,
) {
  if (customer.status !== "Aktiv" || customer.hair_request === "Nein")
    return false;
  if (customer.temporary_due_date) return customer.temporary_due_date <= date;
  if (customer.next_due_date) return customer.next_due_date <= date;
  const cohort = data.cohorts.find((g) => g.id === customer.cohort_id);
  if (!cohort) return true;
  const days = Math.floor(
    (Date.parse(date + "T12:00Z") -
      Date.parse(cohort.anchor_date + "T12:00Z")) /
      86400000,
  );
  return (
    days >= 0 &&
    Math.floor(days / 7) %
      (customer.recurrence_weeks || cohort.recurrence_weeks) ===
      0
  );
}

export function visitArea(data: Data, appointment: Appointment) {
  const cohort = data.cohorts.find((c) => c.id === appointment.cohort_id);
  if (cohort) return cohort.name;
  return appointment.all_groups
    ? "Alle Wohnbereiche"
    : data.groups.find((g) => g.id === appointment.group_id)?.name ||
        "Wohnbereich noch offen";
}

export function scheduledCustomerLabel(data: Data, appointment: Appointment) {
  if (!appointment.selected_customer_id) return "";
  const customer = data.customers.find(
    (c) => c.id === appointment.selected_customer_id,
  );
  return customer
    ? fullName(customer) +
        (customer.room_number ? " · Zi. " + customer.room_number : "")
    : "";
}
