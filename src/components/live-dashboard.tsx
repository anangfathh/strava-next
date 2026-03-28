"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { DashboardCharts, type DistanceTrendRow, type HrTrendRow, type YtdTypeRow } from "@/components/dashboard-charts";

type StatusResponse = {
  linked: boolean;
  athleteId?: number;
  scope?: string;
  budget?: {
    remaining15m: number;
    remainingDaily: number;
    limit15m: number;
    limitDaily: number;
  };
  error?: string;
};

type OverviewResponse = {
  weekDistanceKm: number;
  weekActivities: number;
  avgHr30d: number;
  avgRunPace30d: number;
};

type RecentActivity = {
  id: number;
  name: string;
  type: string;
  startDate: string;
  km: number;
  movingMinutes: number;
  avgHr: number | null;
};

type TrendsResponse = {
  distanceTrend: DistanceTrendRow[];
  hrTrend: HrTrendRow[];
  ytdByType: YtdTypeRow[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function LiveDashboard() {
  const [page, setPage] = useState(1);
  const limit = 10;

  const {
    data: status,
    error: statusError,
    isLoading: statusLoading,
  } = useSWR<StatusResponse>("/api/auth/strava/status", {
    refreshInterval: 90_000,
  });

  const linked = Boolean(status?.linked);

  const { data: overview, error: overviewError } = useSWR<OverviewResponse>(
    linked ? "/api/dashboard/overview" : null,
    { refreshInterval: 300_000 },
  );

  const { data: trends, error: trendsError } = useSWR<TrendsResponse>(
    linked ? "/api/dashboard/trends" : null,
    { refreshInterval: 1_800_000 },
  );

  const { data: recent, error: recentError, isLoading: recentLoading } = useSWR<RecentActivity[]>(
    linked ? `/api/dashboard/recent?page=${page}&limit=${limit}` : null,
    { keepPreviousData: true, refreshInterval: 180_000 },
  );

  const activeError = statusError ?? overviewError ?? trendsError ?? recentError;

  const budgetText = status?.budget
    ? `${status.budget.remaining15m}/${status.budget.limit15m} left (15m), ${status.budget.remainingDaily}/${status.budget.limitDaily} left (daily)`
    : "-";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--color-brand)] font-semibold">Live API Mode</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            Activity Dashboard
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)] max-w-xl">
            Direct Strava integration with smart caching. <br className="hidden sm:block" /> {budgetText}
          </p>
        </div>

        {!linked && !statusLoading ? (
          <div>
            <a className="inline-flex items-center justify-center rounded-lg bg-[var(--color-brand)] hover:bg-[#e04300] transition-colors px-6 py-2.5 text-sm font-semibold text-white" href="/api/auth/strava/login">
              Connect Strava
            </a>
          </div>
        ) : null}
      </header>

      {activeError ? <p className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-100">{activeError.message}</p> : null}
      {!linked && status?.error ? <p className="rounded-md bg-red-50 p-4 text-sm text-red-600 border border-red-100">{status.error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Distance This Week</p>
          <p className="stat-value mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {overview ? `${overview.weekDistanceKm.toFixed(1)} km` : linked ? "Loading..." : "-"}
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Activities This Week</p>
          <p className="stat-value mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {overview ? overview.weekActivities : linked ? "Loading..." : "-"}
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Average HR (30 Days)</p>
          <p className="stat-value mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {overview ? `${overview.avgHr30d.toFixed(0)} bpm` : linked ? "Loading..." : "-"}
          </p>
        </article>
        <article className="card p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Run Pace (30 Days)</p>
          <p className="stat-value mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {overview ? `${overview.avgRunPace30d.toFixed(2)} min/km` : linked ? "Loading..." : "-"}
          </p>
        </article>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Trends</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Auto-refreshed every 30 minutes while app is open.</p>
          </div>
        </div>

        <div className="mt-4">
          {trends ? (
            <DashboardCharts distanceTrend={trends.distanceTrend} hrTrend={trends.hrTrend} ytdByType={trends.ytdByType} />
          ) : (
            <p className="text-sm text-[var(--color-muted)]">{linked ? "Loading trends..." : "Connect Strava to load trends."}</p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4 bg-white">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] uppercase tracking-wide">Recent Activities</h2>
          <p className="text-xs text-[var(--color-muted)]">Page {page}</p>
        </div>

        <div className="overflow-x-auto bg-white">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#f9fafb] text-[var(--color-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Distance</th>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Avg HR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)] relative">
              {recentLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--color-muted)] relative">
                    Loading activities...
                  </td>
                </tr>
              )}
              {!recentLoading && (recent ?? []).map((activity) => (
                <tr key={activity.id} className="hover:bg-[#fdfdfd] transition-colors">
                  <td className="px-5 py-4 text-[var(--color-muted)]">{formatDate(activity.startDate)}</td>
                  <td className="px-5 py-4 text-[var(--color-ink)] font-medium">
                    <Link className="hover:text-[var(--color-brand)] transition-colors" href={`/activity/${activity.id}`}>
                      {activity.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-muted)]">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                      {activity.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-ink)] stat-value">{activity.km.toFixed(2)} km</td>
                  <td className="px-5 py-4 text-[var(--color-ink)] stat-value">{activity.movingMinutes.toFixed(1)} min</td>
                  <td className="px-5 py-4 text-[var(--color-muted)] stat-value">
                    {activity.avgHr == null ? "-" : `${activity.avgHr.toFixed(0)}`}
                  </td>
                </tr>
              ))}
              {!recentLoading && linked && recent && recent.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-[var(--color-muted)]" colSpan={6}>
                    No recent activities found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-[var(--color-line)] bg-[#f9fafb] px-5 py-3">
          <button
            type="button"
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={() => setPage(page => Math.max(1, page - 1))}
            disabled={page === 1 || recentLoading}
          >
            Previous
          </button>
          <span className="text-sm text-[var(--color-muted)]">
            Page <span className="font-medium text-[var(--color-ink)]">{page}</span>
          </span>
          <button
            type="button"
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={() => setPage(page => page + 1)}
            disabled={(recent?.length ?? 0) < limit || recentLoading}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
