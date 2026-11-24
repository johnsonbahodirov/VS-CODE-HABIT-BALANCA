import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatabaseErrorNotice } from "@/components/database-error-notice";

describe("DatabaseErrorNotice", () => {
  it("explains how to apply the missing Supabase migrations", () => {
    render(
      <DatabaseErrorNotice
        title="XP data could not be loaded"
        error={{ code: "PGRST205" }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("XP data could not be loaded");
    expect(screen.getByRole("alert")).toHaveTextContent("0002_progress_gamification.sql");
    expect(screen.getByRole("alert")).toHaveTextContent("0003_friends.sql");
  });

  it("retries the failed query on request", () => {
    const onRetry = vi.fn();
    render(
      <DatabaseErrorNotice
        title="Data unavailable"
        error={new Error("offline")}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Check your connection");
  });
});
