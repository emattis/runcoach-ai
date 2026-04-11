export interface InjuryRiskInput {
  last4WeeksMileage: number[];
  currentWeekMileage: number;
  recentFeedback: {
    feel_rating: number;
    soreness_level: number;
    sleep_quality: number;
    injury_flag: boolean;
  }[];
}

export interface InjuryRiskResult {
  score: number;
  factors: string[];
  recommendation: string;
}

/**
 * Calculate injury risk score (0-100) from training load and feedback data.
 *
 * Factors:
 * - Acute-to-chronic workload ratio (ACWR)
 * - Week-over-week mileage ramp rate
 * - Soreness trend (last 3 feedback entries)
 * - Sleep quality trend
 * - Feel rating trend
 * - Injury flags in recent feedback
 */
export function calculateInjuryRisk(input: InjuryRiskInput): InjuryRiskResult {
  let score = 0;
  const factors: string[] = [];

  const { last4WeeksMileage, currentWeekMileage, recentFeedback } = input;

  // ---- 1. Acute-to-chronic workload ratio ----
  const chronicAvg =
    last4WeeksMileage.length > 0
      ? last4WeeksMileage.reduce((s, m) => s + m, 0) / last4WeeksMileage.length
      : 0;

  if (chronicAvg > 0) {
    const acwr = currentWeekMileage / chronicAvg;
    if (acwr > 1.3) {
      score += 30;
      factors.push(`ACWR ${acwr.toFixed(2)} — acute load far exceeds chronic average`);
    } else if (acwr > 1.2) {
      score += 20;
      factors.push(`ACWR ${acwr.toFixed(2)} — acute load elevated vs chronic`);
    } else if (acwr > 1.1) {
      score += 10;
      factors.push(`ACWR ${acwr.toFixed(2)} — slight acute load increase`);
    }
  }

  // ---- 2. Mileage ramp rate ----
  const lastWeekMileage =
    last4WeeksMileage.length > 0
      ? last4WeeksMileage[last4WeeksMileage.length - 1]
      : 0;

  if (lastWeekMileage > 0) {
    const rampPct =
      ((currentWeekMileage - lastWeekMileage) / lastWeekMileage) * 100;
    if (rampPct > 15) {
      score += 20;
      factors.push(`Mileage ramp ${Math.round(rampPct)}% — well above safe threshold`);
    } else if (rampPct > 10) {
      score += 10;
      factors.push(`Mileage ramp ${Math.round(rampPct)}% — at upper limit`);
    } else if (rampPct > 5) {
      score += 5;
      factors.push(`Mileage ramp ${Math.round(rampPct)}% — moderate increase`);
    }
  }

  // ---- Recent feedback trends (last 3 entries) ----
  const recent3 = recentFeedback.slice(0, 3);

  if (recent3.length > 0) {
    // 3. Soreness trend
    const avgSoreness =
      recent3.reduce((s, f) => s + f.soreness_level, 0) / recent3.length;
    if (avgSoreness > 6) {
      score += 15;
      factors.push(`Avg soreness ${avgSoreness.toFixed(1)}/10 — elevated`);
    } else if (avgSoreness > 4) {
      score += 10;
      factors.push(`Avg soreness ${avgSoreness.toFixed(1)}/10 — moderate`);
    } else if (avgSoreness > 2) {
      score += 5;
      factors.push(`Avg soreness ${avgSoreness.toFixed(1)}/10 — mild`);
    }

    // 4. Sleep quality trend
    const avgSleep =
      recent3.reduce((s, f) => s + f.sleep_quality, 0) / recent3.length;
    if (avgSleep < 5) {
      score += 10;
      factors.push(`Avg sleep quality ${avgSleep.toFixed(1)}/10 — poor`);
    } else if (avgSleep < 7) {
      score += 5;
      factors.push(`Avg sleep quality ${avgSleep.toFixed(1)}/10 — below ideal`);
    }

    // 5. Feel rating trend
    const avgFeel =
      recent3.reduce((s, f) => s + f.feel_rating, 0) / recent3.length;
    if (avgFeel < 5) {
      score += 10;
      factors.push(`Avg feel rating ${avgFeel.toFixed(1)}/10 — low`);
    } else if (avgFeel < 6) {
      score += 5;
      factors.push(`Avg feel rating ${avgFeel.toFixed(1)}/10 — below average`);
    }
  }

  // ---- 6. Injury flags ----
  const injuryFlagCount = recentFeedback.filter((f) => f.injury_flag).length;
  if (injuryFlagCount > 0) {
    score += injuryFlagCount * 15;
    factors.push(
      `${injuryFlagCount} injury flag${injuryFlagCount > 1 ? "s" : ""} in recent feedback`
    );
  }

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score));

  // Recommendation
  let recommendation: string;
  if (score > 85) {
    recommendation =
      "Mandatory recovery week. Reduce volume 30-40% and eliminate all intensity. Prioritize sleep and soft tissue work.";
  } else if (score > 70) {
    recommendation =
      "Reduce volume 15-20% this week. Keep all runs easy. Monitor soreness and sleep closely.";
  } else if (score > 50) {
    recommendation =
      "Proceed with caution. Stick to the plan but be ready to cut a run short if anything feels off.";
  } else if (score > 30) {
    recommendation =
      "Moderate risk. Continue as planned but prioritize recovery between sessions.";
  } else {
    recommendation =
      "Low risk. Good to continue building as planned.";
  }

  return { score, factors, recommendation };
}
