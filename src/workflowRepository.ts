import {
  emptyData,
  type Data,
  type Table,
  type Row,
  type Appointment,
} from "./types";
import { today, addWeeks, customerDue, effectivePrice } from "./domain";
export class WorkflowRepository {
  data: Data;
  constructor(
    data: Data,
    private actorId = "demo",
    private ownerId = actorId,
  ) {
    this.data = structuredClone(data);
  }
  persist() {
    /* Persistence is supplied by the caller's transaction. */
  }
  base(id: string = crypto.randomUUID()) {
    return { id, user_id: this.ownerId, created_at: new Date().toISOString() };
  }
  save(table: Table, input: Record<string, unknown>) {
    const rows = this.data[table] as Row[];
    const row = {
      ...this.base(),
      ...Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ),
    } as Row;
    const idx = rows.findIndex((x) => x.id === row.id);
    if (idx >= 0)
      rows[idx] = { ...rows[idx], ...row, created_at: rows[idx].created_at };
    else rows.push(row);
    if (idx < 0 && table === "facilities")
      for (const service of this.data.services) {
        const first = this.data.facilities.find(
          (f) => f.id !== row.id && !f.is_provisional,
        );
        this.data.facility_service_prices.push({
          ...this.base(),
          facility_id: row.id,
          service_id: service.id,
          price: effectivePrice(this.data, service.id, first?.id),
        });
      }
    if (idx < 0 && table === "services")
      for (const facility of this.data.facilities)
        this.data.facility_service_prices.push({
          ...this.base(),
          facility_id: facility.id,
          service_id: row.id,
          price: Number((row as any).price),
        });
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
    const index = (this.data[table] as Row[]).findIndex((r) => r.id === id);
    if (index < 0) throw Error("Datensatz nicht gefunden.");
    (this.data[table] as Row[]).splice(index, 1);
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
      case "save_group_flexible": {
        const input = { ...p.p_data };
        if (!input.facility_id) {
          const c = await this.rpc("save_customer", {
            p_data: {},
            p_services: [],
          });
          input.facility_id = d.customers.find((k) => k.id === c)!.facility_id;
          d.customers = d.customers.filter((k) => k.id !== c);
        }
        result = this.save("groups", {
          ...input,
          name: input.name || "Wohnbereich (Name noch offen)",
        });
        break;
      }
      case "save_customer": {
        const input = { ...p.p_data };
        if (!input.facility_id) {
          let f = d.facilities.find((f) => f.is_provisional);
          if (!f) {
            const fid = this.save("facilities", {
              name: "Einrichtung noch offen",
              is_provisional: true,
            });
            f = d.facilities.find((f) => f.id === fid)!;
          }
          input.facility_id = f.id;
        }
        if (!input.group_id) {
          let g = d.groups.find(
            (g) => g.facility_id === input.facility_id && g.is_general,
          );
          if (!g) {
            const gid = this.save("groups", {
              facility_id: input.facility_id,
              name: "Allgemein / später zuordnen",
              is_general: true,
              recurrence_weeks: 5,
              preferred_weekday: 2,
              preferred_start_time: "09:00",
            });
            g = d.groups.find((g) => g.id === gid)!;
          }
          input.group_id = g.id;
        }
        result = this.save("customers", {
          first_name: "",
          last_name: "",
          room_number: "",
          status: "Aktiv",
          hair_request: "Unbekannt",
          notes: "",
          ...input,
        });
        d.customer_default_services = d.customer_default_services.filter(
          (x) => x.customer_id !== result,
        );
        p.p_services.forEach((id: string) =>
          d.customer_default_services.push({
            ...this.base(),
            customer_id: result,
            service_id: id,
          }),
        );
        break;
      }
      case "complete_setup":
        break;
      case "save_facility_price_list": {
        const f = d.facilities.find((f) => f.id === p.p_facility);
        if (!f) throw Error("Heim nicht gefunden.");
        const first = d.facilities.find((f) => !f.is_provisional);
        for (const [id, value] of Object.entries(p.p_prices)) {
          const service = d.services.find((s) => s.id === id);
          const price = Number(value);
          if (!service || !Number.isFinite(price) || price < 0)
            throw Error("Ungültiger Preis.");
          const facilities =
            f.id === first?.id
              ? d.facilities.filter(
                  (x) => x.id === f.id || !x.price_list_customized,
                )
              : [f];
          for (const target of facilities) {
            const existing = d.facility_service_prices.find(
              (x) => x.facility_id === target.id && x.service_id === id,
            );
            this.save("facility_service_prices", {
              id: existing?.id,
              facility_id: target.id,
              service_id: id,
              price,
            });
          }
          if (f.id === first?.id) service.price = price;
        }
        f.price_list_customized = true;
        break;
      }
      case "plan_customer_visit": {
        result = await this.rpc("plan_visit_flexible", {
          ...p,
          p_all: p.p_all && !p.p_customer,
          p_options: { cohort_id: p.p_cohort },
        });
        if (p.p_customer) {
          await this.rpc("add_visit_customer", {
            p_appointment: result,
            p_customer: p.p_customer,
          });
          getA(result).selected_customer_id = p.p_customer;
        }
        break;
      }
      case "plan_visit_flexible": {
        let g = d.groups.find((g) => g.id === p.p_group);
        if (!g) {
          const fid =
            p.p_facility ||
            d.facilities[0]?.id ||
            this.save("facilities", { name: "Einrichtung noch offen" });
          g = d.groups.find((g) => g.facility_id === fid && g.is_general);
          if (!g) {
            const gid = this.save("groups", {
              facility_id: fid,
              name: "Allgemein / später zuordnen",
              recurrence_weeks: 5,
              preferred_start_time: "09:00",
              preferred_weekday: 2,
              is_general: true,
            });
            g = d.groups.find((g) => g.id === gid)!;
          }
        }
        result = await this.rpc("plan_visit", {
          ...p,
          p_group: g.id,
          p_series: p.p_options?.series_id,
          p_all: false,
        });
        const a = getA(result);
        a.auto_include_due = p.p_all;
        a.all_groups = !p.p_group || p.p_options?.all_groups;
        a.cohort_id = p.p_options?.cohort_id;
        if (p.p_all)
          d.customers
            .filter(
              (c) =>
                c.facility_id === a.facility_id &&
                (a.all_groups || c.group_id === a.group_id) &&
                (!a.cohort_id || c.cohort_id === a.cohort_id) &&
                customerDue(d, c, a.appointment_date),
            )
            .forEach((c, i) =>
              d.appointment_customers.push({
                ...this.base(),
                appointment_id: a.id,
                customer_id: c.id,
                status: "Offen",
                sort_order: i,
                entry_type: "Regulär",
              }),
            );
        break;
      }
      case "plan_visit": {
        const g = d.groups.find((g) => g.id === p.p_group)!;
        const a: Appointment = {
          ...this.base(),
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
                ...this.base(),
                appointment_id: a.id,
                customer_id: c.id,
                status: "Offen",
                sort_order: i,
              }),
            );
        result = a.id;
        break;
      }
      case "add_customer_to_visit":
        await this.rpc("add_visit_customer", p);
        d.appointment_customers.find(
          (m) =>
            m.appointment_id === p.p_appointment &&
            m.customer_id === p.p_customer,
        )!.entry_type = p.p_entry_type || "Spontan";
        break;
      case "add_visit_customer":
        if (
          !d.appointment_customers.some(
            (m) =>
              m.appointment_id === p.p_appointment &&
              m.customer_id === p.p_customer,
          )
        )
          d.appointment_customers.push({
            ...this.base(),
            appointment_id: p.p_appointment,
            customer_id: p.p_customer,
            status: "Offen",
            sort_order: d.appointment_customers.length,
          });
        break;
      case "start_treatment": {
        const m = d.appointment_customers.find((m) => m.id === p.p_member)!;
        const running = d.treatments.find(
          (t) =>
            !t.end_time &&
            (t.performed_by === this.actorId ||
              t.customer_id === m.customer_id),
        );
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
          ...this.base(),
          performed_by: this.actorId,
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
                ...this.base(),
                treatment_id: t.id,
                service_id: s.id,
                service_name_snapshot: s.name,
                price_snapshot: effectivePrice(d, s.id, a.facility_id),
                duration_minutes_snapshot: s.duration_minutes,
              });
              t.total_price += effectivePrice(d, s.id, a.facility_id);
            }
          });
        m.status = "In Behandlung";
        a.status = "In Bearbeitung";
        a.actual_start_time ||= t.start_time;
        result = t.id;
        break;
      }
      case "save_treatment": {
        const t = d.treatments.find((t) => t.id === p.p_treatment);
        if (!t) throw Error("Behandlung nicht gefunden.");
        if (!t.end_time && t.performed_by && t.performed_by !== this.actorId)
          throw Error("Diese Behandlung gehört einer anderen Person.");
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
              ...this.base(),
              treatment_id: t.id,
              service_id: id,
              service_name_snapshot: s.name,
              price_snapshot: effectivePrice(
                d,
                s.id,
                getA(t.appointment_id).facility_id,
              ),
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
            ...this.base(),
            ...p.p_formula,
            customer_id: t.customer_id,
            treatment_id: t.id,
            formula_date: today(),
          });
        }
        if (p.p_finish) {
          const c = d.customers.find((c) => c.id === t.customer_id)!;
          c.next_due_date = addWeeks(
            c.rhythm_anchor_date || getA(t.appointment_id).appointment_date,
            c.recurrence_weeks ||
              d.cohorts.find((g) => g.id === c.cohort_id)?.recurrence_weeks ||
              d.groups.find((g) => g.id === c.group_id)?.recurrence_weeks ||
              5,
          );
          while (c.next_due_date <= getA(t.appointment_id).appointment_date)
            c.next_due_date = addWeeks(
              c.next_due_date,
              c.recurrence_weeks ||
                d.cohorts.find((co) => co.id === c.cohort_id)
                  ?.recurrence_weeks ||
                d.groups.find((g) => g.id === c.group_id)?.recurrence_weeks ||
                5,
            );
          c.temporary_due_date = null;
          c.rhythm_anchor_date = null;
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
      case "reschedule_customer_once": {
        const c = d.customers.find((c) => c.id === p.p_customer);
        if (!c || c.status !== "Aktiv" || c.hair_request === "Nein")
          throw Error("Bitte einen aktiven Kunden wählen.");
        if (p.p_date < today())
          throw Error("Bitte einen heutigen oder zukünftigen Termin wählen.");
        if (d.treatments.some((t) => t.customer_id === c.id && !t.end_time))
          throw Error("Bitte zuerst die laufende Behandlung beenden.");
        const existing = d.appointments.find(
          (a) =>
            a.appointment_date === p.p_date &&
            a.start_time === p.p_time &&
            ["Geplant", "Verschoben"].includes(a.status) &&
            d.appointment_customers.some(
              (m) =>
                m.appointment_id === a.id &&
                m.customer_id === c.id &&
                m.status === "Offen",
            ),
        );
        if (c.temporary_due_date === p.p_date && existing) {
          result = existing.id;
          break;
        }
        const source = d.appointment_customers
          .filter(
            (m) =>
              m.customer_id === c.id &&
              m.status === "Offen" &&
              getA(m.appointment_id).appointment_date >= today(),
          )
          .sort((a, b) =>
            getA(a.appointment_id).appointment_date.localeCompare(
              getA(b.appointment_id).appointment_date,
            ),
          )[0];
        const anchor =
          c.rhythm_anchor_date ||
          c.next_due_date ||
          (source ? getA(source.appointment_id).appointment_date : p.p_date);
        if (source) {
          source.status = "Nicht durchgeführt";
          source.non_completion_reason =
            p.p_date < anchor ? "Vorgezogen" : "Einmalig verschoben";
          source.followup_date = p.p_date;
        }
        c.rhythm_anchor_date = anchor;
        c.temporary_due_date = p.p_date;
        result = await this.rpc("plan_customer_visit", {
          p_facility: c.facility_id,
          p_group: c.group_id,
          p_customer: c.id,
          p_date: p.p_date,
          p_time: p.p_time,
          p_weeks: null,
          p_all: false,
        });
        const target = d.appointment_customers.find(
          (m) => m.appointment_id === result && m.customer_id === c.id,
        );
        if (target)
          target.entry_type = p.p_date < anchor ? "Vorgezogen" : "Verschoben";
        break;
      }
      case "skip_customer_choice": {
        const m = d.appointment_customers.find((m) => m.id === p.p_member)!;
        const a = getA(m.appointment_id),
          c = d.customers.find((c) => c.id === m.customer_id)!;
        const anchor =
          c.rhythm_anchor_date || c.next_due_date || a.appointment_date;
        let next = p.p_date;
        const weeks =
          c.recurrence_weeks ||
          d.cohorts.find((co) => co.id === c.cohort_id)?.recurrence_weeks ||
          d.groups.find((g) => g.id === c.group_id)?.recurrence_weeks ||
          5;
        if (p.p_choice === "next_visit")
          next =
            d.appointments
              .filter(
                (v) =>
                  v.facility_id === a.facility_id &&
                  (v.all_groups || v.group_id === c.group_id) &&
                  v.appointment_date > a.appointment_date &&
                  ["Geplant", "Verschoben"].includes(v.status),
              )
              .sort((a, b) =>
                a.appointment_date.localeCompare(b.appointment_date),
              )[0]?.appointment_date ||
            addWeeks(
              a.appointment_date,
              d.facilities.find((f) => f.id === a.facility_id)
                ?.visit_recurrence_weeks || 1,
            );
        else if (p.p_choice === "regular") {
          next = anchor;
          while (next <= a.appointment_date) next = addWeeks(next, weeks);
        }
        if (p.p_choice !== "unknown" && (!next || next <= a.appointment_date))
          throw Error("Bitte einen Termin nach dem Besuch wählen.");
        await this.rpc("skip_customer", {
          p_member: m.id,
          p_reason: p.p_reason,
        });
        m.followup_date = next;
        c.temporary_due_date = next;
        c.rhythm_anchor_date = anchor;
        break;
      }
      case "skip_customer_followup": {
        await this.rpc("skip_customer", p);
        const m = d.appointment_customers.find((m) => m.id === p.p_member)!;
        m.followup_date = p.p_next_date;
        d.customers.find((c) => c.id === m.customer_id)!.next_due_date =
          p.p_next_date;
        break;
      }
      case "set_facility_price": {
        const old = d.facility_service_prices.find(
          (s) => s.facility_id === p.p_facility && s.service_id === p.p_service,
        );
        if (p.p_price === null) {
          d.facility_service_prices = d.facility_service_prices.filter(
            (s) => s.id !== old?.id,
          );
        } else
          this.save("facility_service_prices", {
            id: old?.id || crypto.randomUUID(),
            facility_id: p.p_facility,
            service_id: p.p_service,
            price: p.p_price,
          });
        break;
      }
      case "save_cohort":
        result = this.save("cohorts", p.p_data);
        break;
      case "save_payment_method":
        result = this.save("payment_methods", {
          id: p.p_id || crypto.randomUUID(),
          name: p.p_name,
          is_active: p.p_active ?? true,
        });
        break;
      case "save_billing": {
        const old = d.customer_billing.find(
          (b) => b.customer_id === p.p_customer,
        );
        result = this.save("customer_billing", {
          ...old,
          ...p.p_data,
          customer_id: p.p_customer,
        });
        break;
      }
      case "record_payment": {
        const t = d.treatments.find((t) => t.id === p.p_treatment)!;
        const b = d.customer_billing.find(
          (b) => b.customer_id === t.customer_id,
        );
        const old = d.treatment_payments.find((x) => x.treatment_id === t.id);
        result = this.save("treatment_payments", {
          id: old?.id || crypto.randomUUID(),
          treatment_id: t.id,
          ...p.p_data,
          method_name_snapshot:
            d.payment_methods.find((m) => m.id === p.p_data.payment_method_id)
              ?.name || "Noch offen",
          billing_name_snapshot: b?.billing_name || "",
          billing_address_snapshot: [b?.street, b?.postal_code, b?.city]
            .filter(Boolean)
            .join(" "),
          amount: t.total_price,
          recorded_by: this.actorId,
          recorded_at: new Date().toISOString(),
        });
        break;
      }
      case "submit_feedback":
        result = this.save("feedback", {
          created_by: this.actorId,
          category: p.p_category,
          message: p.p_message,
          route: p.p_route,
          status: "Offen",
        });
        break;
      case "resolve_feedback":
        this.save("feedback", { id: p.p_id, status: "Erledigt" });
        break;
      case "complete_onboarding":
        break;
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
        if (a.status === "Abgeschlossen") return null;
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
            result = await this.rpc("plan_visit_flexible", {
              p_facility: a.facility_id,
              p_group: a.all_groups ? null : a.group_id,
              p_options: {
                series_id: a.recurrence_series_id,
                cohort_id: a.cohort_id,
              },
              p_date: next,
              p_time: a.start_time,
              p_weeks: a.recurrence_weeks,
              p_series: a.recurrence_series_id,
              p_all: a.auto_include_due ?? true,
            });
          if (a.selected_customer_id) {
            const future = getA(result);
            future.selected_customer_id = a.selected_customer_id;
            const c = d.customers.find((c) => c.id === a.selected_customer_id);
            if (c?.status === "Aktiv" && c.hair_request !== "Nein")
              await this.rpc("add_visit_customer", {
                p_appointment: result,
                p_customer: a.selected_customer_id,
              });
          }
        }
        break;
      }
      case "move_visit": {
        const a = getA(p.p_appointment);
        if (
          !["Geplant", "Verschoben"].includes(a.status) ||
          a.appointment_date < today()
        )
          throw Error(
            "Begonnene oder vergangene Besuche können nicht verschoben werden.",
          );
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
      default:
        throw Error("Diese Aktion ist nicht verfügbar.");
    }
    this.persist();
    return result;
  }
}
