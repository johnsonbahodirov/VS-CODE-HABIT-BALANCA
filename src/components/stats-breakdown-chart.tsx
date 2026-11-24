import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type BreakdownPoint = {
  name: string;
  minutes: number;
  color: string;
};

export default function StatsBreakdownChart({ data }: { data: BreakdownPoint[] }) {
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {data.length > 0 && (
            <Pie
              data={data}
              dataKey="minutes"
              nameKey="name"
              innerRadius="58%"
              outerRadius="92%"
              paddingAngle={0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
          )}

          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderRadius: 16,
            }}
            formatter={(value, name) => [`${value} min`, name]}
          />
        </PieChart>
      </ResponsiveContainer>

      {!data.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      )}
    </div>
  );
}
