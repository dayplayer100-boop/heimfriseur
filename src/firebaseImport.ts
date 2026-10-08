import { splitFirebaseData } from "./firebaseData";
import { workflowMigrationPlan } from "./firebaseMigrationPlan";
export { assertFirebaseData } from "./firebaseData";
export function prepareFirebaseImport(
  ...args: Parameters<typeof splitFirebaseData>
) {
  const split = splitFirebaseData(...args);
  const plan = workflowMigrationPlan(
    [...split.records.values()],
    [...split.finances.values()],
    [...split.paymentContacts.values()],
  );
  return {
    records: new Map(plan.rows.map((r) => [r._table + "~" + r.id, r])),
    finances: new Map(plan.money.map((r) => [r.treatment_id, r])),
    paymentContacts: new Map(plan.protectedContacts.map((r) => [r.id, r])),
    guards: plan.guards,
  };
}
