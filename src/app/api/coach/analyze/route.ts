import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import {
  generateWeeklyAnalysis,
  getCoachLearnings,
  saveCoachLearning,
  type AnalysisContext,
} from "@/lib/coach";
import { getWeekStart } from "@/lib/utils";
import type { Activity, TrainingPhase } from "@/types";

/**
 * POST /api/coach/analyze
 * Run the weekly analysis: gather data, call AI, save results.
 */
export async function POST() {
  const db = createServiceClient();
  const weekStart = getWeekStart(new Date());

  try {
    // 1. Load athlete profile
    const { data: athlete } = await db
      .from("athlete_profile")
      .select("current_phase")
      .limit(1)
      .single();

    const currentPhase = (athlete?.current_phase ?? "base_building") as TrainingPhase;

    // 2. Pull this week's data in parallel
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const [activitiesRes, plannedRes, feedbackRes, pastActivitiesRes] =
      await Promise.all([
        // This week's activities
        db
          .from("activities")
          .select("*")
          .gte("activity_date", weekStart)
          .eq("activity_type", "run")
          .order("activity_date", { ascending: true }),
        // This week's planned workouts
        db
          .from("planned_workouts")
          .select("target_distance, completed")
          .gte("workout_date", weekStart)
          .lte(
            "workout_date",
            (() => {
              const d = new Date(weekStart + "T00:00:00");
              d.setDate(d.getDate() + 6);
              return d.toISOString().split("T")[0];
            })()
          ),
        // This week's feedback
        db
          .from("run_feedback")
          .select(
            "feel_rating, soreness_level, soreness_areas, sleep_quality, sleep_hours, injury_flag"
          )
          .gte("created_at", new Date(weekStart + "T00:00:00").toISOString())
          .order("created_at", { ascending: true }),
        // Last 4 weeks of activities (for mileage trend)
        db
          .from("activities")
          .select("activity_date, distance_miles")
          .gte("activity_date", fourWeeksAgo.toISOString().split("T")[0])
          .lt("activity_date", weekStart)
          .eq("activity_type", "run")
          .order("activity_date", { ascending: true }),
      ]);

    const activities: Activity[] = activitiesRes.data ?? [];
    const planned = plannedRes.data ?? [];
    const feedback: {
      feel_rating: number;
      soreness_level: number;
      soreness_areas: string[];
      sleep_quality: number;
      sleep_hours: number;
      injury_flag: boolean;
    }[] = feedbackRes.data ?? [];
    const pastActivities: { activity_date: string; distance_miles: number | null }[] =
      pastActivitiesRes.data ?? [];

    // 3. Compute metrics
    const actualMileage = activities.reduce(
      (sum, a) => sum + (a.distance_miles ?? 0),
      0
    );
    const totalRuns = activities.length;

    const paces = activities
      .map((a) => a.avg_pace_per_mile)
      .filter((p): p is number => p !== null);
    const avgEasyPace =
      paces.length > 0
        ? paces.reduce((s, p) => s + p, 0) / paces.length
        : null;

    const longRunDistance = activities.reduce(
      (max, a) => Math.max(max, a.distance_miles ?? 0),
      0
    );

    const plannedMileage = planned.reduce(
      (sum, w) => sum + ((w.target_distance as number) ?? 0),
      0
    );
    const completedCount = planned.filter((w) => w.completed).length;
    const planAdherence =
      planned.length > 0
        ? Math.round((completedCount / planned.length) * 100)
        : 0;

    // Feedback averages
    const avgFeelRating =
      feedback.length > 0
        ? feedback.reduce((s, f) => s + f.feel_rating, 0) / feedback.length
        : null;
    const avgSleepQuality =
      feedback.length > 0
        ? feedback.reduce((s, f) => s + f.sleep_quality, 0) / feedback.length
        : null;
    const avgSorenessLevel =
      feedback.length > 0
        ? feedback.reduce((s, f) => s + f.soreness_level, 0) / feedback.length
        : null;
    const injuryFlags = feedback.filter((f) => f.injury_flag).length;

    // Common soreness areas
    const areaCounts = new Map<string, number>();
    for (const f of feedback) {
      for (const area of f.soreness_areas ?? []) {
        areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
      }
    }
    const commonSorenessAreas = [...areaCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([area]) => area);

    // Last 4 weeks mileage
    const weeklyMap = new Map<string, number>();
    for (const a of pastActivities) {
      const wk = getWeekStart(new Date(a.activity_date));
      weeklyMap.set(wk, (weeklyMap.get(wk) ?? 0) + (a.distance_miles ?? 0));
    }
    const last4WeeksMileage = [...weeklyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-4)
      .map(([, m]) => Math.round(m * 10) / 10);
    while (last4WeeksMileage.length < 4) last4WeeksMileage.unshift(0);

    // 4. Load existing learnings
    const learnings = await getCoachLearnings();
    const learningStrings = learnings.map(
      (l) => `[${l.category}] ${l.insight}`
    );

    // 5. Call AI analysis
    const context: AnalysisContext = {
      completedActivities: activities,
      plannedMileage: Math.round(plannedMileage * 10) / 10,
      actualMileage: Math.round(actualMileage * 10) / 10,
      feedbackSummary: {
        avgFeelRating: avgFeelRating
          ? Math.round(avgFeelRating * 10) / 10
          : null,
        avgSleepQuality: avgSleepQuality
          ? Math.round(avgSleepQuality * 10) / 10
          : null,
        avgSorenessLevel: avgSorenessLevel
          ? Math.round(avgSorenessLevel * 10) / 10
          : null,
        injuryFlags,
        commonSorenessAreas,
      },
      last4WeeksMileage,
      currentPhase,
      existingLearnings: learningStrings,
    };

    const result = await generateWeeklyAnalysis(context);

    // 6. Save to weekly_summaries
    const { error: summaryErr } = await db.from("weekly_summaries").upsert(
      {
        week_start: weekStart,
        total_mileage: Math.round(actualMileage * 10) / 10,
        total_runs: totalRuns,
        avg_easy_pace: avgEasyPace ? Math.round(avgEasyPace) : null,
        long_run_distance: Math.round(longRunDistance * 10) / 10,
        avg_feel_rating: avgFeelRating
          ? Math.round(avgFeelRating * 10) / 10
          : null,
        avg_sleep_quality: avgSleepQuality
          ? Math.round(avgSleepQuality * 10) / 10
          : null,
        injury_risk_score: result.injuryRiskScore,
        coach_analysis: result.analysis,
        plan_adherence_pct: planAdherence,
        recommendations: result.recommendations,
      },
      { onConflict: "week_start" }
    );

    if (summaryErr) {
      console.error("Failed to save weekly summary:", summaryErr);
    }

    // 7. Save new learnings
    for (const learning of result.newLearnings) {
      await saveCoachLearning({
        category: learning.category,
        insight: learning.insight,
        confidence: learning.confidence,
        evidence: [
          {
            source: "weekly_analysis",
            week_start: weekStart,
            date: new Date().toISOString().split("T")[0],
          },
        ],
      });
    }

    return NextResponse.json({
      week_start: weekStart,
      total_mileage: Math.round(actualMileage * 10) / 10,
      total_runs: totalRuns,
      plan_adherence_pct: planAdherence,
      analysis: result.analysis,
      injury_risk_score: result.injuryRiskScore,
      recommendations: result.recommendations,
      new_learnings_count: result.newLearnings.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Weekly analysis error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
