import assert from "node:assert/strict";
import {
  euroInputToCents,
  sumCents,
  shiftCalendarMonth,
  validTreatmentDuration,
} from "./solution-examples.ts";
assert.equal(
  sumCents([euroInputToCents("0,10"), euroInputToCents("0.20")]),
  30,
);
assert.equal(euroInputToCents("18,50"), 1850);
assert.throws(() => euroInputToCents("1.005"));
assert.throws(() => euroInputToCents("-1"));
assert.throws(() => euroInputToCents("999999999999999999999"));
assert.equal(shiftCalendarMonth("2026-01-31", 1), "2026-02-01");
assert.equal(shiftCalendarMonth("2026-03-31", -1), "2026-02-01");
assert.equal(shiftCalendarMonth("2026-12-31", 1), "2027-01-01");
assert.equal(
  validTreatmentDuration("2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z"),
  60,
);
assert.throws(() =>
  validTreatmentDuration("2026-10-07T09:00:00Z", "1900-01-01T00:00:00Z"),
);
console.log(
  "PASS: proposal examples, exact cents, invalid values, month ends, year change and DST instant duration",
);
