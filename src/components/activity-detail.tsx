"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ActivityRouteMap = dynamic(
  () => import("@/components/activity-route-map").then((mod) => mod.ActivityRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center text-sm text-[var(--color-muted)]">
        Loading interactive map...
      </div>
    ),
  },
);

type ActivityDetailProps = {
  activityId: string;
};

type Activity = {
  id: number;
  name?: string;
  type?: string;
  description?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  calories?: number;
  gear_id?: string;
  suffer_score?: number;
  kudos_count?: number;
  comment_count?: number;
  athlete_count?: number;
  map?: {
    summary_polyline?: string;
    polyline?: string;
  };
};

type StreamsPayload = {
  time?: { data: number[] };
  distance?: { data: number[] };
  heartrate?: { data: number[] };
  velocity_smooth?: { data: number[] };
  watts?: { data: number[] };
  cadence?: { data: number[] };
  altitude?: { data: number[] };
};

type Gear = {
  id: string;
  name?: string;
};

type StatusResponse = {
  linked: boolean;
  error?: string;
};

type ChartPoint = {
  minute: number;
  heartRate?: number;
  speedKmh?: number;
  watts?: number;
  cadence?: number;
  elevationGain?: number;
};

type LatLng = {
  lat: number;
  lng: number;
};

type ActivitySplit = {
  km: number;
  splitSeconds: number;
  elevationGain?: number;
  avgHeartRate?: number;
};

function formatDate(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds < 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatPace(distance?: number, movingTime?: number): string {
  if (!distance || !movingTime || distance <= 0 || movingTime <= 0) return "-";
  const minPerKm = (movingTime / 60) / (distance / 1000);
  return `${minPerKm.toFixed(2)} min/km`;
}

function formatPaceSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 60) return `${mins + 1}:00 /km`;
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

function formatMeters(value?: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value ?? 0)} m`;
}

function interpolateAtDistance(targetMeters: number, distances: number[], values: number[]): number | null {
  if (!distances.length || !values.length || distances.length !== values.length) return null;

  const lastDistance = distances[distances.length - 1];
  if (targetMeters > lastDistance) return null;

  for (let i = 1; i < distances.length; i += 1) {
    const d0 = distances[i - 1];
    const d1 = distances[i];
    if (targetMeters < d0 || targetMeters > d1) continue;

    const v0 = values[i - 1];
    const v1 = values[i];

    if (d1 === d0) return v1;

    const ratio = (targetMeters - d0) / (d1 - d0);
    return v0 + ratio * (v1 - v0);
  }

  return null;
}

function buildSplits(streams: StreamsPayload | null): ActivitySplit[] {
  const times = streams?.time?.data ?? [];
  const distances = streams?.distance?.data ?? [];
  if (!times.length || !distances.length || times.length !== distances.length) return [];

  const hr = streams?.heartrate?.data ?? [];
  const altitude = streams?.altitude?.data ?? [];

  const totalKm = Math.floor((distances[distances.length - 1] ?? 0) / 1000);
  if (totalKm <= 0) return [];

  let cumulativeGain: number[] | null = null;
  if (altitude.length === distances.length) {
    cumulativeGain = new Array(altitude.length).fill(0);
    for (let i = 1; i < altitude.length; i += 1) {
      const delta = altitude[i] - altitude[i - 1];
      cumulativeGain[i] = cumulativeGain[i - 1] + (delta > 0 ? delta : 0);
    }
  }

  const splits: ActivitySplit[] = [];
  let previousTargetTime = 0;
  let previousTargetDistance = 0;
  let previousGain = 0;

  for (let km = 1; km <= totalKm; km += 1) {
    const target = km * 1000;
    const targetTime = interpolateAtDistance(target, distances, times);
    if (targetTime == null) break;

    const splitGainAtTarget = cumulativeGain ? interpolateAtDistance(target, distances, cumulativeGain) : null;
    const splitGain = splitGainAtTarget == null ? undefined : Math.max(0, splitGainAtTarget - previousGain);

    let hrSum = 0;
    let hrCount = 0;
    if (hr.length === distances.length) {
      for (let i = 0; i < distances.length; i += 1) {
        const d = distances[i];
        const value = hr[i];
        if (d > previousTargetDistance && d <= target && Number.isFinite(value)) {
          hrSum += value;
          hrCount += 1;
        }
      }
    }
    const avgHeartRate = hrCount > 0 ? hrSum / hrCount : undefined;

    const splitSeconds = Math.max(0, targetTime - previousTargetTime);
    splits.push({ km, splitSeconds, elevationGain: splitGain, avgHeartRate });
    previousTargetTime = targetTime;
    previousTargetDistance = target;
    if (splitGainAtTarget != null) previousGain = splitGainAtTarget;
  }

  return splits;
}

function buildChartData(streams: StreamsPayload | null): ChartPoint[] {
  if (!streams?.time?.data?.length) return [];

  const time = streams.time.data;
  const hr = streams.heartrate?.data ?? [];
  const speed = streams.velocity_smooth?.data ?? [];
  const watts = streams.watts?.data ?? [];
  const cadence = streams.cadence?.data ?? [];
  const altitude = streams.altitude?.data ?? [];

  let cumulativeGain: number[] = [];
  if (altitude.length === time.length) {
    cumulativeGain = new Array(altitude.length).fill(0);
    for (let i = 1; i < altitude.length; i += 1) {
      const delta = altitude[i] - altitude[i - 1];
      cumulativeGain[i] = cumulativeGain[i - 1] + (delta > 0 ? delta : 0);
    }
  }

  const points: ChartPoint[] = [];
  for (let i = 0; i < time.length; i += 1) {
    if (i % 5 !== 0) continue;
    points.push({
      minute: Math.round(time[i] / 60),
      heartRate: typeof hr[i] === "number" ? hr[i] : undefined,
      speedKmh: typeof speed[i] === "number" ? speed[i] * 3.6 : undefined,
      watts: typeof watts[i] === "number" ? watts[i] : undefined,
      cadence: typeof cadence[i] === "number" ? cadence[i] : undefined,
      elevationGain: typeof cumulativeGain[i] === "number" ? cumulativeGain[i] : undefined,
    });
  }

  return points;
}

function decodePolyline(polyline: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < polyline.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = polyline.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = polyline.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return coordinates;
}

export function ActivityDetail({ activityId }: ActivityDetailProps) {
  const [loadStreams, setLoadStreams] = useState(false);

  const { data: status, error: statusError } = useSWR<StatusResponse>("/api/auth/strava/status", {
    refreshInterval: 90_000,
  });

  const linked = Boolean(status?.linked);

  const { data: activity, error: activityError } = useSWR<Activity>(
    linked ? `/api/strava/activities/${activityId}` : null,
    {
      refreshInterval: 0,
    },
  );

  const { data: gear, error: gearError } = useSWR<Gear>(
    linked && activity?.gear_id ? `/api/strava/gear/${activity.gear_id}` : null,
    {
      refreshInterval: 0,
    },
  );

  const streamQuery = "keys=time,heartrate,velocity_smooth,watts,cadence,altitude&key_by_type=true";
  const { data: streams, error: streamsError } = useSWR<StreamsPayload>(
    linked && loadStreams ? `/api/strava/activities/${activityId}/streams?${streamQuery}` : null,
    {
      refreshInterval: 0,
    },
  );

  const splitQuery = "keys=time,distance,heartrate,altitude&key_by_type=true";
  const { data: splitStreams, error: splitError } = useSWR<StreamsPayload>(
    linked ? `/api/strava/activities/${activityId}/streams?${splitQuery}` : null,
    {
      refreshInterval: 0,
    },
  );

  const message =
    statusError?.message ??
    activityError?.message ??
    gearError?.message ??
    splitError?.message ??
    streamsError?.message ??
    (status ? (!linked ? status.error ?? "Connect Strava first." : "") : "");

  const chartData = useMemo(() => buildChartData(streams ?? null), [streams]);
  const routePoints = useMemo(() => {
    const encoded = activity?.map?.summary_polyline ?? activity?.map?.polyline;
    if (!encoded) return [];
    return decodePolyline(encoded);
  }, [activity?.map?.polyline, activity?.map?.summary_polyline]);

  const paceSplits = useMemo(() => buildSplits(splitStreams ?? null), [splitStreams]);
  const fastestSplit = useMemo(() => {
    if (!paceSplits.length) return null;
    return paceSplits.reduce((best, current) => (current.splitSeconds < best.splitSeconds ? current : best), paceSplits[0]);
  }, [paceSplits]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Activity Detail</p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--color-ink)] sm:text-3xl">{activity?.name ?? `Activity #${activityId}`}</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{activity?.type ?? "-"} • {formatDate(activity?.start_date)}</p>
          </div>
          <Link href="/" className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink)]">
            Back To Dashboard
          </Link>
        </div>
        {message ? <p className="mt-4 text-sm text-[var(--color-muted)]">{message}</p> : null}
        {!linked ? (
          <a className="mt-4 inline-block rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white" href="/api/auth/strava/login">
            Connect Strava
          </a>
        ) : null}
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Left Column - Main Details (Map, Charts) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          
          {/* Quick Stats - grouped in one card */}
          <section className="card p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4 sm:gap-6 sm:text-left">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Distance</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{activity ? `${((activity.distance ?? 0) / 1000).toFixed(2)} km` : "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Moving Time</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{activity ? formatDuration(activity.moving_time) : "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Elevation</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{activity ? `${(activity.total_elevation_gain ?? 0).toFixed(0)} m` : "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Avg Pace</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{activity ? formatPace(activity.distance, activity.moving_time) : "-"}</p>
              </div>
            </div>
          </section>

          {/* Route Map */}
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Route Map</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[#f9fafb]">
              <ActivityRouteMap points={routePoints} mapKey={`activity-${activityId}`} />
            </div>
          </section>

          {/* Combined Stream Data */}
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Activity Streams</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Heart rate, speed, watts, and more.</p>
              </div>
              <button
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                type="button"
                onClick={() => setLoadStreams(true)}
                disabled={loadStreams}
              >
                {loadStreams ? "Loaded" : "Load Streams"}
              </button>
            </div>

            <div className="mt-6 h-80">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                  <AreaChart data={chartData}>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                    <XAxis dataKey="minute" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={10} />
                    <Tooltip 
                      contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} fillOpacity={0.1} fill="#ef4444" name="HR (bpm)" />
                    <Area yAxisId="left" type="monotone" dataKey="speedKmh" stroke="#3b82f6" strokeWidth={2} fillOpacity={0.1} fill="#3b82f6" name="Speed (km/h)" />
                    <Area yAxisId="right" type="monotone" dataKey="watts" stroke="#8b5cf6" strokeWidth={2} fillOpacity={0.1} fill="#8b5cf6" name="Watts" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                  {loadStreams ? "No stream data available for this activity." : "Click \"Load Streams\" to request detail streams."}
                </div>
              )}
            </div>
          </section>

          {/* Cadence & Elevation specific */}
          {loadStreams ? (
            <section className="grid gap-6 sm:grid-cols-2">
              <article className="card p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Cadence Trend</h2>
                <div className="mt-4 h-64">
                  {chartData.some((point) => typeof point.cadence === "number") ? (
                    <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                      <AreaChart data={chartData}>
                        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3" />
                        <XAxis dataKey="minute" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
                        <Tooltip 
                          contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                          itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
                        />
                        <Area type="monotone" dataKey="cadence" stroke="#14b8a6" strokeWidth={2} fillOpacity={0.1} fill="#14b8a6" name="Cadence (spm)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                      Cadence data is not available.
                    </div>
                  )}
                </div>
              </article>

              <article className="card p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Elevation Trend</h2>
                <div className="mt-4 h-64">
                  {chartData.some((point) => typeof point.elevationGain === "number") ? (
                    <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                      <AreaChart data={chartData}>
                        <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 3"/>
                        <XAxis dataKey="minute" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} dx={-10} />
                        <Tooltip 
                          contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-line)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                          itemStyle={{ color: "var(--color-ink)", fontWeight: 500 }}
                        />
                        <Area type="monotone" dataKey="elevationGain" stroke="#f59e0b" strokeWidth={2} fillOpacity={0.1} fill="#f59e0b" name="Elevation Gain (m)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                      Elevation stream is not available.
                    </div>
                  )}
                </div>
              </article>
            </section>
          ) : null}

          {/* Description */}
          {activity?.description ? (
            <section className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-muted)]">{activity.description}</p>
            </section>
          ) : null}
        </div>

        {/* Right Column - Lists, Splits, and Extra Stats */}
        <div className="flex flex-col gap-6">
          
          {/* Splits Card */}
          <section className="card flex flex-col p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">Splits Per KM</h2>
              {fastestSplit ? (
                <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-[var(--color-brand)]">
                  Fastest KM {fastestSplit.km}
                </span>
              ) : null}
            </div>
            
            <div className="max-h-80 overflow-auto rounded-lg border border-[var(--color-line)] bg-white scrollbar-thin">
              {paceSplits.length > 0 ? (
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#f9fafb] text-[var(--color-muted)] border-b border-[var(--color-line)] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">KM</th>
                      <th className="px-3 py-2 font-medium">Pace</th>
                      <th className="px-3 py-2 font-medium">Elev</th>
                      <th className="px-3 py-2 font-medium">HR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {paceSplits.map((split) => {
                      const isFastest = split.km === fastestSplit?.km;
                      return (
                        <tr key={split.km} className={isFastest ? "bg-orange-50/50" : "hover:bg-[#fdfdfd]"}>
                          <td className="px-3 py-2 text-[var(--color-ink)] font-medium">{split.km}</td>
                          <td className="px-3 py-2 text-[var(--color-ink)] stat-value">{formatPaceSeconds(split.splitSeconds)}</td>
                          <td className="px-3 py-2 text-[var(--color-muted)] stat-value">{formatMeters(split.elevationGain)}</td>
                          <td className="px-3 py-2 text-[var(--color-muted)] stat-value">{split.avgHeartRate ? `${split.avgHeartRate.toFixed(0)}` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                  Splits not available.
                </div>
              )}
            </div>
          </section>

          {/* Extra Details Card */}
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Performance & Gear</h2>
            <div className="mt-4 flex flex-col divide-y divide-[var(--color-line)] text-sm">
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Gear</span><span className="font-medium text-[var(--color-ink)]">{gear?.name ?? (activity?.gear_id ? "Loading..." : "-")}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Calories</span><span className="font-medium text-[var(--color-ink)]">{activity?.calories ? `${Math.round(activity.calories)} kcal` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Avg Heart Rate</span><span className="font-medium text-[var(--color-ink)]">{activity?.average_heartrate ? `${activity.average_heartrate.toFixed(0)} bpm` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Max Heart Rate</span><span className="font-medium text-[var(--color-ink)]">{activity?.max_heartrate ? `${activity.max_heartrate.toFixed(0)} bpm` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Average Speed</span><span className="font-medium text-[var(--color-ink)]">{activity ? `${((activity.average_speed ?? 0) * 3.6).toFixed(2)} km/h` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Max Speed</span><span className="font-medium text-[var(--color-ink)]">{activity ? `${((activity.max_speed ?? 0) * 3.6).toFixed(2)} km/h` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Avg Cadence</span><span className="font-medium text-[var(--color-ink)]">{activity?.average_cadence ? `${activity.average_cadence.toFixed(0)} spm` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Avg Watts</span><span className="font-medium text-[var(--color-ink)]">{activity?.average_watts ? `${activity.average_watts.toFixed(0)} W` : "-"}</span></div>
              <div className="flex justify-between py-2.5"><span className="text-[var(--color-muted)]">Suffer Score</span><span className="font-medium text-[var(--color-ink)]">{activity?.suffer_score ?? "-"}</span></div>
              <div className="flex justify-between py-2.5 border-b-0"><span className="text-[var(--color-muted)]">Elapsed Time</span><span className="font-medium text-[var(--color-ink)]">{formatDuration(activity?.elapsed_time)}</span></div>
            </div>
          </section>

          {/* Engagement */}
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Engagement</h2>
            <div className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex justify-between items-center"><span className="text-[var(--color-muted)]">Kudos</span><span className="font-medium text-[var(--color-ink)] bg-[#f9fafb] border border-[var(--color-line)] px-3 py-1 rounded-md">{activity?.kudos_count ?? 0}</span></div>
                <div className="flex justify-between items-center"><span className="text-[var(--color-muted)]">Comments</span><span className="font-medium text-[var(--color-ink)] bg-[#f9fafb] border border-[var(--color-line)] px-3 py-1 rounded-md">{activity?.comment_count ?? 0}</span></div>
                <div className="flex justify-between items-center"><span className="text-[var(--color-muted)]">Athletes</span><span className="font-medium text-[var(--color-ink)] bg-[#f9fafb] border border-[var(--color-line)] px-3 py-1 rounded-md">{activity?.athlete_count ?? "-"}</span></div>
            </div>
          </section>
          
        </div>
      </div>
    </main>
  );
}
