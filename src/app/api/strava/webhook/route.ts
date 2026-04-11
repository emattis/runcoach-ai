import { NextRequest, NextResponse } from "next/server";

// Strava webhook verification (GET)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Strava webhook event (POST)
export async function POST(request: NextRequest) {
  const body = await request.json();

  // TODO: Process webhook event (new activity, update, delete)
  // TODO: Trigger activity sync for the relevant activity

  console.log("Strava webhook event:", body);
  return NextResponse.json({ status: "ok" });
}
