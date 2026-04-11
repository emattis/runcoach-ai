import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import {
  evaluatePhaseTransition,
  type PhaseEvalInput,
} from "@/lib/phase-manager";
import { getWeekStart } from "@/lib/utils";
import type { TrainingPhase } from "@/types";

/**
 * GET /api/coach/phase
 * Evaluate if the athlete is ready for a phase transition.
 */
export async function GET() {
  const db = createServiceClient();

  try {
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const [athleteRes, activitiesRes, feedbackRes, riskRes, injuryFlagRes] =
      await Promise.all([
        db.from("athlete_profile").select("*").limit(1).single(),
        db
          .from("activities")
          .select("activity_date, distance_miles")
          .gte("activity_date", eightWeeksAgo.toISOString().split("T")[0])
          .eq("activity_type", "run")
          .order("activity_date", { ascending: true }),
        db
          .from("run_feedback")
          .select("feel_rating, created_at")
          .gte(
            "created_at",
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
          )
          .order("created_at", { ascending: false }),
        db
          .from("weekly_summaries")
          .select("injury_risk_score")
          .order("week_start", { ascending: false })
          .limit(1)
          .single(),
        db
          .from("run_feedback")
          .select("injury_flag")
          .eq("injury_flag", true)
          .gte("created_at", threeWeeksAgo.toISOString()),
      ]);

    const athlete = athleteRes.data;
    if (!athlete) {
      return NextResponse.json(
        { error: "Athlete profile not found" },
        { status: 404 }
      );
    }

    // Compute weekly mileages
    const activities: { activity_date: string; distance_miles: number | null }[] =
      activitiesRes.data ?? [];
    const weekMap = new Map<string, number>();
    for (const a of activities) {
      const wk = getWeekStart(new Date(a.activity_date));
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + (a.distance_miles ?? 0));
    }
    const weeklyMileages = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]) => Math.round(m * 10) / 10);

    // Weeks in phase
    const phaseStart = athlete.phase_start_date
      ? new Date(athlete.phase_start_date)
      : new Date();
    const weeksInPhase = Math.max(
      1,
      Math.ceil(
        (Date.now() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
    );

    const feedbackData: { feel_rating: number }[] = feedbackRes.data ?? [];
    const recentFeelRatings = feedbackData.map((f) => f.feel_rating);

    const input: PhaseEvalInput = {
      currentPhase: athlete.current_phase as TrainingPhase,
      phaseStartDate: athlete.phase_start_date,
      weeklyMileages,
      recentFeelRatings,
      injuryRiskScore: riskRes.data?.injury_risk_score ?? 20,
      recentInjuryFlags: injuryFlagRes.data?.length ?? 0,
      targetRace: null, // TODO: pull from athlete goals when race dates are added
      weeksInPhase,
    };

    const result = evaluatePhaseTransition(input);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Phase evaluation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/coach/phase
 * Execute a phase transition.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { new_phase } = body;

  if (!new_phase) {
    return NextResponse.json(
      { error: "Missing new_phase" },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  try {
    const { data: athlete } = await db
      .from("athlete_profile")
      .select("id, current_phase")
      .limit(1)
      .single();

    if (!athlete) {
      return NextResponse.json(
        { error: "Athlete profile not found" },
        { status: 404 }
      );
    }

    const oldPhase = athlete.current_phase;
    const today = new Date().toISOString().split("T")[0];

    // Update phase
    const { error } = await db
      .from("athlete_profile")
      .update({
        current_phase: new_phase,
        phase_start_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", athlete.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update phase: ${error.message}` },
        { status: 500 }
      );
    }

    // Log the transition as a coach learning
    await db.from("coach_learnings").insert({
      category: "race_readiness",
      insight: `Phase transition: ${oldPhase} → ${new_phase} on ${today}. Training progressed successfully through ${oldPhase} phase.`,
      confidence: 0.9,
      evidence: [
        {
          source: "phase_transition",
          old_phase: oldPhase,
          new_phase,
          date: today,
        },
      ],
    });

    return NextResponse.json({
      success: true,
      old_phase: oldPhase,
      new_phase,
      phase_start_date: today,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Phase transition error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
