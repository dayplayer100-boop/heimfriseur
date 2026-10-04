import { describe, it, expect } from "vitest";
import { addWeeks, metrics, visitStats } from "../src/domain";
import { emptyData } from "../src/types";
describe("recurrence and metrics", () => {
  it("handles 5-week rhythm, year changes and daylight saving without drift", () => {
    expect(addWeeks("2026-10-06", 5)).toBe("2026-11-10");
    expect(addWeeks("2026-11-10", 5)).toBe("2026-12-15");
    expect(addWeeks("2026-12-15", 5)).toBe("2027-01-19");
    expect(addWeeks("2026-03-01", 4)).toBe("2026-03-29");
  });
  it("rejects invalid rhythm", () => {
    expect(() => addWeeks("2026-10-06", 0)).toThrow();
  });
  it("never divides by zero", () => {
    const m = metrics([], []);
    expect(m.perHour).toBe(0);
    expect(m.perCustomer).toBe(0);
    expect(m.average).toBe(0);
  });
  it("counts only finished treatments and subtracts material correctly", () => {
    const t = {
      id: "t",
      user_id: "u",
      appointment_id: "a",
      appointment_customer_id: "m",
      customer_id: "c",
      start_time: "2026-10-06T07:00:00Z",
      end_time: "2026-10-06T07:30:00Z",
      duration_minutes: 30,
      total_price: 40,
      material_cost: 8.2,
      notes: "",
    };
    const a = {
      id: "a",
      user_id: "u",
      facility_id: "f",
      group_id: "g",
      appointment_date: "2026-10-06",
      start_time: "09:00",
      status: "Abgeschlossen",
      recurrence_weeks: 5,
      recurrence_series_id: "s",
      actual_start_time: "2026-10-06T07:00:00Z",
      actual_end_time: "2026-10-06T08:00:00Z",
    };
    const m = metrics([t, { ...t, id: "open", end_time: null }], [a]);
    expect(m.customers).toBe(1);
    expect(m.net).toBeCloseTo(31.8);
    expect(m.perHour).toBe(40);
    const d = emptyData();
    d.appointments = [a];
    d.treatments = [t];
    expect(visitStats(d, a).revenue).toBe(40);
  });
});
