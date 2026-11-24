export type SoundOption = {
  id: string;
  label: string;
  filePath: string | null;
};

export const SOUND_OPTIONS: SoundOption[] = [
  { id: "none", label: "None", filePath: null },
  { id: "default-beep", label: "Default beep", filePath: null },
];

export function playSound(soundId: string): void {
  const sound = SOUND_OPTIONS.find((option) => option.id === soundId);
  if (!sound || sound.id === "none") return;
  if (sound.filePath) {
    const audio = new Audio(sound.filePath);
    void audio.play().catch((error: unknown) => {
      console.error("Could not play the selected timer sound.", error);
    });
    return;
  }
  if (typeof window === "undefined") return;

  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.26);
  oscillator.onended = () => void context.close();
}
