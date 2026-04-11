import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

/**
 * POST /api/strength/log
 * Log an individual set for a strength exercise.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    strength_workout_id,
    exercise_name,
    set_number,
    reps_completed,
    weight_lbs,
    rpe,
  } = body;

  if (!strength_workout_id || !exercise_name || set_number == null || reps_completed == null || rpe == null) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("strength_logs")
      .insert({
        strength_workout_id,
        exercise_name,
        set_number,
        reps_completed,
        weight_lbs: weight_lbs ?? null,
        rpe,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to log set: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/strength/log
 * Mark a strength workout as completed.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { workout_id } = body;

  if (!workout_id) {
    return NextResponse.json(
      { error: "Missing workout_id" },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  const { error } = await db
    .from("strength_workouts")
    .update({ completed: true })
    .eq("id", workout_id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to complete workout: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
