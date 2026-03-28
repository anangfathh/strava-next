"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DistanceTrendRow = {
  day: string;
  distanceKm: number;
};

export type HrTrendRow = {
  week: string;
  avgHr: number;
};

export type YtdTypeRow = {
  type: string;
  activities: number;
  totalKm: number;
  totalHours: number;
};

type DashboardChartsProps = {
  distanceTrend: DistanceTrendRow[];
  hrTrend: HrTrendRow[];
  ytdByType: YtdTypeRow[];
};

export function DashboardCharts({ distanceTrend, hrTrend, ytdByType }: DashboardChartsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Distance Trend (12 Weeks)</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Daily distance in km.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
            <AreaChart data={distanceTrend}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
              <Tooltip 
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
              />
              <Area type="monotone" dataKey="distanceKm" stroke="#fc4c02" strokeWidth={2} fillOpacity={1} fill="url(#colorDistance)" />
              <defs>
                <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fc4c02" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#fc4c02" stopOpacity={0} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Heart Rate Trend (12 Weeks)</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Average heart rate per week.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
            <AreaChart data={hrTrend}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
              <Tooltip 
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
              />
              <Area type="monotone" dataKey="avgHr" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorHr)" />
              <defs>
                <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">YTD by Activity Type</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Compare total distance and hours by activity type.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
            <BarChart data={ytdByType}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis dataKey="type" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={10} />
              <Tooltip 
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", color: "var(--color-muted)" }}
                itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
                cursor={{ fill: "var(--color-line)", opacity: 0.4 }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} />
              <Bar yAxisId="left" dataKey="totalKm" fill="#2563eb" name="Distance (km)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="right" dataKey="totalHours" fill="#fc4c02" name="Hours" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
