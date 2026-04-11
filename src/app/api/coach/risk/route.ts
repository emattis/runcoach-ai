import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { calculateInjuryRisk } from "@/lib/injury-risk";
import { getWeekStart } from "@/lib/utils";

/**
 * GET /api/coach/risk
 * Compute current injury risk score from activities and feedback data.
 */
export async function GET() {
  const db = createServiceClient();

  try {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    // Fetch last 4 weeks + current week activities and recent feedback in parallel
    const [activitiesRes, currentWeekRes, feedbackRes] = await Promise.all([
      db
        .from("activities")
        .select("activity_date, distance_miles")
        .gte("activity_date", fourWeeksAgo.toISOString().split("T")[0])
        .lt("activity_date", weekStart)
        .eq("activity_type", "run")
        .order("activity_date", { ascending: true }),
      db
        .from("activities")
        .select("distance_miles")
        .gte("activity_date", weekStart)
        .eq("activity_type", "run"),
      db
        .from("run_feedback")
        .select("feel_rating, soreness_level, sleep_quality, injury_flag")
        .order("created_at", { ascending: false })
        .limit(7),
    ]);

    // Bucket past activities into weekly mileage
    const pastActivities: { activity_date: string; distance_miles: number | null }[] =
      activitiesRes.data ?? [];
    const weeklyMap = new Map<string, number>();
    for (const a of pastActivities) {
      const wk = getWeekStart(new Date(a.activity_date));
      weeklyMap.set(wk, (weeklyMap.get(wk) ?? 0) + (a.distance_miles ?? 0));
    }
    const last4WeeksMileage = [...weeklyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]) => Math.round(m * 10) / 10);

    // Pad to 4 entries
    while (last4WeeksMileage.length < 4) last4WeeksMileage.unshift(0);
    const last4 = last4WeeksMileage.slice(-4);

    // Current week mileage
    const currentWeekActivities: { distance_miles: number | null }[] =
      currentWeekRes.data ?? [];
    const currentWeekMileage = currentWeekActivities.reduce(
      (sum: number, a) => sum + (a.distance_miles ?? 0),
      0
    );

    // Feedback
    const recentFeedback: {
      feel_rating: number;
      soreness_level: number;
      sleep_quality: number;
      injury_flag: boolean;
    }[] = feedbackRes.data ?? [];

    const result = calculateInjuryRisk({
      last4WeeksMileage: last4,
      currentWeekMileage: Math.round(currentWeekMileage * 10) / 10,
      recentFeedback,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Risk calculation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
