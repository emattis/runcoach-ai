import { getWeekStart } from "@/lib/utils";

// ---- Types ----

export interface PatternInput {
  activities: {
    activity_date: string;
    distance_miles: number | null;
    avg_pace_per_mile: number | null;
  }[];
  feedback: {
    activity_id: string;
    feel_rating: number;
    soreness_level: number;
    soreness_areas: string[];
    sleep_quality: number;
    sleep_hours: number;
    injury_flag: boolean;
    created_at: string;
  }[];
  weeklySummaries: {
    week_start: string;
    total_mileage: number;
    avg_feel_rating: number | null;
    injury_risk_score: number;
  }[];
  athletePreferences?: {
    easy_pace_range?: string;
  };
}

export interface DetectedPattern {
  category: string;
  insight: string;
  confidence: number;
  evidence: Record<string, unknown>[];
}

// ---- Main function ----

export function analyzePatterns(input: PatternInput): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const sleepPerf = detectSleepPerformance(input);
  if (sleepPerf) patterns.push(sleepPerf);

  const sweetSpot = detectMileageSweetSpot(input);
  if (sweetSpot) patterns.push(sweetSpot);

  const recovery = detectRecoveryNeeds(input);
  if (recovery) patterns.push(recovery);

  const soreness = detectSorenessPatterns(input);
  if (soreness) patterns.push(soreness);

  const pacing = detectPacingTendency(input);
  if (pacing) patterns.push(pacing);

  // Only return patterns with confidence > 0.6
  return patterns.filter((p) => p.confidence > 0.6);
}

// ---- Pattern Detectors ----

/**
 * Sleep-Performance Correlation:
 * Compare sleep quality to next-day feel rating.
 */
function detectSleepPerformance(
  input: PatternInput
): DetectedPattern | null {
  const fb = input.feedback;
  if (fb.length < 5) return null;

  // Sort by date
  const sorted = [...fb].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let badSleepBadRun = 0;
  let badSleepTotal = 0;
  let goodSleepGoodRun = 0;
  let goodSleepTotal = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.sleep_quality <= 5 || current.sleep_hours < 6) {
      badSleepTotal++;
      if (next.feel_rating <= 5) badSleepBadRun++;
    }

    if (current.sleep_quality >= 7 && current.sleep_hours >= 7) {
      goodSleepTotal++;
      if (next.feel_rating >= 7) goodSleepGoodRun++;
    }
  }

  if (badSleepTotal < 2) return null;

  const badCorrelation = badSleepBadRun / badSleepTotal;
  const goodCorrelation =
    goodSleepTotal > 0 ? goodSleepGoodRun / goodSleepTotal : 0;

  if (badCorrelation < 0.5) return null;

  const confidence = Math.min(0.95, 0.5 + badCorrelation * 0.3 + (badSleepTotal / 10) * 0.15);

  return {
    category: "sleep_performance",
    insight: `Poor sleep (<6hrs or quality ≤5) predicts a bad run ${Math.round(badCorrelation * 100)}% of the time (${badSleepBadRun}/${badSleepTotal} instances). Good sleep correlates with good runs ${Math.round(goodCorrelation * 100)}% of the time. Consider prescribing rest or easy days after bad sleep nights.`,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [
      {
        bad_sleep_bad_run: badSleepBadRun,
        bad_sleep_total: badSleepTotal,
        good_sleep_good_run: goodSleepGoodRun,
        good_sleep_total: goodSleepTotal,
        sample_size: sorted.length,
      },
    ],
  };
}

/**
 * Mileage Sweet Spot:
 * Find the weekly mileage range with the best feel ratings.
 */
function detectMileageSweetSpot(
  input: PatternInput
): DetectedPattern | null {
  const summaries = input.weeklySummaries.filter(
    (s) => s.total_mileage > 0 && s.avg_feel_rating !== null
  );
  if (summaries.length < 4) return null;

  // Bucket into 5-mile ranges
  const buckets = new Map<string, { feels: number[]; injuries: number }>();

  for (const s of summaries) {
    const lower = Math.floor(s.total_mileage / 5) * 5;
    const key = `${lower}-${lower + 5}`;
    if (!buckets.has(key)) buckets.set(key, { feels: [], injuries: 0 });
    const bucket = buckets.get(key)!;
    bucket.feels.push(s.avg_feel_rating!);
    if (s.injury_risk_score > 70) bucket.injuries++;
  }

  // Find the best bucket (highest avg feel, no injuries)
  let bestRange = "";
  let bestAvgFeel = 0;

  for (const [range, data] of buckets) {
    if (data.feels.length < 2) continue;
    const avgFeel = data.feels.reduce((s, f) => s + f, 0) / data.feels.length;
    if (avgFeel > bestAvgFeel && data.injuries === 0) {
      bestAvgFeel = avgFeel;
      bestRange = range;
    }
  }

  if (!bestRange || bestAvgFeel < 6) return null;

  // Check if higher mileage feels worse
  const allMileages = summaries.map((s) => s.total_mileage);
  const maxMileage = Math.max(...allMileages);
  const highMileageWeeks = summaries.filter(
    (s) => s.total_mileage > maxMileage * 0.8
  );
  const highMileageFeel =
    highMileageWeeks.length > 0
      ? highMileageWeeks.reduce((s, w) => s + (w.avg_feel_rating ?? 0), 0) /
        highMileageWeeks.length
      : bestAvgFeel;

  const feelDrop = bestAvgFeel - highMileageFeel;

  const confidence = Math.min(0.9, 0.5 + (summaries.length / 12) * 0.2 + (feelDrop > 1 ? 0.2 : 0));

  return {
    category: "optimal_volume",
    insight: `Athlete feels best in the ${bestRange} mpw range (avg feel ${bestAvgFeel.toFixed(1)}/10).${feelDrop > 1 ? ` Feel drops noticeably at higher mileage (${highMileageFeel.toFixed(1)}/10 above ${Math.round(maxMileage * 0.8)} mpw).` : ""} Build volume gradually through this zone.`,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [
      {
        best_range: bestRange,
        best_avg_feel: bestAvgFeel,
        high_mileage_feel: highMileageFeel,
        weeks_analyzed: summaries.length,
      },
    ],
  };
}

/**
 * Recovery Needs:
 * How many easy days needed after long runs to recover.
 */
function detectRecoveryNeeds(
  input: PatternInput
): DetectedPattern | null {
  const { activities, feedback } = input;
  if (activities.length < 5 || feedback.length < 3) return null;

  // Find long runs (top 20% by distance)
  const distances = activities
    .map((a) => a.distance_miles ?? 0)
    .filter((d) => d > 0)
    .sort((a, b) => b - a);

  if (distances.length < 5) return null;
  const longRunThreshold = distances[Math.floor(distances.length * 0.2)];

  // Sort activities by date
  const sortedActs = [...activities].sort(
    (a, b) => a.activity_date.localeCompare(b.activity_date)
  );

  // For each long run, check the next 1-2 days' feel ratings
  const fbByDate = new Map<string, number>();
  for (const f of feedback) {
    const date = f.created_at.split("T")[0];
    fbByDate.set(date, f.feel_rating);
  }

  let needsTwoDays = 0;
  let needsOneDay = 0;
  let longRunCount = 0;

  for (let i = 0; i < sortedActs.length; i++) {
    const act = sortedActs[i];
    if ((act.distance_miles ?? 0) < longRunThreshold) continue;
    longRunCount++;

    const longRunDate = new Date(act.activity_date + "T00:00:00");
    const day1 = new Date(longRunDate);
    day1.setDate(day1.getDate() + 1);
    const day2 = new Date(longRunDate);
    day2.setDate(day2.getDate() + 2);

    const day1Feel = fbByDate.get(day1.toISOString().split("T")[0]);
    const day2Feel = fbByDate.get(day2.toISOString().split("T")[0]);

    if (day1Feel !== undefined && day1Feel <= 5) {
      needsOneDay++;
      if (day2Feel !== undefined && day2Feel <= 5) {
        needsTwoDays++;
      }
    }
  }

  if (longRunCount < 3) return null;

  const pctNeedOne = needsOneDay / longRunCount;
  const pctNeedTwo = needsTwoDays / longRunCount;

  if (pctNeedOne < 0.3) return null;

  const needsExtra = pctNeedTwo > 0.4;
  const confidence = Math.min(0.9, 0.5 + pctNeedOne * 0.2 + (longRunCount / 8) * 0.2);

  return {
    category: "recovery_needs",
    insight: needsExtra
      ? `Athlete typically needs 2 easy/rest days after long runs (feel ≤5 two days after in ${Math.round(pctNeedTwo * 100)}% of cases). Schedule recovery accordingly — avoid back-to-back quality sessions.`
      : `Athlete recovers within 1 day after long runs most of the time (feel ≤5 the day after in ${Math.round(pctNeedOne * 100)}% of cases). One easy day after long runs appears sufficient.`,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [
      {
        long_runs_analyzed: longRunCount,
        needs_one_day_pct: Math.round(pctNeedOne * 100),
        needs_two_days_pct: Math.round(pctNeedTwo * 100),
        long_run_threshold: longRunThreshold,
      },
    ],
  };
}

/**
 * Soreness Patterns:
 * Recurring soreness in the same area.
 */
function detectSorenessPatterns(
  input: PatternInput
): DetectedPattern | null {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const recentFb = input.feedback.filter(
    (f) => new Date(f.created_at) >= fourWeeksAgo
  );

  if (recentFb.length < 3) return null;

  const areaCounts = new Map<string, number>();
  for (const f of recentFb) {
    for (const area of f.soreness_areas ?? []) {
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
  }

  const recurring = [...areaCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a);

  if (recurring.length === 0) return null;

  const topAreas = recurring.map(([area, count]) => `${area} (${count}x)`);
  const confidence = Math.min(0.9, 0.6 + recurring.length * 0.1);

  return {
    category: "soreness_pattern",
    insight: `Recurring soreness in: ${topAreas.join(", ")} over the last 4 weeks. This may indicate a biomechanical issue, weakness, or overuse. Consider adding targeted prehab exercises and monitoring closely.`,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [
      {
        recurring_areas: Object.fromEntries(recurring),
        feedback_count: recentFb.length,
        period: "last_4_weeks",
      },
    ],
  };
}

/**
 * Pacing Tendency:
 * Does the athlete run faster than prescribed easy pace?
 */
function detectPacingTendency(
  input: PatternInput
): DetectedPattern | null {
  const paceRange = input.athletePreferences?.easy_pace_range;
  if (!paceRange) return null;

  // Parse "7:30-8:15" format
  const parts = paceRange.split("-");
  if (parts.length !== 2) return null;

  const parsePace = (s: string) => {
    const [min, sec] = s.trim().split(":").map(Number);
    return min * 60 + (sec || 0);
  };

  const fastEnd = parsePace(parts[0]); // faster pace = lower seconds
  const easyPaces = input.activities
    .map((a) => a.avg_pace_per_mile)
    .filter((p): p is number => p !== null && p > 0);

  if (easyPaces.length < 5) return null;

  const tooFast = easyPaces.filter((p) => p < fastEnd - 10); // >10s faster than prescribed
  const tooFastPct = tooFast.length / easyPaces.length;

  if (tooFastPct < 0.3) return null;

  const avgActualPace = easyPaces.reduce((s, p) => s + p, 0) / easyPaces.length;
  const avgPaceMin = Math.floor(avgActualPace / 60);
  const avgPaceSec = Math.round(avgActualPace % 60);

  const confidence = Math.min(0.9, 0.5 + tooFastPct * 0.3 + (easyPaces.length / 20) * 0.1);

  return {
    category: "pacing_tendency",
    insight: `Athlete runs faster than prescribed easy pace ${Math.round(tooFastPct * 100)}% of the time (avg ${avgPaceMin}:${String(avgPaceSec).padStart(2, "0")}/mi vs prescribed ${paceRange}/mi). Easy runs need to be EASY — remind the athlete that conversational pace builds aerobic base more effectively.`,
    confidence: Math.round(confidence * 100) / 100,
    evidence: [
      {
        too_fast_pct: Math.round(tooFastPct * 100),
        avg_actual_pace: avgActualPace,
        prescribed_fast_end: fastEnd,
        runs_analyzed: easyPaces.length,
      },
    ],
  };
}
