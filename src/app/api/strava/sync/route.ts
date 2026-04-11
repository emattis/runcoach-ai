import { NextResponse } from "next/server";
import { syncActivitiesToDB } from "@/lib/strava";

/**
 * POST /api/strava/sync
 * Pull new activities from Strava and insert into the database.
 */
export async function POST() {
  try {
    const result = await syncActivitiesToDB();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Strava sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
