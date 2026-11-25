import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export default function StatsChart({
  data,
  showCompletions = true,
}: {
  data: StatsChartPoint[];
  showCompletions?: boolean;
}) {
  const isEmpty = data.every((point) => point.minutes <= 0 && point.completed <= 0);
  return (
    <div className="relative size-full">
      {isEmpty && (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No focus time in this period yet. Start a timer to see your trend.
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          {showCompletions && (
            <YAxis
              yAxisId="completions"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, (maximum: number) => Math.max(maximum, 1)]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
          )}
          <YAxis
            yAxisId="minutes"
            orientation={showCompletions ? "right" : "left"}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, (maximum: number) => Math.max(maximum, 1)]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderRadius: 16,
            }}
            formatter={(value, name) =>
              name === "Completions"
                ? [`${Number(value ?? 0)} completed`, "Completions"]
                : [`${Number(value ?? 0)} min`, "Focus time"]
            }
          />
          {showCompletions && <Legend />}
          <Bar
            dataKey="minutes"
            name="Focus time"
            fill="var(--primary)"
            radius={[6, 6, 0, 0]}
            yAxisId="minutes"
          />
          {showCompletions && (
            <Bar
              dataKey="completed"
              name="Completions"
              fill="var(--chart-2)"
              radius={[6, 6, 0, 0]}
              yAxisId="completions"
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
