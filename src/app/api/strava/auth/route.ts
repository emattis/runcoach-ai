import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode } from "@/lib/strava";
import { createServiceClient } from "@/lib/db";

/**
 * GET /api/strava/auth?code=xxx
 * Strava OAuth callback — exchange code for tokens, store in DB.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?strava=error&reason=missing_code", request.url)
    );
  }

  try {
    const tokenData = await exchangeStravaCode(code);
    const db = createServiceClient();

    // Upsert tokens keyed by Strava athlete ID
    const { error } = await db.from("strava_tokens").upsert(
      {
        athlete_id: tokenData.athlete.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" }
    );

    if (error) {
      console.error("Failed to store Strava tokens:", error);
      return NextResponse.redirect(
        new URL("/settings?strava=error&reason=db_error", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/settings?strava=connected", request.url)
    );
  } catch (err) {
    console.error("Strava auth error:", err);
    return NextResponse.redirect(
      new URL("/settings?strava=error&reason=token_exchange", request.url)
    );
  }
}
