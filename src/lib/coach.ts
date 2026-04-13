import { createServiceClient } from "@/lib/db";
import type {
  TrainingPhase,
  PlannedWorkoutData,
  CoachLearning,
  Activity,
} from "@/types";

// ---- Gemini API ----

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
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
- Acknowledge the athlete's competitive history and ambitions while keeping them healthy

## Athlete Feedback
Pay close attention to the athlete's free text feedback. These notes contain subjective information about how training feels that numbers alone can't capture. Use this to adjust upcoming workouts — for example, if the athlete reports knee tightness, reduce volume and avoid hills. If they report feeling strong and wanting more, you can be slightly more aggressive with the next week's plan. Always acknowledge their feedback in your coach notes.`;

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
  recentFeedbackNotes: string[];
  recentCoachNotes: string[];
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
  const isDownWeek = ctx.weekNumber > 0 && ctx.weekNumber % 4 === 0;

  const userPrompt = `Generate this week's training plan.

CRITICAL ATHLETE CONTEXT:
This athlete has a strong aerobic base (2:47 marathon in Oct 2025, 1:19 half marathon). Even when returning from a short break, starting mileage should be 20-25 mpw, NOT beginner levels. He is resuming training after a 2-week injury break in March 2026. He is NOT a beginner runner.

MANDATORY MILEAGE TARGET:
- THIS WEEK'S RUNNING TARGET: EXACTLY ${ctx.targetMileage} miles across Monday through Sunday
- You MUST prescribe runs that sum to ${ctx.targetMileage} miles total. This is non-negotiable.
- Prior week mileage (${ctx.currentMileage} mi) is BACKGROUND CONTEXT ONLY — do NOT subtract it
- Do NOT reduce the target for any reason. The target has already been adjusted for the athlete's situation.
- The only acceptable total is ${ctx.targetMileage} miles of running (±1 mile).

CURRENT STATUS:
- Current phase: ${ctx.currentPhase} (week ${ctx.weekNumber})
- Prior week mileage: ${ctx.currentMileage} miles (background context, NOT part of this plan)
- THIS WEEK: prescribe EXACTLY ${ctx.targetMileage} miles of running across Mon-Sun${isDownWeek ? " (DOWN WEEK)" : ""}
- Last 4 weeks mileage: [${ctx.last4WeeksMileage.join(", ")}]
- Average feel rating last week: ${ctx.avgFeelRating ?? "no data"}
- Current injury risk score: ${ctx.injuryRiskScore}/100
- Coach learnings about this athlete: ${ctx.coachLearnings.length > 0 ? ctx.coachLearnings.join("; ") : "none yet"}
- Schedule preferences: long run on ${ctx.preferences.preferred_long_run_day}, off days: ${ctx.preferences.off_days.join(", ")}, easy pace range: ${ctx.preferences.easy_pace_range}/mi
${ctx.recentFeedbackNotes.length > 0 ? `
RECENT ATHLETE FEEDBACK (last 7 days — pay attention to these):
${ctx.recentFeedbackNotes.map((n) => `- "${n}"`).join("\n")}
` : ""}${ctx.recentCoachNotes.length > 0 ? `
ATHLETE NOTES TO COACH (recent):
${ctx.recentCoachNotes.map((n) => `- "${n}"`).join("\n")}
` : ""}
PHASE-SPECIFIC RULES FOR ${ctx.currentPhase.toUpperCase().replace("_", " ")}:
${getPhaseRules(ctx.currentPhase, ctx.preferences.easy_pace_range, isDownWeek)}
- The target mileage has already been calculated accounting for safe progression — prescribe it as given

MULTI-SESSION DAYS:
- Prescribe complementary sessions alongside runs: strength, mobility, yoga, drills
- During base building: 3 strength sessions + 2 mobility/yoga sessions per week
- Strength days should align with easy run days (NEVER on long run day or rest day before long run)
- Mobility/yoga on rest days or after long runs for recovery
- Mobility routines: hip openers, ankle mobility, thoracic spine, hamstring flexibility
- Each day can have MULTIPLE workouts in the array (e.g. an easy run + a strength session)
- workout_type options: easy, long_run, tempo, intervals, recovery, off, cross_train, strides, strength, mobility, yoga, drills
- For strength/mobility/yoga: distance=0, pace_guidance="", hr_zone=""

Respond with valid JSON in this exact format:
{
  "workouts": [
    {
      "day": "monday",
      "workout_type": "off|easy|long_run|tempo|intervals|recovery|cross_train|strides|strength|mobility|yoga|drills",
      "distance": 0,
      "pace_guidance": "string or empty for non-run sessions",
      "hr_zone": "string or empty for non-run sessions",
      "description": "short description of the workout",
      "coach_rationale": "why this session on this day"
    }
  ],
  "coach_notes": "2-3 sentence summary of the week's plan, training philosophy, and any cautions. MUST include: remind the athlete to reduce any run if they feel pain or excessive fatigue, and that the coach will adapt future weeks based on feedback."
}

The workouts array can have MORE than 7 entries — each day can have multiple sessions (e.g. a run + strength on the same day). Running distances MUST sum to EXACTLY ${ctx.targetMileage} miles (±1 mile). Do NOT prescribe less. Do NOT reduce the target.`;

  const text = await callGemini(COACH_SYSTEM_PROMPT, userPrompt);

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

Respond with valid JSON in this exact format:
{
  "analysis": "2-4 paragraph weekly analysis covering what happened, what went well, concerns",
  "injury_risk_score": 0-100,
  "recommendations": ["specific recommendation 1", "recommendation 2"],
  "new_learnings": [
    {
      "category": "injury_pattern|optimal_volume|recovery_needs|race_readiness",
      "insight": "specific insight learned about this athlete this week",
      "confidence": 0.0-1.0
    }
  ]
}

Only include new_learnings if you genuinely observed something new or that updates existing knowledge. It's fine to return an empty array. Be conservative with confidence scores.`;

  const text = await callGemini(COACH_SYSTEM_PROMPT, userPrompt);

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

// ---- Phase-specific rules ----

function getPhaseRules(
  phase: TrainingPhase,
  easyPaceRange: string,
  isDownWeek: boolean
): string {
  switch (phase) {
    case "base_building":
      return `- ALL runs at easy/conversational pace (${easyPaceRange}/mi)
- ONE long run per week (25-30% of weekly mileage)
- Strides (4-6 x 100m) after easy runs 2x per week — these are the ONLY non-easy efforts allowed
- NO tempo, NO intervals, NO speed work
- If this is a down week (every 4th week), reduce volume 20-25%${isDownWeek ? "\n- THIS IS A DOWN WEEK — reduce volume 20-25%" : ""}`;

    case "build":
      return `- Maintain 80/20 easy-to-hard ratio
- ONE tempo run per week (20-30 min at lactate threshold pace, ~6:15-6:30/mi)
- ONE interval or fartlek session per week (e.g. 6x800m or 4x1 mile with recovery jogs)
- Long run can include marathon pace segments (last 2-4 miles at 6:05-6:10/mi)
- ONE long run per week (25-30% of weekly mileage)
- Remaining runs are easy/recovery pace (${easyPaceRange}/mi)
- Strides 2x per week after easy runs
- Down week every 4th week (reduce volume 20-25%)${isDownWeek ? "\n- THIS IS A DOWN WEEK — reduce volume 20-25%, keep one quality session but shorter" : ""}`;

    case "peak":
      return `- TWO quality sessions per week at race-specific intensities
- Quality session 1: Race-pace workout (tempo at marathon pace or intervals at half-marathon pace)
- Quality session 2: VO2max or speed session (shorter, sharper — 400m-1200m repeats)
- Long run with significant race-pace component (6-10 miles at marathon pace)
- MAINTAIN but DO NOT INCREASE weekly mileage — hold steady
- Remaining runs easy/recovery (${easyPaceRange}/mi)
- Down week every 3rd week${isDownWeek ? "\n- THIS IS A DOWN WEEK — one quality session only, reduced volume" : ""}`;

    case "taper":
      return `- REDUCE volume 20% per week over 2-3 weeks
- Keep 1-2 SHORT intensity sessions to maintain sharpness (reduced duration, same pace)
- Example: 4x400m instead of 8x400m, 15 min tempo instead of 30 min
- Long run reduces significantly (10-12 mi → 8 mi → 5 mi)
- Increase rest days
- Focus on feeling fresh, NOT fitness gains — the work is done
- Easy runs at ${easyPaceRange}/mi`;

    case "recovery":
      return `- Volume at 50% of peak mileage
- ALL runs easy/conversational — NO workouts, NO tempo, NO intervals, NO strides
- Focus on rest, sleep, nutrition, and soft tissue work
- Include cross-training options (swimming, cycling) if desired
- Easy runs at ${easyPaceRange}/mi or slower
- Off days are encouraged — typically 3-4 runs per week maximum`;

    default:
      return `- Follow standard periodization
- Maintain 80/20 easy-to-hard ratio`;
  }
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
