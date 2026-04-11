import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getWeekStart } from "@/lib/utils";
import { getStrengthProgram } from "@/lib/strength-programs";
import type { TrainingPhase } from "@/types";

/**
 * GET /api/strength/program
 * Returns this week's strength workouts. Auto-generates from templates if none exist.
 */
export async function GET() {
  const db = createServiceClient();
  const weekStart = getWeekStart(new Date());

  try {
    // Check if workouts already exist for this week
    const { data: existing } = await db
      .from("strength_workouts")
      .select("*")
      .gte("workout_date", weekStart)
      .order("workout_date", { ascending: true });

    if (existing && existing.length > 0) {
      return NextResponse.json({ workouts: existing });
    }

    // No workouts — generate from templates
    const { data: athlete } = await db
      .from("athlete_profile")
      .select("current_phase, phase_start_date")
      .limit(1)
      .single();

    const phase = (athlete?.current_phase ?? "base_building") as TrainingPhase;
    const phaseStart = athlete?.phase_start_date
      ? new Date(athlete.phase_start_date)
      : new Date();
    const weekNumber = Math.max(
      1,
      Math.ceil((Date.now() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    );

    const templates = getStrengthProgram(phase, weekNumber);

    if (templates.length === 0) {
      return NextResponse.json({ workouts: [] });
    }

    // Assign days within the week (spread evenly)
    const start = new Date(weekStart + "T00:00:00");
    const dayOffsets =
      templates.length === 3
        ? [1, 3, 5] // Tue, Thu, Sat
        : templates.length === 2
          ? [1, 4] // Tue, Fri
          : [2]; // Wed

    const rows = templates.map((tmpl, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + (dayOffsets[i] ?? i * 2));
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return {
        workout_date: `${yyyy}-${mm}-${dd}`,
        workout_name: tmpl.name,
        exercises: tmpl.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
          rest_seconds: e.rest_seconds,
          notes: e.notes,
        })),
        phase,
        completed: false,
      };
    });

    const { data: inserted, error } = await db
      .from("strength_workouts")
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create workouts: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ workouts: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Strength program error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
