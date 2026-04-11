import { NextResponse } from "next/server";

export async function POST() {
  // TODO: Fetch recent activities from Strava
  // TODO: Upsert into activities table
  // TODO: Return sync summary

  return NextResponse.json({ message: "Sync not yet implemented" }, { status: 501 });
}
