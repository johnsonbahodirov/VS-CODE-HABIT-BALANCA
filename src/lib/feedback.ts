import { toast } from "sonner";
import { COPY } from "@/lib/strings";

let latestUndoToastId: string | number | undefined;

export function friendlyErrorMessage(error: unknown): string {
  console.error("Habit Balance request failed", error);
  if (
    error instanceof Error &&
    error.message === "Habit entries can only be changed within 30 hours."
  ) {
    return COPY.errors.completionWindow;
  }
  return COPY.errors.saveFailed;
}

export function showFriendlyError(error: unknown): void {
  toast.error(friendlyErrorMessage(error), { duration: 5000 });
}

export function showUndoToast(message: string, onUndo: () => void): void {
  if (latestUndoToastId !== undefined) toast.dismiss(latestUndoToastId);
  latestUndoToastId = toast(message, {
    duration: 5000,
    action: {
      label: COPY.toast.undo,
      onClick: onUndo,
    },
  });
}

export function dismissUndoToast(): void {
  if (latestUndoToastId !== undefined) toast.dismiss(latestUndoToastId);
  latestUndoToastId = undefined;
}
