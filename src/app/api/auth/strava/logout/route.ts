import { NextResponse } from "next/server";
import { clearSession } from "@/lib/strava-auth";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  clearSession(response);
  return response;
}
