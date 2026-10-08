import type { Data } from "./types";
export const VISIT_GUARD_SHARDS = 6;
export function visitShard(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % VISIT_GUARD_SHARDS;
}
export function visitGuards(data: Data) {
  const result = new Map<
    string,
    {
      appointment_id: string;
      shard: number;
      pending_ids: string[];
      _facility_id: string;
    }
  >();
  for (const a of data.appointments) {
    for (let shard = 0; shard < VISIT_GUARD_SHARDS; shard++) {
      result.set(`${a.id}~${shard}`, {
        appointment_id: a.id,
        shard,
        _facility_id: a.facility_id,
        pending_ids: data.appointment_customers
          .filter(
            (m) =>
              m.appointment_id === a.id &&
              visitShard(m.id) === shard &&
              ["Offen", "In Behandlung"].includes(m.status),
          )
          .map((m) => m.id)
          .sort(),
      });
    }
  }
  return result;
}
export function treatmentTimes(start: string, end: string | null) {
  const start_ms = Date.parse(start),
    end_ms = end === null ? null : Date.parse(end);
  if (
    !Number.isSafeInteger(start_ms) ||
    (end_ms !== null && (!Number.isSafeInteger(end_ms) || end_ms < start_ms))
  ) {
    throw Object.assign(
      new Error("Behandlungsende muss nach dem Beginn liegen."),
      { code: "HF_INVALID_TIME" },
    );
  }
  return {
    start_ms,
    end_ms,
    duration_ms: end_ms === null ? null : end_ms - start_ms,
  };
}
