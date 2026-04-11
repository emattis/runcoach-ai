import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

const STRAVA_AUTH = "https://www.strava.com/oauth";

/**
 * GET /api/strava/auth?code=xxx
 * Strava OAuth callback — exchange code for tokens, store in DB.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stravaError = request.nextUrl.searchParams.get("error");

  // Strava may redirect back with an error instead of a code
  if (stravaError) {
    console.error("[strava/auth] Step 0: Strava returned error:", stravaError);
    return NextResponse.redirect(
      new URL(`/settings?strava=error&reason=strava_denied_${stravaError}`, request.url)
    );
  }

  console.log("[strava/auth] Step 1: Received code, length:", code?.length ?? 0);

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?strava=error&reason=missing_code", request.url)
    );
  }

  try {
    // Step 2: Exchange code for tokens
    console.log("[strava/auth] Step 2: Exchanging code for tokens");
    console.log("[strava/auth] STRAVA_CLIENT_ID exists:", !!process.env.STRAVA_CLIENT_ID, "length:", process.env.STRAVA_CLIENT_ID?.length);
    console.log("[strava/auth] STRAVA_CLIENT_SECRET exists:", !!process.env.STRAVA_CLIENT_SECRET, "length:", process.env.STRAVA_CLIENT_SECRET?.length);

    const tokenBody = {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    };

    const tokenRes = await fetch(`${STRAVA_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });

    console.log("[strava/auth] Step 3: Token exchange response status:", tokenRes.status, tokenRes.statusText);

    const tokenText = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error("[strava/auth] Step 3 FAILED: Strava response body:", tokenText);
      return NextResponse.redirect(
        new URL(`/settings?strava=error&reason=token_exchange_${tokenRes.status}`, request.url)
      );
    }

    let tokenData: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: number };
    };

    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      console.error("[strava/auth] Step 3 FAILED: Could not parse response:", tokenText.slice(0, 200));
      return NextResponse.redirect(
        new URL("/settings?strava=error&reason=invalid_token_response", request.url)
      );
    }

    console.log("[strava/auth] Step 3 OK: athlete_id:", tokenData.athlete?.id, "has access_token:", !!tokenData.access_token, "has refresh_token:", !!tokenData.refresh_token);

    // Step 4: Save to database
    console.log("[strava/auth] Step 4: Saving tokens to database");

    const db = createServiceClient();
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
      console.error("[strava/auth] Step 5 FAILED: Supabase error:", JSON.stringify(error, null, 2));
      return NextResponse.redirect(
        new URL(`/settings?strava=error&reason=db_save_${error.code}`, request.url)
      );
    }

    console.log("[strava/auth] Step 5 OK: Tokens saved successfully");
    return NextResponse.redirect(
      new URL("/settings?strava=connected", request.url)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[strava/auth] Unhandled error:", message);
    console.error("[strava/auth] Full error:", err);
    return NextResponse.redirect(
      new URL(`/settings?strava=error&reason=${encodeURIComponent(message.slice(0, 80))}`, request.url)
    );
  }
}
