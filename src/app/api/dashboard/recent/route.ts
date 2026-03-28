import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/simple-cache";
import { readSession, refreshSession, writeSession } from "@/lib/strava-auth";
import { stravaRequest } from "@/lib/strava-client";

type StravaActivity = {
  id: number;
  name?: string;
  type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
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

  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get("page") ?? "1";
  const limit = searchParams.get("limit") ?? "20";

  const cacheKey = `dashboard:recent:${session.athleteId}:${page}:${limit}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    if (refreshed) writeSession(response, session);
    return response;
  }

  const result = await stravaRequest<StravaActivity[]>(session, `/athlete/activities?per_page=${limit}&page=${page}`);
  if (result.status !== 200 || !Array.isArray(result.data)) {
    return NextResponse.json({ error: "Failed to load recent activities" }, { status: result.status });
  }

  const payload = result.data.map((item) => ({
    id: item.id,
    name: item.name ?? "Untitled",
    type: item.type ?? "Unknown",
    startDate: item.start_date ?? "",
    km: (item.distance ?? 0) / 1000,
    movingMinutes: (item.moving_time ?? 0) / 60,
    avgHr: item.average_heartrate ?? null,
  }));

  setCached(cacheKey, payload);
  const response = NextResponse.json(payload);
  if (refreshed) writeSession(response, session);
  return response;
}
