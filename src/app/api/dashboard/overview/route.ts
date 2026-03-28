import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/simple-cache";
import { readSession, refreshSession, writeSession } from "@/lib/strava-auth";
import { stravaRequest } from "@/lib/strava-client";

type StravaActivity = {
  distance?: number;
  average_heartrate?: number;
  elapsed_time?: number;
  type?: string;
  start_date?: string;
};

export async function GET(request: NextRequest) {
  let session = readSession(request);
  if (!session) return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });

  let refreshed = false;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= now + 60) {
    session = await refreshSession(session);
    refreshed = true;
  }

  const cacheKey = `dashboard:overview:${session.athleteId}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    if (refreshed) writeSession(response, session);
    return response;
  }

  const activitiesResult = await stravaRequest<StravaActivity[]>(
    session,
    `/athlete/activities?per_page=100&page=1&after=${Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000)}`,
  );

  if (activitiesResult.status !== 200 || !Array.isArray(activitiesResult.data)) {
    return NextResponse.json({ error: "Failed to load Strava activities" }, { status: activitiesResult.status });
  }

  const activities = activitiesResult.data;
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekActivities = activities.filter((item) => {
    if (!item.start_date) return false;
    return new Date(item.start_date) >= weekStart;
  });

  const weekDistanceKm = weekActivities.reduce((acc, item) => acc + (item.distance ?? 0), 0) / 1000;
  const hrRows = activities.filter((item) => typeof item.average_heartrate === "number");
  const avgHr30d = hrRows.length
    ? hrRows.reduce((acc, item) => acc + (item.average_heartrate ?? 0), 0) / hrRows.length
    : 0;

  const runRows = activities.filter((item) => item.type === "Run" && (item.distance ?? 0) > 0 && (item.elapsed_time ?? 0) > 0);
  const avgRunPace30d = runRows.length
    ? runRows.reduce((acc, item) => acc + ((item.elapsed_time ?? 0) / 60) / ((item.distance ?? 0) / 1000), 0) / runRows.length
    : 0;

  const payload = {
    weekDistanceKm,
    weekActivities: weekActivities.length,
    avgHr30d,
    avgRunPace30d,
  };

  setCached(cacheKey, payload);
  const response = NextResponse.json(payload);
  if (refreshed) writeSession(response, session);
  return response;
}
