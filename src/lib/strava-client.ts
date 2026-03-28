import { consumeReadBudget } from "@/lib/rate-limit";
import type { StravaSession } from "@/lib/strava-auth";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export async function stravaRequest<T>(
  session: StravaSession,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T | { message: string }; headers: Headers; blocked?: boolean; retryAfterSec?: number }> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const budget = consumeReadBudget(1);
    if (!budget.allowed) {
      return {
        status: 429,
        data: { message: "Read rate limit guard triggered before Strava request." },
        headers: new Headers({
          "retry-after": String(budget.retryAfterSec),
          "x-local-read-remaining-15m": String(budget.remaining15m),
          "x-local-read-remaining-daily": String(budget.remainingDaily),
        }),
        blocked: true,
        retryAfterSec: budget.retryAfterSec,
      };
    }
  }

  const response = await fetch(`${STRAVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  let data: T | { message: string };
  try {
    data = (await response.json()) as T;
  } catch {
    data = { message: "Empty response" };
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}
