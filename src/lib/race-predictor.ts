import { estimateVDOT } from "@/lib/utils";

// Standard race distances in meters
export const DISTANCES = {
  fiveK: 5000,
  tenK: 10000,
  half: 21097.5,
  marathon: 42195,
} as const;

export interface RacePredictions {
  fiveK: number; // seconds
  tenK: number;
  half: number;
  marathon: number;
}

export interface FitnessEstimate {
  vdot: number;
  confidence: number; // 0-1
  dataSource: string;
  predictions: RacePredictions;
}

/**
 * Predict race time from VDOT for a given distance.
 *
 * Inverts the Daniels formula numerically:
 * Given VDOT and distance, find the time t such that
 *   VO2(v) / %VO2max(t) = VDOT
 * where v = distance / t.
 *
 * Uses binary search since the formula isn't analytically invertible.
 */
export function predictRaceTime(
  vdot: number,
  targetDistanceMeters: number
): number {
  // Binary search: time in minutes
  // Bounds: ~2 min/km for very fast, ~10 min/km for slow
  let lo = (targetDistanceMeters / 1000) * 2; // fastest possible (2 min/km)
  let hi = (targetDistanceMeters / 1000) * 10; // slowest (10 min/km)

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const v = targetDistanceMeters / mid; // m/min

    const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
    const pct =
      0.8 +
      0.1894393 * Math.exp(-0.012778 * mid) +
      0.2989558 * Math.exp(-0.1932605 * mid);

    const estimatedVdot = vo2 / pct;

    if (estimatedVdot > vdot) {
      lo = mid; // running too fast, need more time
    } else {
      hi = mid; // running too slow, need less time
    }
  }

  return Math.round(((lo + hi) / 2) * 60); // convert minutes to seconds
}

/** Get all standard race predictions from a VDOT */
export function predictAllRaces(vdot: number): RacePredictions {
  return {
    fiveK: predictRaceTime(vdot, DISTANCES.fiveK),
    tenK: predictRaceTime(vdot, DISTANCES.tenK),
    half: predictRaceTime(vdot, DISTANCES.half),
    marathon: predictRaceTime(vdot, DISTANCES.marathon),
  };
}

/**
 * Estimate current fitness from recent activity data.
 *
 * Strategy:
 * 1. If tempo/fast runs exist, use the best one to compute VDOT directly
 * 2. If only easy runs, estimate VDOT from easy pace using Daniels' correlation:
 *    Easy pace is roughly 59-74% of VO2max, typically VDOT easy pace ≈ race pace + 90-120s/mi
 */
export function estimateCurrentFitness(
  activities: {
    activity_date: string;
    distance_miles: number | null;
    avg_pace_per_mile: number | null;
    duration_seconds: number | null;
  }[]
): FitnessEstimate | null {
  if (activities.length === 0) return null;

  // Filter to recent runs with pace data
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 42); // 6 weeks
  const recent = activities.filter(
    (a) =>
      a.avg_pace_per_mile !== null &&
      a.distance_miles !== null &&
      a.distance_miles > 0.5 &&
      new Date(a.activity_date) >= fourWeeksAgo
  );

  if (recent.length === 0) return null;

  // Strategy 1: Find tempo-effort runs (faster pace, longer distance)
  // A "quality" run: distance > 3 miles AND pace < 7:00/mi (420 sec)
  const qualityRuns = recent.filter(
    (a) => a.distance_miles! > 3 && a.avg_pace_per_mile! < 420
  );

  if (qualityRuns.length > 0) {
    // Use the fastest quality run
    const best = qualityRuns.reduce((best, a) =>
      a.avg_pace_per_mile! < best.avg_pace_per_mile! ? a : best
    );

    const distanceMeters = best.distance_miles! * 1609.344;
    const timeSeconds = best.duration_seconds ?? best.distance_miles! * best.avg_pace_per_mile!;

    const vdot = estimateVDOT(distanceMeters, timeSeconds);
    const predictions = predictAllRaces(vdot);

    // Confidence based on distance and recency
    const daysSince = Math.ceil(
      (Date.now() - new Date(best.activity_date).getTime()) / (24 * 60 * 60 * 1000)
    );
    const distanceConfidence = Math.min(1, best.distance_miles! / 10); // longer = better
    const recencyConfidence = Math.max(0.5, 1 - daysSince / 60);
    const confidence =
      Math.round(Math.min(0.95, distanceConfidence * recencyConfidence) * 100) / 100;

    return {
      vdot: Math.round(vdot * 10) / 10,
      confidence,
      dataSource: `Based on ${best.distance_miles!.toFixed(1)} mi run on ${best.activity_date} at ${formatPaceShort(best.avg_pace_per_mile!)}/mi`,
      predictions,
    };
  }

  // Strategy 2: Use easy pace to estimate VDOT
  // Daniels suggests easy pace is typically 1:30-2:00/mi slower than marathon pace
  // We take the fastest 25% of easy runs as the "typical easy pace"
  const sortedByPace = [...recent].sort(
    (a, b) => a.avg_pace_per_mile! - b.avg_pace_per_mile!
  );
  const fastQuartile = sortedByPace.slice(
    0,
    Math.max(3, Math.ceil(sortedByPace.length * 0.25))
  );

  const avgEasyPace =
    fastQuartile.reduce((s, a) => s + a.avg_pace_per_mile!, 0) /
    fastQuartile.length;

  // Estimate marathon pace as easy pace - 90 seconds/mi
  const estMarathonPaceSec = avgEasyPace - 90;
  const estMarathonTime = estMarathonPaceSec * 26.2188; // seconds for marathon
  const vdot = estimateVDOT(DISTANCES.marathon, estMarathonTime);
  const predictions = predictAllRaces(vdot);

  // Lower confidence for easy-pace-only estimates
  const confidence = Math.round(Math.min(0.65, 0.4 + recent.length / 30) * 100) / 100;

  return {
    vdot: Math.round(vdot * 10) / 10,
    confidence,
    dataSource: `Estimated from easy pace (${formatPaceShort(avgEasyPace)}/mi avg, ${fastQuartile.length} runs)`,
    predictions,
  };
}

/** Format seconds-per-mile as M:SS (compact) */
function formatPaceShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format total seconds as H:MM:SS or M:SS */
export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Parse a target time string like "2:40" or "1:15:30" to seconds */
export function parseTargetTime(str: string): number {
  const parts = str.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60; // "2:40" = 2h40m
  return 0;
}
