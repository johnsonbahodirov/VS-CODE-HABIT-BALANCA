import { describe, expect, it } from "vitest";
import { isSupabaseSchemaError } from "@/lib/database-errors";

describe("Supabase schema error detection", () => {
  it("recognizes missing PostgREST tables and functions", () => {
    expect(isSupabaseSchemaError({ code: "PGRST205" })).toBe(true);
    expect(isSupabaseSchemaError({ code: "PGRST202" })).toBe(true);
    expect(isSupabaseSchemaError({ code: "PGRST204" })).toBe(true);
  });

  it("recognizes missing PostgreSQL tables and columns", () => {
    expect(isSupabaseSchemaError({ code: "42P01" })).toBe(true);
    expect(isSupabaseSchemaError({ code: "42703" })).toBe(true);
  });

  it("does not mistake network or authorization errors for missing migrations", () => {
    expect(isSupabaseSchemaError(new Error("network unavailable"))).toBe(false);
    expect(isSupabaseSchemaError({ code: "42501" })).toBe(false);
    expect(isSupabaseSchemaError(null)).toBe(false);
  });
});
