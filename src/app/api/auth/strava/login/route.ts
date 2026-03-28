import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getStravaConfig, setOauthState } from "@/lib/strava-auth";

export async function GET() {
  const config = getStravaConfig();
  const state = randomBytes(16).toString("hex");

  const query = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    approval_prompt: "auto",
    scope: config.scopes,
    state,
  });

  const response = NextResponse.redirect(`https://www.strava.com/oauth/authorize?${query.toString()}`);
  setOauthState(response, state);
  return response;
}
