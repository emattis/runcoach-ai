import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode } from "@/lib/strava";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  const tokenData = await exchangeStravaCode(code);

  // TODO: Store tokens in Supabase
  // TODO: Redirect to settings page with success message

  return NextResponse.redirect(new URL("/settings", request.url));
}
