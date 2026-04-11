import { createServiceClient } from "@/lib/db";
import { metersToMiles, mpsToSecondsPerMile } from "@/lib/utils";
import type { Activity } from "@/types";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_AUTH = "https://www.strava.com/oauth";

// ---- OAuth helpers ----

/** Build Strava OAuth authorize URL */
export function getStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
  });
  return `${STRAVA_AUTH}/authorize?${params.toString()}`;
}

/** Exchange authorization code for tokens */
export async function exchangeStravaCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
}> {
  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

/** Refresh an expired access token */
export async function refreshStravaToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> {
  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ---- Token management ----

/**
 * Get a valid Strava access token.
 * Reads from strava_tokens table, refreshes if expired, updates DB.
 */
export async function getValidToken(): Promise<string> {
  const db = createServiceClient();

  const { data: row, error } = await db
    .from("strava_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !row) {
    throw new Error("No Strava tokens found — connect Strava first");
  }

  const now = Math.floor(Date.now() / 1000);

  // Token still valid (with 60s buffer)
  if (row.expires_at > now + 60) {
    return row.access_token;
  }

  // Refresh the token
  const refreshed = await refreshStravaToken(row.refresh_token);

  const { error: updateError } = await db
    .from("strava_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    throw new Error(`Failed to update tokens: ${updateError.message}`);
  }

  return refreshed.access_token;
}

// ---- Strava API calls ----

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fetch recent activities from Strava, filtered to runs only */
export async function fetchRecentActivities(
  after?: number,
  perPage = 50
): Promise<Activity[]> {
  const token = await getValidToken();

  const params = new URLSearchParams({ per_page: String(perPage) });
  if (after) params.set("after", String(after));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava activities fetch failed (${res.status}): ${text}`);
  }

  const activities: any[] = await res.json();

  // Filter to runs only, map to our format
  return activities
    .filter((a: any) => a.type === "Run")
    .map(mapStravaActivity);
}

/** Fetch full detail for a single activity */
export async function fetchActivityDetail(activityId: number): Promise<any> {
  const token = await getValidToken();

  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava activity detail failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ---- Data mapping ----

/** Convert a Strava activity to our Activity type */
export function mapStravaActivity(strava: any): Activity {
  const distanceMiles = strava.distance ? metersToMiles(strava.distance) : null;
  const durationSeconds = strava.moving_time ?? null;
  const avgPace =
    strava.average_speed && strava.average_speed > 0
      ? mpsToSecondsPerMile(strava.average_speed)
      : null;

  // Map Strava splits (metric by default) to per-mile splits
  const splits = strava.splits_standard
    ? strava.splits_standard.map((s: any, i: number) => ({
        mile: i + 1,
        pace_seconds:
          s.moving_time && s.distance
            ? (s.moving_time / s.distance) * 1609.344
            : 0,
        elevation_gain_ft: s.elevation_difference
          ? s.elevation_difference * 3.28084
          : 0,
        avg_hr: s.average_heartrate ?? null,
      }))
    : null;

  return {
    id: "", // generated by DB on insert
    strava_id: strava.id,
    activity_date: strava.start_date_local
      ? strava.start_date_local.split("T")[0]
      : new Date().toISOString().split("T")[0],
    activity_type: "run",
    distance_miles: distanceMiles
      ? Math.round(distanceMiles * 100) / 100
      : null,
    duration_seconds: durationSeconds,
    avg_pace_per_mile: avgPace ? Math.round(avgPace * 10) / 10 : null,
    avg_hr: strava.average_heartrate
      ? Math.round(strava.average_heartrate)
      : null,
    max_hr: strava.max_heartrate ? Math.round(strava.max_heartrate) : null,
    elevation_gain_ft: strava.total_elevation_gain
      ? Math.round(strava.total_elevation_gain * 3.28084)
      : null,
    perceived_effort: strava.perceived_exertion ?? null,
    splits,
    raw_data: strava,
    created_at: new Date().toISOString(),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Sync ----

export interface SyncResult {
  synced: number;
  skipped: number;
}

/**
 * Sync new Strava activities to the database.
 * Fetches activities after the most recent one in DB, inserts new ones.
 */
export async function syncActivitiesToDB(): Promise<SyncResult> {
  const db = createServiceClient();

  // Find the latest activity date already in DB
  const { data: latest } = await db
    .from("activities")
    .select("activity_date")
    .order("activity_date", { ascending: false })
    .limit(1)
    .single();

  // Convert latest date to epoch for Strava's "after" param
  const after = latest?.activity_date
    ? Math.floor(new Date(latest.activity_date).getTime() / 1000)
    : undefined;

  const activities = await fetchRecentActivities(after);

  if (activities.length === 0) {
    return { synced: 0, skipped: 0 };
  }

  // Get existing strava_ids to skip duplicates
  const stravaIds = activities
    .map((a) => a.strava_id)
    .filter((id): id is number => id !== null);

  const { data: existing } = await db
    .from("activities")
    .select("strava_id")
    .in("strava_id", stravaIds);

  const existingIds = new Set((existing ?? []).map((r) => r.strava_id));

  const newActivities = activities.filter(
    (a) => a.strava_id !== null && !existingIds.has(a.strava_id)
  );

  if (newActivities.length === 0) {
    return { synced: 0, skipped: activities.length };
  }

  // Strip the empty id field — let the DB generate it
  const rows = newActivities.map(({ id: _id, ...rest }) => rest);

  const { error } = await db.from("activities").insert(rows);

  if (error) {
    throw new Error(`Failed to insert activities: ${error.message}`);
  }

  return {
    synced: newActivities.length,
    skipped: activities.length - newActivities.length,
  };
}
