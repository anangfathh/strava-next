import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/simple-cache";
import { readSession, refreshSession, writeSession } from "@/lib/strava-auth";
import { stravaRequest } from "@/lib/strava-client";

type Params = {
  params: Promise<{ path: string[] }>;
};

async function run(request: NextRequest, { params }: Params, method: string) {
  const pathParams = await params;
  let session = readSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not connected to Strava" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  let sessionRefreshed = false;
  if (session.expiresAt <= now + 60) {
    try {
      session = await refreshSession(session);
      sessionRefreshed = true;
    } catch {
      return NextResponse.json({ error: "Strava session expired, reconnect required" }, { status: 401 });
    }
  }

  const query = request.nextUrl.searchParams.toString();
  const stravaPath = `/${pathParams.path.join("/")}${query ? `?${query}` : ""}`;
  const cacheKey = `${method}:${stravaPath}`;

  if (method === "GET") {
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      if (sessionRefreshed) writeSession(response, session);
      return response;
    }
  }

  const body = method === "GET" || method === "DELETE" ? undefined : await request.text();
  const result = await stravaRequest<unknown>(session, stravaPath, {
    method,
    ...(body ? { body, headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" } } : {}),
  });

  const response = NextResponse.json(result.data, { status: result.status });
  if (sessionRefreshed) writeSession(response, session);

  if (method === "GET" && result.status >= 200 && result.status < 300) {
    setCached(cacheKey, result.data);
  }

  if (result.headers.get("retry-after")) {
    response.headers.set("retry-after", result.headers.get("retry-after") as string);
  }

  return response;
}

export async function GET(request: NextRequest, context: Params) {
  return run(request, context, "GET");
}

export async function POST(request: NextRequest, context: Params) {
  return run(request, context, "POST");
}

export async function PUT(request: NextRequest, context: Params) {
  return run(request, context, "PUT");
}

export async function DELETE(request: NextRequest, context: Params) {
  return run(request, context, "DELETE");
}
