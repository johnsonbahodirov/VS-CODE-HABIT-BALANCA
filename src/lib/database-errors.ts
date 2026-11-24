export function isSupabaseSchemaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if (typeof error.code !== "string") return false;

  return ["PGRST202", "PGRST204", "PGRST205", "42P01", "42703"].includes(error.code);
}
