import type { TrainingPhase } from "@/types";

interface PlanGenerationContext {
  currentMileage: number;
  targetMileage: number;
  phase: TrainingPhase;
  weekNumber: number;
  mileageHistory: number[];
  avgFeel: number;
  riskScore: number;
  coachLearnings: string[];
  preferences: Record<string, unknown>;
}

export function buildPlanPrompt(ctx: PlanGenerationContext): string {
  return `You are an elite road running coach. Generate this week's training plan.

ATHLETE CONTEXT:
- Current weekly mileage: ${ctx.currentMileage} miles
- Target mileage this week: ${ctx.targetMileage} miles
- Phase: ${ctx.phase} (week ${ctx.weekNumber})
- Last 4 weeks mileage: ${ctx.mileageHistory.join(", ")}
- Average feel rating last week: ${ctx.avgFeel}
- Injury risk score: ${ctx.riskScore}/100
- Known patterns: ${ctx.coachLearnings.join("; ")}
- Schedule preferences: ${JSON.stringify(ctx.preferences)}

RULES:
- ALL runs are easy/conversational pace during base building
- One long run per week (25-30% of weekly mileage)
- Include 4-6 strides (100m accelerations) 2x/week after easy runs
- Down week every 4th week (reduce volume 20-25%)
- Never increase weekly mileage more than 10%
- If injury risk > 60, reduce planned volume by 10-15%

OUTPUT: JSON array of 7 daily workout objects with fields:
  day, workout_type, distance, pace_guidance, hr_zone, description, coach_rationale`;
}

export function buildWeeklyReviewPrompt(
  weekData: Record<string, unknown>
): string {
  return `You are an elite road running coach reviewing this athlete's week.

WEEK DATA:
${JSON.stringify(weekData, null, 2)}

Provide:
1. Summary of the week (2-3 sentences)
2. What went well
3. Areas of concern
4. Injury risk assessment (0-100 with reasoning)
5. Recommendations for next week
6. Any new learnings about this athlete`;
}
