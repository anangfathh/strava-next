import { NextRequest, NextResponse } from "next/server";
import {
  clearOauthState,
  exchangeCodeForSession,
  readOauthState,
  writeSession,
} from "@/lib/strava-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = readOauthState(request);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state or missing code" }, { status: 400 });
  }

  try {
    const session = await exchangeCodeForSession(code);
    const response = NextResponse.redirect(new URL("/", request.url));
    clearOauthState(response);
    writeSession(response, session);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to exchange Strava OAuth code" }, { status: 502 });
  }
}
