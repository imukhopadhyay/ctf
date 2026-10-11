"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#2dd4bf", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#fb923c", "#f87171", "#94a3b8"];
const axis = { stroke: "#5f7290", fontSize: 11 };
const tooltipStyle = { background: "#0b1220", border: "1px solid #1b2a42", borderRadius: 8, fontSize: 12, color: "#e6edf7" };

export function ProgressionChart({ series }: { series: { name: string; isMe?: boolean; series: { t: number; points: number }[] }[] }) {
  if (series.every((s) => s.series.length === 0)) return <p className="py-10 text-center text-sm text-muted">No scoring activity yet.</p>;
  // Merge into a step-wise table keyed by timestamp.
  const times = [...new Set(series.flatMap((s) => s.series.map((p) => p.t)))].sort((a, b) => a - b);
  const rows = times.map((t) => {
    const row: Record<string, number> = { t };
    for (const s of series) {
      const last = [...s.series].reverse().find((p) => p.t <= t);
      row[s.name] = last?.points ?? 0;
    }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1b2a42" strokeDasharray="3 3" />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {...axis} />
        <YAxis {...axis} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => new Date(Number(t)).toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.name} type="stepAfter" dataKey={s.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={s.isMe ? 3 : 1.75} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, xKey, bars, height = 260 }: { data: Record<string, unknown>[]; xKey: string; bars: { key: string; label: string }[]; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#1b2a42" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axis} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(45,212,191,0.06)" }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data }: { data: { day: string; total: number; correct: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No submissions yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#1b2a42" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="total" name="Submissions" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} isAnimationActive={false} />
        <Area type="monotone" dataKey="correct" name="Correct" stroke="#34d399" fill="#34d399" fillOpacity={0.25} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
