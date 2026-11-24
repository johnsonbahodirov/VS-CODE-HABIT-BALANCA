import { afterEach, describe, expect, it, vi } from "vitest";
import { playOptionalSound, supportsVibration, vibrate } from "@/lib/haptics";

const originalVibrate = Object.getOwnPropertyDescriptor(navigator, "vibrate");

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  if (originalVibrate) {
    Object.defineProperty(navigator, "vibrate", originalVibrate);
  } else {
    Reflect.deleteProperty(navigator, "vibrate");
  }
});

describe("optional feedback", () => {
  it("vibrates only when supported and enabled", () => {
    const vibration = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibration,
    });
    localStorage.setItem(
      "balance-pomodoro",
      JSON.stringify({ timerPreferences: { hapticsEnabled: true } }),
    );

    expect(supportsVibration()).toBe(true);
    vibrate([30, 50, 30]);
    expect(vibration).toHaveBeenCalledWith([30, 50, 30]);
  });

  it("does not vibrate when disabled or unsupported", () => {
    const vibration = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibration,
    });
    vibrate(15);
    expect(vibration).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: undefined,
    });
    expect(supportsVibration()).toBe(false);
  });

  it("does not construct audio while sound is disabled", () => {
    const audio = vi.fn();
    vi.stubGlobal("Audio", audio);

    playOptionalSound("habit-complete");

    expect(audio).not.toHaveBeenCalled();
  });
});
