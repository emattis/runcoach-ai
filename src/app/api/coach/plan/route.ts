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
 * Generate a new weekly training plan for the current Monday-Sunday week.
 *
 * If a plan already exists for this week, it will be replaced.
 * Recent activities (including prior days this week) are used as context
 * but NOT included as planned workouts — the plan covers Mon-Sun.
 */
export async function POST() {
  const db = createServiceClient();

  try {
    // Determine the target week (current Monday-Sunday)
    const weekStart = getWeekStart(new Date());

    // Delete any existing plan for this week (allows regeneration)
    const { data: existingPlans } = await db
      .from("training_plans")
      .select("id")
      .eq("week_start", weekStart);

    if (existingPlans && existingPlans.length > 0) {
      const planIds = existingPlans.map((p) => p.id);
      await db.from("planned_workouts").delete().in("plan_id", planIds);
      await db.from("training_plans").delete().in("id", planIds);
    }

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

    // 2. Get last 4 weeks of mileage from activities (includes this week's runs as context)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const { data: recentActivities } = await db
      .from("activities")
      .select("activity_date, distance_miles")
      .gte("activity_date", fourWeeksAgo.toISOString().split("T")[0])
      .eq("activity_type", "run")
      .order("activity_date", { ascending: true });

    // Bucket into weeks
    const weeklyMileage = computeWeeklyMileage(recentActivities ?? []);

    // Last completed week's mileage (not the current partial week)
    const lastWeekStart = getWeekStart(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const lastWeekMileage = weeklyMileage.length > 0
      ? weeklyMileage[weeklyMileage.length - 1]
      : 0;

    // Current (partial) week mileage — for context, not for target calculation
    const thisWeekActivities = (recentActivities ?? []).filter(
      (a: { activity_date: string }) => a.activity_date >= weekStart
    );
    const thisWeekMileageSoFar = thisWeekActivities.reduce(
      (sum: number, a: { distance_miles: number | null }) => sum + (a.distance_miles ?? 0),
      0
    );

    // Use last completed week for target calculation
    const currentMileage = lastWeekMileage;

    // 3. Determine week number within current phase
    const phaseStart = athlete.phase_start_date
      ? new Date(athlete.phase_start_date)
      : new Date();
    const weeksSincePhaseStart = Math.max(
      1,
      Math.ceil(
        (Date.now() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
    );

    // 4. Calculate target mileage
    const isDownWeek = weeksSincePhaseStart > 0 && weeksSincePhaseStart % 4 === 0;
    const targetMileage = calculateTargetMileage(
      currentMileage,
      isDownWeek,
      athlete.goals?.weekly_mileage_target ?? 50
    );

    // 5. Get latest feedback averages
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

    // 6. Get latest weekly summary (injury risk + recommendations)
    const { data: latestSummary } = await db
      .from("weekly_summaries")
      .select("injury_risk_score, recommendations")
      .order("week_start", { ascending: false })
      .limit(1)
      .single();

    const injuryRiskScore = latestSummary?.injury_risk_score ?? 20;

    // 7. Load coach learnings + recent analysis recommendations
    const learnings = await getCoachLearnings();
    const learningStrings = learnings.map((l) => l.insight);

    // Include recent analysis recommendations in the coaching context
    if (latestSummary?.recommendations) {
      const recs = Array.isArray(latestSummary.recommendations)
        ? latestSummary.recommendations
        : [];
      for (const rec of recs) {
        learningStrings.push(`[recent_recommendation] ${rec}`);
      }
    }

    // 8. Load recent feedback notes and coach notes
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

    // Include this-week context in learnings if athlete already ran
    if (thisWeekMileageSoFar > 0) {
      learningStrings.push(
        `[this_week_context] Athlete has already run ${Math.round(thisWeekMileageSoFar * 10) / 10} miles this week (before this plan starts). Account for this accumulated fatigue when planning the rest of the week.`
      );
    }

    // 9. Build context and generate plan
    const preferences = athlete.preferences ?? {
      preferred_long_run_day: "sunday",
      easy_pace_range: "7:30-8:15",
      off_days: ["monday"],
    };

    const context: PlanGenerationContext = {
      currentPhase: athlete.current_phase as TrainingPhase,
      weekNumber: weeksSincePhaseStart,
      currentMileage,
      targetMileage,
      last4WeeksMileage: padWeeklyMileage(weeklyMileage),
      avgFeelRating: avgFeelRating
        ? Math.round(avgFeelRating * 10) / 10
        : null,
      injuryRiskScore,
      coachLearnings: learningStrings,
      recentFeedbackNotes,
      recentCoachNotes,
      preferences,
    };

    const plan = await generateWeeklyPlan(context);

    // 10. Save training plan to DB

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

    // 10. Save individual workouts
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
      return NextResponse.json(
        { error: `Failed to save workouts: ${workoutErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      plan_id: savedPlan.id,
      week_start: weekStart,
      week_number: weeksSincePhaseStart,
      target_mileage: targetMileage,
      is_down_week: isDownWeek,
      workouts: plan.workouts,
      coach_notes: plan.coachNotes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Plan generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Helpers ----

/** Bucket activities into weekly mileage totals (Mon-Sun weeks) */
function computeWeeklyMileage(
  activities: { activity_date: string; distance_miles: number | null }[]
): number[] {
  if (activities.length === 0) return [];

  const byWeek = new Map<string, number>();

  for (const a of activities) {
    const weekKey = getWeekStart(new Date(a.activity_date));
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + (a.distance_miles ?? 0));
  }

  // Sort by week and return mileage values
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, miles]) => Math.round(miles * 10) / 10);
}

/** Pad to exactly 4 entries (fill leading zeros if fewer weeks) */
function padWeeklyMileage(weeks: number[]): number[] {
  const last4 = weeks.slice(-4);
  while (last4.length < 4) last4.unshift(0);
  return last4;
}

/**
 * Calculate target mileage for next week.
 * - Returning from break or no data: start at 25 mpw (athlete has 2:47 marathon base)
 * - Down week: 75% of current
 * - Normal: 8% increase, capped at goal
 */
function calculateTargetMileage(
  currentMileage: number,
  isDownWeek: boolean,
  goalMileage: number
): number {
  // Returning from break or no recent data — start at 25 mpw
  // This athlete has a strong aerobic base, not a beginner
  if (currentMileage < 15) {
    return 25;
  }

  if (isDownWeek) {
    return Math.round(currentMileage * 0.75 * 10) / 10;
  }

  // 8% increase, capped at goal
  const increased = currentMileage * 1.08;
  return Math.round(Math.min(increased, goalMileage) * 10) / 10;
}

/** Build a map of day name -> YYYY-MM-DD for the week starting at weekStart */
function buildWeekDates(weekStart: string): Record<string, string> {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
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
