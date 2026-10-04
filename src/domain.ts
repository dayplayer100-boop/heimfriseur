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
  `${c.first_name} ${c.last_name}`;
export function customerDefaults(d: Data, id: string) {
  return d.customer_default_services
    .filter((x) => x.customer_id === id)
    .flatMap((x) =>
      d.services.filter((s) => s.id === x.service_id && s.is_active),
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
    revenue: completed.reduce((s, t) => s + Number(t.total_price), 0),
    material: completed.reduce((s, t) => s + Number(t.material_cost), 0),
    treatment: completed.reduce((s, t) => s + Number(t.duration_minutes), 0),
    planned: members
      .filter((m) => m.status !== "Nicht durchgeführt")
      .reduce(
        (s, m) =>
          s +
          (completed.find((t) => t.appointment_customer_id === m.id)
            ?.total_price ??
            customerDefaults(d, m.customer_id).reduce(
              (n, x) => n + Number(x.price),
              0,
            )),
        0,
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
  const revenue = completed.reduce((s, t) => s + Number(t.total_price), 0),
    material = completed.reduce((s, t) => s + Number(t.material_cost), 0),
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
    net: revenue - material,
    work,
    treatment,
    perCustomer: completed.length ? revenue / completed.length : 0,
    perHour: work ? revenue / (work / 60) : 0,
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
