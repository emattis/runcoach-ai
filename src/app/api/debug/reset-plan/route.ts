import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getWeekStart } from "@/lib/utils";

/**
 * DELETE /api/debug/reset-plan
 * Delete this week's training plan and workouts. For debugging only.
 */
export async function DELETE() {
  const db = createServiceClient();
  const weekStart = getWeekStart(new Date());

  // Find this week's plan
  const { data: plan } = await db
    .from("training_plans")
    .select("id")
    .eq("week_start", weekStart)
    .single();

  if (!plan) {
    return NextResponse.json({ message: "No plan found for this week" });
  }

  // Delete workouts first (FK constraint)
  const { error: wErr } = await db
    .from("planned_workouts")
    .delete()
    .eq("plan_id", plan.id);

  // Delete the plan
  const { error: pErr } = await db
    .from("training_plans")
    .delete()
    .eq("id", plan.id);

  return NextResponse.json({
    deleted_plan: plan.id,
    workout_delete_error: wErr?.message ?? null,
    plan_delete_error: pErr?.message ?? null,
  });
}
