import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/simple-cache";
import { readSession, refreshSession, writeSession } from "@/lib/strava-auth";
import { stravaRequest } from "@/lib/strava-client";

type StravaActivity = {
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  type?: string;
  start_date?: string;
};

type DistBucket = Record<string, number>;
type HrBucket = Record<string, { sum: number; count: number }>;
type TypeBucket = Record<string, { activities: number; totalKm: number; totalHours: number }>;

function dayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function weekKey(value: string): string {
  const dt = new Date(value);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 1 - day);
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  let session = readSession(request);
  if (!session) return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });

  let refreshed = false;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now + 60) {
    session = await refreshSession(session);
    refreshed = true;
  }

  const cacheKey = `dashboard:trends:${session.athleteId}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    if (refreshed) writeSession(response, session);
    return response;
  }

  const after = Math.floor((Date.now() - 365 * 24 * 3600 * 1000) / 1000);
  const pages = Number(process.env.STRAVA_MAX_ACTIVITY_PAGES ?? "3");
  const all: StravaActivity[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const result = await stravaRequest<StravaActivity[]>(
      session,
      `/athlete/activities?per_page=100&page=${page}&after=${after}`,
    );
    if (result.status !== 200 || !Array.isArray(result.data)) {
      return NextResponse.json({ error: "Failed to load trend activities" }, { status: result.status });
    }
    all.push(...result.data);
    if (result.data.length < 100) break;
  }

  const distanceByDay: DistBucket = {};
  const hrByWeek: HrBucket = {};
  const ytdByTypeMap: TypeBucket = {};
  const ytdStart = new Date();
  ytdStart.setUTCMonth(0, 1);
  ytdStart.setUTCHours(0, 0, 0, 0);

  for (const item of all) {
    if (!item.start_date) continue;

    const dKey = dayKey(item.start_date);
    distanceByDay[dKey] = (distanceByDay[dKey] ?? 0) + (item.distance ?? 0) / 1000;

    if (typeof item.average_heartrate === "number") {
      const wKey = weekKey(item.start_date);
      const row = hrByWeek[wKey] ?? { sum: 0, count: 0 };
      row.sum += item.average_heartrate;
      row.count += 1;
      hrByWeek[wKey] = row;
    }

    if (new Date(item.start_date) >= ytdStart) {
      const type = item.type ?? "Unknown";
      const row = ytdByTypeMap[type] ?? { activities: 0, totalKm: 0, totalHours: 0 };
      row.activities += 1;
      row.totalKm += (item.distance ?? 0) / 1000;
      row.totalHours += (item.moving_time ?? 0) / 3600;
      ytdByTypeMap[type] = row;
    }
  }

  const payload = {
    distanceTrend: Object.entries(distanceByDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, distanceKm]) => ({ day, distanceKm })),
    hrTrend: Object.entries(hrByWeek)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, row]) => ({ week, avgHr: row.count ? row.sum / row.count : 0 })),
    ytdByType: Object.entries(ytdByTypeMap)
      .map(([type, row]) => ({ type, ...row }))
      .sort((a, b) => b.totalKm - a.totalKm),
  };

  setCached(cacheKey, payload);
  const response = NextResponse.json(payload);
  if (refreshed) writeSession(response, session);
  return response;
}
