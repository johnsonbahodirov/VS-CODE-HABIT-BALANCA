import { Button } from "@/components/ui/button";
import { isSupabaseSchemaError } from "@/lib/database-errors";

type DatabaseErrorNoticeProps = {
  title: string;
  error: unknown;
  onRetry: () => void;
};

export function DatabaseErrorNotice({ title, error, onRetry }: DatabaseErrorNoticeProps) {
  const missingSchema = isSupabaseSchemaError(error);

  return (
    <div role="alert" className="rounded-3xl border border-destructive/40 bg-surface p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">
        {missingSchema
          ? "This Supabase project is missing a required database update. In Supabase SQL Editor, apply 0002_progress_gamification.sql, then 0003_friends.sql, and reload the app."
          : "The data could not be loaded. Check your connection and try again."}
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void onRetry()}>
        Try again
      </Button>
    </div>
  );
}
