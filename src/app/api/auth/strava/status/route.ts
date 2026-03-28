import { NextRequest, NextResponse } from "next/server";
import { getBudgetSnapshot } from "@/lib/rate-limit";
import { readSession, refreshSession, writeSession } from "@/lib/strava-auth";

export async function GET(request: NextRequest) {
  const session = readSession(request);
  const budget = getBudgetSnapshot();

  if (!session) {
    return NextResponse.json({ linked: false, budget });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    if (session.expiresAt <= now + 60) {
      const refreshed = await refreshSession(session);
      const response = NextResponse.json({ linked: true, athleteId: refreshed.athleteId, scope: refreshed.scope, budget });
      writeSession(response, refreshed);
      return response;
    }
  } catch {
    return NextResponse.json({ linked: false, budget, error: "Session expired, please reconnect." }, { status: 401 });
  }

  return NextResponse.json({ linked: true, athleteId: session.athleteId, scope: session.scope, budget });
}
