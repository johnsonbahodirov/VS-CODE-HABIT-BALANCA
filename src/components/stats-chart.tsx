import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type StatsChartPoint = {
  date: string;
  label: string;
  minutes: number;
  completed: number;
};

export default function StatsChart({ data }: { data: StatsChartPoint[] }) {
  const isEmpty = data.every((point) => point.minutes <= 0);
  return (
    <div className="relative size-full">
      {isEmpty && (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No focus time in this period yet. Start a timer on Today to see your trend.
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="minutes-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderRadius: 16,
            }}
            formatter={(value) => [`${value} min`, "Focus"]}
          />
          <Area
            type="monotone"
            dataKey="minutes"
            stroke="var(--primary)"
            strokeWidth={3}
            fill="url(#minutes-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
