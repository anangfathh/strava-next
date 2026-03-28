import { NextRequest, NextResponse } from "next/server";

export type StravaSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: number;
  scope: string;
};

const SESSION_COOKIE = "strava_session";
const STATE_COOKIE = "strava_oauth_state";

function mustGetEnv(name: string, fallback = ""): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getStravaConfig() {
  return {
    clientId: mustGetEnv("STRAVA_CLIENT_ID"),
    clientSecret: mustGetEnv("STRAVA_CLIENT_SECRET"),
    redirectUri: mustGetEnv("STRAVA_REDIRECT_URI", "http://localhost:3000/api/auth/strava/callback"),
    scopes: process.env.STRAVA_SCOPES ?? "read,activity:read_all,profile:read_all",
  };
}

function encodeSession(session: StravaSession): string {
  return Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
}

function decodeSession(value: string): StravaSession | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as StravaSession;
  } catch {
    return null;
  }
}

export function readSession(request: NextRequest): StravaSession | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

export function writeSession(response: NextResponse, session: StravaSession): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(response: NextResponse): void {
  response.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
}

export function setOauthState(response: NextResponse, state: string): void {
  response.cookies.set({ name: STATE_COOKIE, value: state, path: "/", maxAge: 600, sameSite: "lax" });
}

export function readOauthState(request: NextRequest): string | null {
  return request.cookies.get(STATE_COOKIE)?.value ?? null;
}

export function clearOauthState(response: NextResponse): void {
  response.cookies.set({ name: STATE_COOKIE, value: "", path: "/", maxAge: 0 });
}

export async function exchangeCodeForSession(code: string): Promise<StravaSession> {
  const config = getStravaConfig();
  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OAuth exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: { id: number };
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete.id,
    scope: data.scope ?? config.scopes,
  };
}

export async function refreshSession(session: StravaSession): Promise<StravaSession> {
  const config = getStravaConfig();
  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id ?? session.athleteId,
    scope: data.scope ?? session.scope,
  };
}
