export function auditView(value: Record<string, any>) {
  const created = value.created_at;
  return {
    ...value,
    created_at: created?.toDate ? created.toDate().toISOString() : created,
  };
}
