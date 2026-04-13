import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getWeekStart } from "@/lib/utils";

/**
 * POST /api/coach/reset-plan
 * Delete the current week's training plan and workouts.
 * Does NOT delete activities — Strava data is preserved.
 */
export async function POST() {
  const db = createServiceClient();
  const weekStart = getWeekStart(new Date());

  try {
    // Find this week's plan(s)
    const { data: plans } = await db
      .from("training_plans")
      .select("id")
      .eq("week_start", weekStart);

    if (!plans || plans.length === 0) {
      return NextResponse.json({ message: "No plan found for this week", deleted: 0 });
    }

    const planIds = plans.map((p) => p.id);

    // Delete workouts first (FK constraint)
    const { error: wErr } = await db
      .from("planned_workouts")
      .delete()
      .in("plan_id", planIds);

    if (wErr) {
      return NextResponse.json(
        { error: `Failed to delete workouts: ${wErr.message}` },
        { status: 500 }
      );
    }

    // Delete the plan(s)
    const { error: pErr } = await db
      .from("training_plans")
      .delete()
      .in("id", planIds);

    if (pErr) {
      return NextResponse.json(
        { error: `Failed to delete plan: ${pErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Deleted ${plans.length} plan(s) for week of ${weekStart}`,
      deleted: plans.length,
      week_start: weekStart,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
