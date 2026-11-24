import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { SOUND_OPTIONS } from "@/lib/sounds";
import { supportsVibration } from "@/lib/haptics";
import type { AppSettings } from "@/lib/data";

export type TimerSettingKey =
  "pomodoro_focus_minutes" | "pomodoro_short_break_minutes" | "pomodoro_long_break_minutes";

export type TimerPreferences = {
  longBreakAfter: number;
  targetCount: number;
  workSound: string;
  breakSound: string;
  chronometerSound: boolean;
  completionNotifications: boolean;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

export function TimerSettingsPanel({
  open,
  onOpenChange,
  settings,
  preferences,
  onSaveSetting,
  onChangePreference,
  notificationHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings | undefined;
  preferences: TimerPreferences;
  onSaveSetting: (key: TimerSettingKey, value: number) => void;
  onChangePreference: <K extends keyof TimerPreferences>(
    key: K,
    value: TimerPreferences[K],
  ) => void;
  notificationHint: string;
}) {
  const isMobile = useIsMobile();
  const content = (
    <div className="space-y-1">
      <MinuteRow
        label="Work interval"
        value={settings?.pomodoro_focus_minutes ?? 25}
        min={1}
        max={120}
        onChange={(value) => onSaveSetting("pomodoro_focus_minutes", value)}
      />
      <MinuteRow
        label="Short break"
        value={settings?.pomodoro_short_break_minutes ?? 5}
        min={1}
        max={60}
        onChange={(value) => onSaveSetting("pomodoro_short_break_minutes", value)}
      />
      <MinuteRow
        label="Long break"
        value={settings?.pomodoro_long_break_minutes ?? 15}
        min={1}
        max={60}
        onChange={(value) => onSaveSetting("pomodoro_long_break_minutes", value)}
      />
      <NumberRow
        label="Long break after"
        value={preferences.longBreakAfter}
        suffix="intervals"
        min={1}
        max={12}
        onChange={(value) => onChangePreference("longBreakAfter", value)}
      />
      <NumberRow
        label="Target"
        value={preferences.targetCount}
        suffix="pomodoros"
        min={1}
        max={30}
        onChange={(value) => onChangePreference("targetCount", value)}
      />
      <SoundRow
        label="Work completed sound"
        value={preferences.workSound}
        onChange={(value) => onChangePreference("workSound", value)}
      />
      <SoundRow
        label="End break sound"
        value={preferences.breakSound}
        onChange={(value) => onChangePreference("breakSound", value)}
      />
      <ToggleRow
        label="Chronometer sound"
        checked={preferences.chronometerSound}
        onCheckedChange={(value) => onChangePreference("chronometerSound", value)}
      />
      {supportsVibration() && (
        <ToggleRow
          label="Vibration"
          checked={preferences.hapticsEnabled}
          onCheckedChange={(value) => onChangePreference("hapticsEnabled", value)}
        />
      )}
      <ToggleRow
        label="Sound"
        checked={preferences.soundEnabled}
        onCheckedChange={(value) => onChangePreference("soundEnabled", value)}
      />
      <div>
        <ToggleRow
          label="Completion notifications"
          checked={preferences.completionNotifications}
          onCheckedChange={(value) => onChangePreference("completionNotifications", value)}
        />
        {notificationHint && (
          <p className="px-1 text-xs text-muted-foreground">{notificationHint}</p>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Timer settings</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Timer settings</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function MinuteRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const choices = [15, 25, 30, 45, 50];
  return (
    <div className="border-b py-2.5 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Custom
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
            }}
            aria-label={`${label} custom minutes`}
            className="h-9 w-16 rounded-lg border bg-cell px-2 text-center text-sm text-foreground"
          />
          min
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {choices
          .filter((choice) => choice >= min && choice <= max)
          .map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={value === choice}
              onClick={() => onChange(choice)}
              className={`min-h-9 rounded-lg px-3 text-sm transition-colors duration-150 ${
                value === choice
                  ? "bg-primary text-primary-foreground"
                  : "bg-cell text-muted-foreground hover:text-foreground"
              }`}
            >
              {choice}
            </button>
          ))}
      </div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
          }}
          aria-label={label}
          className="h-9 w-16 rounded-lg border bg-cell px-2 text-center text-sm text-foreground"
        />
        {suffix}
      </label>
    </div>
  );
}

export function RoundStepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEBE1] text-[#16865F] transition-[transform,background-color] duration-150 hover:bg-[#CFE3D5] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#EDF3EF] disabled:text-[#16865F]/50 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

function SoundRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-36 rounded-xl bg-cell">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOUND_OPTIONS.map((sound) => (
            <SelectItem key={sound.id} value={sound.id}>
              {sound.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
