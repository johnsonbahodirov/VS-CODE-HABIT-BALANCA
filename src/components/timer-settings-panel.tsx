import { useEffect, useMemo, useRef, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { SOUND_OPTIONS } from "@/lib/sounds";
import type { AppSettings } from "@/lib/data";

type SettingKey =
  "pomodoro_focus_minutes" | "pomodoro_short_break_minutes" | "pomodoro_long_break_minutes";

export type TimerPreferences = {
  longBreakAfter: number;
  targetCount: number;
  workSound: string;
  breakSound: string;
  chronometerSound: boolean;
  completionNotifications: boolean;
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
  onSaveSetting: (key: SettingKey, value: number) => void;
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
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <NumberWheel
        value={value}
        min={min}
        max={max}
        suffix="min"
        onChange={onChange}
        ariaLabel={label}
      />
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
      <NumberWheel
        value={value}
        min={min}
        max={max}
        suffix={suffix}
        onChange={onChange}
        ariaLabel={label}
      />
    </div>
  );
}

function NumberWheel({
  value,
  min,
  max,
  suffix,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const values = useMemo(() => {
    const next = Array.from({ length: max - min + 1 }, (_, index) => min + index);
    if (!next.includes(value)) next.push(value);
    return next.sort((left, right) => left - right);
  }, [max, min, value]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const index = values.indexOf(value);
      wheelRef.current?.scrollTo({ top: Math.max(0, index * 36), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, value, values]);

  const snapToScroll = () => {
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const wheel = wheelRef.current;
      if (!wheel) return;
      const index = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / 36)));
      wheel.scrollTo({ top: index * 36, behavior: "smooth" });
      const nextValue = values[index];
      if (nextValue !== undefined && nextValue !== value) onChange(nextValue);
    }, 90);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = values.indexOf(value);
    const nextIndex =
      event.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(values.length - 1, index + 1);
    const nextValue = values[nextIndex];
    if (nextValue === undefined) return;
    onChange(nextValue);
    wheelRef.current?.scrollTo({ top: nextIndex * 36, behavior: "smooth" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${ariaLabel}: ${value} ${suffix}`}
          className="h-9 min-w-28 rounded-xl border bg-cell px-3 text-center text-sm font-medium"
        >
          {value} {suffix}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        onKeyDown={handleKeyDown}
        className="z-[70] w-32 rounded-2xl border bg-surface p-2 shadow-lg"
      >
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1 right-1 top-[72px] h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20"
          />
          <div
            ref={wheelRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={0}
            onScroll={snapToScroll}
            className="relative h-[180px] overflow-y-auto overscroll-contain py-[72px] text-center scroll-smooth [scroll-snap-type:y_mandatory] [scrollbar-width:none] motion-reduce:scroll-auto"
          >
            {values.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={item === value}
                key={item}
                onClick={() => {
                  onChange(item);
                  wheelRef.current?.scrollTo({ top: index * 36, behavior: "smooth" });
                }}
                className={`block h-9 w-full scroll-mt-0 snap-center text-sm transition-all motion-reduce:transition-none ${
                  item === value
                    ? "scale-100 font-bold text-primary"
                    : "scale-90 text-muted-foreground/70"
                }`}
              >
                {item} {suffix}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEBE1] text-[#16865F] transition-all hover:bg-[#CFE3D5] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#EDF3EF] disabled:text-[#16865F]/50 motion-reduce:transition-none"
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
