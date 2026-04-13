import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import {
  generateWeeklyPlan,
  getCoachLearnings,
  type PlanGenerationContext,
} from "@/lib/coach";
import { getWeekStart } from "@/lib/utils";
import type { TrainingPhase } from "@/types";

/**
 * POST /api/coach/plan
 * Generate a new weekly training plan for the upcoming Monday-Sunday week.
 *
 * If today is Mon-Sat, plans for this week's Monday.
 * If today is Sunday, plans for NEXT Monday.
 *
 * Activities from before the plan week are context only — the full
 * target mileage is prescribed across Mon-Sun.
 */
export async function POST() {
  const db = createServiceClient();

  console.log("[plan] ===== Step 1: Starting plan generation =====");

  try {
    // Determine the target plan week
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    let planDate = now;
    if (dayOfWeek === 0) {
      planDate = new Date(now);
      planDate.setDate(planDate.getDate() + 1);
    }
    const weekStart = getWeekStart(planDate);

    console.log(`[plan] Step 2: Today is ${now.toISOString()}, dayOfWeek=${dayOfWeek} (0=Sun), planDate=${planDate.toISOString().split("T")[0]}, weekStart=${weekStart}`);

    // Delete ALL existing plans (clean slate)
    await db.from("planned_workouts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await db.from("training_plans").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 1. Load athlete profile
    const { data: athlete, error: athleteErr } = await db
      .from("athlete_profile")
      .select("*")
      .limit(1)
      .single();

    if (athleteErr || !athlete) {
      return NextResponse.json(
        { error: "Athlete profile not found" },
        { status: 404 }
      );
    }

    // 2. Get prior week mileage (BEFORE plan week only — for context)
    const fiveWeeksAgo = new Date(weekStart + "T00:00:00");
    fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);

    const { data: priorActivities } = await db
      .from("activities")
      .select("activity_date, distance_miles")
      .gte("activity_date", fiveWeeksAgo.toISOString().split("T")[0])
      .lt("activity_date", weekStart) // STRICTLY before Monday of plan week
      .eq("activity_type", "run")
      .order("activity_date", { ascending: true });

    const weeklyMileage = computeWeeklyMileage(priorActivities ?? []);
    const priorWeekMileage = weeklyMileage.length > 0
      ? weeklyMileage[weeklyMileage.length - 1]
      : 0;

    console.log(`[plan] Prior weeks mileage: [${weeklyMileage.join(", ")}], most recent: ${priorWeekMileage}`);

    // 3. Determine week number and target mileage
    const phaseStart = athlete.phase_start_date
      ? new Date(athlete.phase_start_date)
      : new Date();
    const weeksSincePhaseStart = Math.max(
      1,
      Math.ceil(
        (Date.now() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
    );

    const isDownWeek = weeksSincePhaseStart > 0 && weeksSincePhaseStart % 4 === 0;
    const targetMileage = calculateTargetMileage(
      priorWeekMileage,
      isDownWeek,
      athlete.goals?.weekly_mileage_target ?? 50
    );

    console.log(`[plan] Step 3: Target mileage: ${targetMileage}, isDownWeek: ${isDownWeek}, priorWeekMileage: ${priorWeekMileage}`);

    // 4. Get recent feedback
    const { data: recentFeedback } = await db
      .from("run_feedback")
      .select("feel_rating")
      .order("created_at", { ascending: false })
      .limit(7);

    const avgFeelRating =
      recentFeedback && recentFeedback.length > 0
        ? recentFeedback.reduce((sum, f) => sum + f.feel_rating, 0) /
          recentFeedback.length
        : null;

    // 5. Load coach learnings (skip injury risk from stale summaries)
    const learnings = await getCoachLearnings();
    const learningStrings = learnings.map((l) => l.insight);

    // Add prior week context
    if (priorWeekMileage > 0) {
      learningStrings.push(
        `[prior_week] Last week: ${Math.round(priorWeekMileage * 10) / 10} miles. This is reference only.`
      );
    }

    // 6. Load recent feedback notes and coach notes
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [feedbackNotesRes, coachNotesRes] = await Promise.all([
      db.from("run_feedback")
        .select("notes, feel_rating, soreness_areas, injury_flag")
        .gte("created_at", sevenDaysAgo)
        .not("notes", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
      db.from("coach_notes")
        .select("note_text, category")
        .gte("note_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const recentFeedbackNotes = (feedbackNotesRes.data ?? [])
      .filter((f: { notes: string | null }) => f.notes)
      .map((f: { notes: string; feel_rating: number; injury_flag: boolean }) =>
        `[feel:${f.feel_rating}/10${f.injury_flag ? ", INJURY FLAG" : ""}] ${f.notes}`
      );

    const recentCoachNotes = (coachNotesRes.data ?? [])
      .map((n: { note_text: string; category: string }) => `[${n.category}] ${n.note_text}`);

    // 7. Build context and generate plan
    const preferences = athlete.preferences ?? {
      preferred_long_run_day: "sunday",
      easy_pace_range: "7:30-8:15",
      off_days: ["monday"],
    };

    const context: PlanGenerationContext = {
      currentPhase: athlete.current_phase as TrainingPhase,
      weekNumber: weeksSincePhaseStart,
      currentMileage: priorWeekMileage,
      targetMileage,
      last4WeeksMileage: padWeeklyMileage(weeklyMileage),
      avgFeelRating: avgFeelRating
        ? Math.round(avgFeelRating * 10) / 10
        : null,
      injuryRiskScore: 20, // Default low — don't let stale data reduce the plan
      coachLearnings: learningStrings,
      recentFeedbackNotes,
      recentCoachNotes,
      preferences,
    };

    console.log("[plan] Step 4: Calling Gemini API via generateWeeklyPlan...");
    const plan = await generateWeeklyPlan(context);
    console.log("[plan] Step 5: Gemini response received, workouts:", plan.workouts.length);

    // 8. Save training plan to DB
    const { data: savedPlan, error: planErr } = await db
      .from("training_plans")
      .insert({
        week_start: weekStart,
        week_number: weeksSincePhaseStart,
        phase: athlete.current_phase,
        target_mileage: targetMileage,
        coach_notes: plan.coachNotes,
      })
      .select("id")
      .single();

    if (planErr || !savedPlan) {
      return NextResponse.json(
        { error: `Failed to save plan: ${planErr?.message}` },
        { status: 500 }
      );
    }

    // 9. Save individual workouts
    const dayToDate = buildWeekDates(weekStart);

    const workoutRows = plan.workouts.map((w) => ({
      plan_id: savedPlan.id,
      workout_date: dayToDate[w.day.toLowerCase()] ?? weekStart,
      workout_type: w.workout_type,
      description: w.description,
      target_distance: w.distance,
      target_pace_range: w.pace_guidance || null,
      target_hr_zone: w.hr_zone || null,
      warmup: null,
      cooldown: null,
    }));

    const { error: workoutErr } = await db
      .from("planned_workouts")
      .insert(workoutRows);

    if (workoutErr) {
      console.error("[plan] Step 6 FAILED: workout save error:", workoutErr);
      return NextResponse.json(
        { error: `Failed to save workouts: ${workoutErr.message}` },
        { status: 500 }
      );
    }

    console.log("[plan] Step 6: Plan and workouts saved to database successfully");

    return NextResponse.json({
      plan_id: savedPlan.id,
      week_start: weekStart,
      week_number: weeksSincePhaseStart,
      target_mileage: targetMileage,
      is_down_week: isDownWeek,
      prior_week_mileage: Math.round(priorWeekMileage * 10) / 10,
      workouts: plan.workouts,
      coach_notes: plan.coachNotes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : "";
    console.error("[plan] FATAL ERROR:", message);
    console.error("[plan] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Helpers ----

function computeWeeklyMileage(
  activities: { activity_date: string; distance_miles: number | null }[]
): number[] {
  if (activities.length === 0) return [];

  const byWeek = new Map<string, number>();

  for (const a of activities) {
    const weekKey = getWeekStart(new Date(a.activity_date));
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + (a.distance_miles ?? 0));
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, miles]) => Math.round(miles * 10) / 10);
}

function padWeeklyMileage(weeks: number[]): number[] {
  const last4 = weeks.slice(-4);
  while (last4.length < 4) last4.unshift(0);
  return last4;
}

function calculateTargetMileage(
  priorWeekMileage: number,
  isDownWeek: boolean,
  goalMileage: number
): number {
  // Returning from break or no recent data — start at 25 mpw
  if (priorWeekMileage < 15) {
    return 25;
  }

  if (isDownWeek) {
    return Math.round(priorWeekMileage * 0.75 * 10) / 10;
  }

  // 8% increase, capped at goal
  const increased = priorWeekMileage * 1.08;
  return Math.round(Math.min(increased, goalMileage) * 10) / 10;
}

function buildWeekDates(weekStart: string): Record<string, string> {
  const days = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
  ];
  const start = new Date(weekStart + "T00:00:00");
  const map: Record<string, string> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    map[days[i]] = `${yyyy}-${mm}-${dd}`;
  }

  return map;
}
