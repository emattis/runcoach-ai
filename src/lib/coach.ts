import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/db";
import type {
  TrainingPhase,
  PlannedWorkoutData,
  CoachLearning,
  Activity,
} from "@/types";

// ---- Claude client ----

const MODEL = "claude-sonnet-4-20250514";

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

// ---- System prompt ----

export const COACH_SYSTEM_PROMPT = `You are an elite road running coach with decades of experience coaching competitive amateur runners. Your coaching philosophy blends:

- **Jack Daniels**: VDOT-based training, systematic intensity prescription
- **Pete Pfitzinger**: Mileage-focused periodization, detail-oriented planning
- **Steve Magness**: Modern, holistic, science-forward approach

## Priority Order (non-negotiable)

1. **INJURY PREVENTION** — No workout is worth an injury. When in doubt, do less.
2. **CONSISTENCY** — 50 miles/week for 12 weeks beats 70 miles/week for 3 weeks.
3. **POLARIZED TRAINING** — ~80% easy, ~20% moderate-to-hard. Easy means EASY (conversational, can speak full sentences).
4. **PROGRESSIVE OVERLOAD** — Small, sustainable increases. Max 10% weekly mileage increase (prefer 5-8%), with down weeks every 3-4 weeks.
5. **PERIODIZATION** — Clear phases: base → build → peak → taper → race → recovery.
6. **INDIVIDUALIZATION** — Learn from this athlete's data. Adapt based on what actually works for them.
7. **HOLISTIC VIEW** — Sleep, stress, soreness, and life context all affect training.

## CRITICAL ATHLETE-SPECIFIC RULE

This athlete has a DOCUMENTED PATTERN of injury when ramping mileage AND intensity simultaneously. This has happened multiple times (2023 return-to-running injuries, March 2026 injury from combining volume + intensity ramp).

**During base building phase:**
- ALL runs must be easy/conversational pace
- NO tempo runs, NO intervals, NO speed work
- The ONLY exception is strides (4-6 x 100m accelerations) after easy runs, 2x per week
- If the athlete requests intensity work during base building, PUSH BACK FIRMLY and explain why it's dangerous for them specifically
- Mileage increases must be separated from intensity introduction by at least 4-6 weeks

**Volume management:**
- Prefer 5-8% weekly mileage increases over the standard 10%
- Mandatory down week (20-25% reduction) every 3rd or 4th week
- After any layoff, restart conservatively (20-25 mpw all easy)

## Communication Style

- Direct but empathetic — no fluff, no sugar-coating
- ALWAYS explain the "why" behind every prescription
- Push back firmly when the athlete wants to do too much
- Celebrate consistency over flashy workouts
- Use specific paces, distances, and HR zones — never vague
- Acknowledge the athlete's competitive history and ambitions while keeping them healthy`;

// ---- Types ----

export interface PlanGenerationContext {
  currentPhase: TrainingPhase;
  weekNumber: number;
  currentMileage: number;
  targetMileage: number;
  last4WeeksMileage: number[];
  avgFeelRating: number | null;
  injuryRiskScore: number;
  coachLearnings: string[];
  preferences: {
    preferred_long_run_day: string;
    easy_pace_range: string;
    off_days: string[];
  };
}

export interface PlanResult {
  workouts: PlannedWorkoutData[];
  coachNotes: string;
}

export interface AnalysisContext {
  completedActivities: Activity[];
  plannedMileage: number;
  actualMileage: number;
  feedbackSummary: {
    avgFeelRating: number | null;
    avgSleepQuality: number | null;
    avgSorenessLevel: number | null;
    injuryFlags: number;
    commonSorenessAreas: string[];
  };
  last4WeeksMileage: number[];
  currentPhase: TrainingPhase;
  existingLearnings: string[];
}

export interface AnalysisResult {
  analysis: string;
  injuryRiskScore: number;
  recommendations: string[];
  newLearnings: { category: string; insight: string; confidence: number }[];
}

// ---- Plan generation ----

export async function generateWeeklyPlan(
  ctx: PlanGenerationContext
): Promise<PlanResult> {
  const client = getClient();

  const isDownWeek = ctx.weekNumber > 0 && ctx.weekNumber % 4 === 0;

  const userPrompt = `Generate this week's training plan.

ATHLETE CONTEXT:
- Current phase: ${ctx.currentPhase} (week ${ctx.weekNumber})
- Last week's mileage: ${ctx.currentMileage} miles
- Target mileage this week: ${ctx.targetMileage} miles${isDownWeek ? " (DOWN WEEK — reduce volume 20-25%)" : ""}
- Last 4 weeks mileage: [${ctx.last4WeeksMileage.join(", ")}]
- Average feel rating last week: ${ctx.avgFeelRating ?? "no data"}
- Current injury risk score: ${ctx.injuryRiskScore}/100
- Coach learnings about this athlete: ${ctx.coachLearnings.length > 0 ? ctx.coachLearnings.join("; ") : "none yet"}
- Schedule preferences: long run on ${ctx.preferences.preferred_long_run_day}, off days: ${ctx.preferences.off_days.join(", ")}, easy pace range: ${ctx.preferences.easy_pace_range}/mi

PHASE-SPECIFIC RULES FOR ${ctx.currentPhase.toUpperCase().replace("_", " ")}:
${ctx.currentPhase === "base_building" ? `- ALL runs at easy/conversational pace (${ctx.preferences.easy_pace_range}/mi)
- ONE long run per week (25-30% of weekly mileage)
- Strides (4-6 x 100m) after easy runs 2x per week — these are the ONLY non-easy efforts allowed
- NO tempo, NO intervals, NO speed work
- If this is a down week (every 4th week), reduce volume 20-25%` : `- Follow standard periodization for ${ctx.currentPhase} phase
- Maintain 80/20 easy-to-hard ratio`}
- Never increase weekly mileage more than 10% from last week
- If injury risk > 60, reduce planned volume by 10-15%
- If injury risk > 85, prescribe a recovery week regardless of plan

Respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "workouts": [
    {
      "day": "monday",
      "workout_type": "off|easy|long_run|tempo|intervals|recovery|cross_train|strides",
      "distance": 0,
      "pace_guidance": "string or empty for off days",
      "hr_zone": "string or empty for off days",
      "description": "short description of the workout",
      "coach_rationale": "why this workout on this day"
    }
  ],
  "coach_notes": "2-3 sentence summary of the week's plan, training philosophy, and any cautions"
}

The workouts array must have exactly 7 entries (Monday through Sunday). Distances must sum to approximately ${ctx.targetMileage} miles.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed = JSON.parse(text) as {
    workouts: PlannedWorkoutData[];
    coach_notes: string;
  };

  return {
    workouts: parsed.workouts,
    coachNotes: parsed.coach_notes,
  };
}

// ---- Weekly analysis ----

export async function generateWeeklyAnalysis(
  ctx: AnalysisContext
): Promise<AnalysisResult> {
  const client = getClient();

  const userPrompt = `Analyze this athlete's training week.

WEEK DATA:
- Phase: ${ctx.currentPhase}
- Planned mileage: ${ctx.plannedMileage} miles
- Actual mileage: ${ctx.actualMileage} miles (${Math.round((ctx.actualMileage / ctx.plannedMileage) * 100)}% adherence)
- Last 4 weeks mileage trend: [${ctx.last4WeeksMileage.join(", ")}]
- Completed runs: ${ctx.completedActivities.length}

FEEDBACK SUMMARY:
- Average feel rating: ${ctx.feedbackSummary.avgFeelRating ?? "no data"}/10
- Average sleep quality: ${ctx.feedbackSummary.avgSleepQuality ?? "no data"}/10
- Average soreness level: ${ctx.feedbackSummary.avgSorenessLevel ?? "no data"}/10
- Injury flags this week: ${ctx.feedbackSummary.injuryFlags}
- Common soreness areas: ${ctx.feedbackSummary.commonSorenessAreas.length > 0 ? ctx.feedbackSummary.commonSorenessAreas.join(", ") : "none reported"}

COMPLETED ACTIVITIES:
${ctx.completedActivities.map((a) => `- ${a.activity_date}: ${a.distance_miles?.toFixed(1) ?? "?"} mi @ ${a.avg_pace_per_mile ? Math.floor(a.avg_pace_per_mile / 60) + ":" + String(Math.round(a.avg_pace_per_mile % 60)).padStart(2, "0") : "?"}/mi, HR ${a.avg_hr ?? "?"}bpm, effort ${a.perceived_effort ?? "?"}/10`).join("\n")}

EXISTING COACH LEARNINGS:
${ctx.existingLearnings.length > 0 ? ctx.existingLearnings.join("\n") : "None yet"}

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "analysis": "2-4 paragraph weekly analysis covering what happened, what went well, concerns",
  "injury_risk_score": 0-100,
  "recommendations": ["specific recommendation 1", "recommendation 2", ...],
  "new_learnings": [
    {
      "category": "injury_pattern|optimal_volume|recovery_needs|race_readiness",
      "insight": "specific insight learned about this athlete this week",
      "confidence": 0.0-1.0
    }
  ]
}

Only include new_learnings if you genuinely observed something new or that updates existing knowledge. It's fine to return an empty array. Be conservative with confidence scores.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed = JSON.parse(text) as {
    analysis: string;
    injury_risk_score: number;
    recommendations: string[];
    new_learnings: { category: string; insight: string; confidence: number }[];
  };

  return {
    analysis: parsed.analysis,
    injuryRiskScore: parsed.injury_risk_score,
    recommendations: parsed.recommendations,
    newLearnings: parsed.new_learnings,
  };
}

// ---- Coach learnings helpers ----

/** Read all coach learnings from DB, ordered by confidence */
export async function getCoachLearnings(): Promise<CoachLearning[]> {
  const db = createServiceClient();

  const { data, error } = await db
    .from("coach_learnings")
    .select("*")
    .order("confidence", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch coach learnings: ${error.message}`);
  }

  return data ?? [];
}

/** Save a new coach learning to DB */
export async function saveCoachLearning(learning: {
  category: string;
  insight: string;
  confidence: number;
  evidence?: Record<string, unknown>[];
}): Promise<void> {
  const db = createServiceClient();

  const { error } = await db.from("coach_learnings").insert({
    category: learning.category,
    insight: learning.insight,
    confidence: learning.confidence,
    evidence: learning.evidence ?? [],
  });

  if (error) {
    throw new Error(`Failed to save coach learning: ${error.message}`);
  }
}
