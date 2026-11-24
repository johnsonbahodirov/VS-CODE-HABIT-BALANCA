export type HapticPattern = number | number[];

export function supportsVibration(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnabled(preference: "hapticsEnabled" | "soundEnabled"): boolean {
  try {
    const saved = localStorage.getItem("balance-pomodoro");
    if (!saved) return false;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return false;
    const timerPreferences = parsed["timerPreferences"];
    if (!isRecord(timerPreferences)) return false;
    return timerPreferences[preference] === true;
  } catch {
    return false;
  }
}

export function vibrate(pattern: HapticPattern): void {
  if (!supportsVibration() || !isEnabled("hapticsEnabled")) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration is an optional browser capability.
  }
}

export function playOptionalSound(soundId: string): void {
  if (!isEnabled("soundEnabled")) return;
  const sound = new Audio(`/sounds/${soundId}.mp3`);
  void sound.play().catch(() => {});
}
