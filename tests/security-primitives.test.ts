import { shiftCalendarDate } from "../src/calendarDates";
import { normalizeAppError } from "../src/appErrors";
import { describe, it, expect } from "vitest";
import { eurosToCents, sumCents, sumMoney } from "../src/money";
import {
  treatmentTimes,
  visitGuards,
  visitShard,
} from "../src/firebaseWorkflow";
import { emptyData } from "../src/types";
describe("Security primitives", () => {
  it("keeps February and year changes in the requested month", () => {
    expect(shiftCalendarDate("2026-01-31", "Monat", 1)).toBe("2026-02-01");
    expect(shiftCalendarDate("2024-03-31", "Monat", -1)).toBe("2024-02-01");
    expect(shiftCalendarDate("2026-12-31", "Monat", 1)).toBe("2027-01-01");
    expect(shiftCalendarDate("2026-01-31", "Woche", 1)).toBe("2026-02-07");
  });
  it("returns stable safe errors without exposing sensitive server messages", () => {
    const e = normalizeAppError({
      code: "permission-denied",
      message: "private customer data",
    });
    expect(e.code).toBe("HF_ACCESS_DENIED");
    expect(e.message).not.toContain("private customer data");
    expect(normalizeAppError({ code: "HF_PLAN_INCOMPLETE" }).code).toBe(
      "HF_PLAN_INCOMPLETE",
    );
  });
  it("uses integer cents and rejects hidden precision, infinity and negative prices", () => {
    expect(sumCents([eurosToCents("0,10"), eurosToCents("0.20")])).toBe(30);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(eurosToCents(0.30000000000000004)).toBe(30);
    for (const value of [-1, NaN, Infinity, 1.005])
      expect(() => eurosToCents(value)).toThrow();
  });
  it("rejects negative duration, invalid start and end before start", () => {
    expect(() => treatmentTimes("bad", null)).toThrow();
    expect(() =>
      treatmentTimes("2026-01-01T10:00:00Z", "2026-01-01T09:00:00Z"),
    ).toThrow();
    expect(
      treatmentTimes("2026-01-01T10:00:00Z", "2026-01-01T10:01:00Z")
        .duration_ms,
    ).toBe(60000);
  });
  it("places every pending customer into exactly one of six closure guards", () => {
    const d = emptyData();
    d.appointments.push({ id: "visit", facility_id: "home" } as any);
    for (let i = 0; i < 120; i++)
      d.appointment_customers.push({
        id: "member-" + i,
        appointment_id: "visit",
        status: i % 2 ? "Offen" : "In Behandlung",
      } as any);
    const guards = visitGuards(d);
    expect(guards.size).toBe(6);
    expect([...guards.values()].flatMap((g) => g.pending_ids).length).toBe(120);
    expect(visitShard("member-12")).toBe(visitShard("member-12"));
  });
});
