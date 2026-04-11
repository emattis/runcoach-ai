import type { TrainingPhase } from "@/types";

export interface PhaseEvalInput {
  currentPhase: TrainingPhase;
  phaseStartDate: string | null;
  weeklyMileages: number[]; // last 8 weeks, most recent last
  recentFeelRatings: number[]; // last 2 weeks of feel ratings
  injuryRiskScore: number;
  recentInjuryFlags: number; // count in last 3 weeks
  targetRace: { date: string; name: string } | null;
  weeksInPhase: number;
}

export interface PhaseEvalResult {
  ready: boolean;
  currentPhase: TrainingPhase;
  suggestedPhase: TrainingPhase | null;
  reasons: string[];
  blockers: string[];
}

const PHASE_ORDER: TrainingPhase[] = [
  "base_building",
  "build",
  "peak",
  "taper",
  "recovery",
  "off",
];

export function evaluatePhaseTransition(
  input: PhaseEvalInput
): PhaseEvalResult {
  const { currentPhase } = input;

  switch (currentPhase) {
    case "base_building":
      return evalBaseTouild(input);
    case "build":
      return evalBuildToPeak(input);
    case "peak":
      return evalPeakToTaper(input);
    case "taper":
      return evalTaperToRecovery(input);
    case "recovery":
      return evalRecoveryToBase(input);
    default:
      return {
        ready: false,
        currentPhase,
        suggestedPhase: null,
        reasons: [],
        blockers: ["Current phase not recognized"],
      };
  }
}

// ---- BASE BUILDING → BUILD ----

function evalBaseTouild(input: PhaseEvalInput): PhaseEvalResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  // 1. At least 6 weeks in phase
  if (input.weeksInPhase >= 6) {
    reasons.push(`${input.weeksInPhase} weeks of base building completed`);
  } else {
    blockers.push(
      `Need at least 6 weeks in base building (currently ${input.weeksInPhase})`
    );
  }

  // 2. At or above 40 mpw for 2 consecutive weeks
  const lastTwo = input.weeklyMileages.slice(-2);
  if (lastTwo.length >= 2 && lastTwo.every((m) => m >= 40)) {
    reasons.push(
      `Sustained 40+ mpw for 2 weeks (${lastTwo.map((m) => m.toFixed(0)).join(", ")} mi)`
    );
  } else {
    const current = lastTwo[lastTwo.length - 1] ?? 0;
    blockers.push(
      `Need 2 consecutive weeks at 40+ mpw (current: ${current.toFixed(0)} mpw)`
    );
  }

  // 3. No more than 1 missed week (week with <5 miles in last 6)
  const recentWeeks = input.weeklyMileages.slice(-6);
  const missedWeeks = recentWeeks.filter((m) => m < 5).length;
  if (missedWeeks <= 1) {
    reasons.push(
      `Consistent running — ${missedWeeks === 0 ? "no" : "only 1"} missed week in last 6`
    );
  } else {
    blockers.push(
      `Too many missed weeks (${missedWeeks} in last 6) — need consistency`
    );
  }

  // 4. Average feel rating >= 6.5 over last 2 weeks
  const avgFeel =
    input.recentFeelRatings.length > 0
      ? input.recentFeelRatings.reduce((s, f) => s + f, 0) /
        input.recentFeelRatings.length
      : 0;
  if (avgFeel >= 6.5) {
    reasons.push(`Feel rating ${avgFeel.toFixed(1)}/10 — handling load well`);
  } else if (input.recentFeelRatings.length === 0) {
    blockers.push("No recent feel data — log post-run feedback");
  } else {
    blockers.push(
      `Feel rating ${avgFeel.toFixed(1)}/10 — need >= 6.5 to transition`
    );
  }

  // 5. Injury risk < 40
  if (input.injuryRiskScore < 40) {
    reasons.push(`Injury risk ${input.injuryRiskScore} — low`);
  } else {
    blockers.push(
      `Injury risk ${input.injuryRiskScore} — need < 40 to transition`
    );
  }

  // 6. No injury flags in last 3 weeks
  if (input.recentInjuryFlags === 0) {
    reasons.push("No injury flags in last 3 weeks");
  } else {
    blockers.push(
      `${input.recentInjuryFlags} injury flag(s) in last 3 weeks — resolve before adding intensity`
    );
  }

  return {
    ready: blockers.length === 0,
    currentPhase: "base_building",
    suggestedPhase: blockers.length === 0 ? "build" : null,
    reasons,
    blockers,
  };
}

// ---- BUILD → PEAK ----

function evalBuildToPeak(input: PhaseEvalInput): PhaseEvalResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  // 1. At least 8 weeks in build phase
  if (input.weeksInPhase >= 8) {
    reasons.push(`${input.weeksInPhase} weeks in build phase`);
  } else {
    blockers.push(
      `Need at least 8 weeks in build phase (currently ${input.weeksInPhase})`
    );
  }

  // 2. Stable mileage (last 3 weeks within 10% of each other)
  const last3 = input.weeklyMileages.slice(-3);
  if (last3.length >= 3) {
    const avg = last3.reduce((s, m) => s + m, 0) / 3;
    const allStable = last3.every(
      (m) => Math.abs(m - avg) / avg < 0.1
    );
    if (allStable) {
      reasons.push("Mileage stable for 3+ weeks");
    } else {
      blockers.push("Mileage not yet stable — need 3 consistent weeks");
    }
  }

  // 3. Target race within 4-8 weeks
  if (input.targetRace) {
    const daysToRace = Math.ceil(
      (new Date(input.targetRace.date).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000)
    );
    const weeksToRace = Math.ceil(daysToRace / 7);
    if (weeksToRace >= 4 && weeksToRace <= 8) {
      reasons.push(
        `${input.targetRace.name} in ${weeksToRace} weeks — time to peak`
      );
    } else if (weeksToRace > 8) {
      blockers.push(
        `Race is ${weeksToRace} weeks away — continue building (peak when 4-8 weeks out)`
      );
    }
  } else {
    blockers.push("No target race set — set a race date to time the peak phase");
  }

  // 4. Injury risk check
  if (input.injuryRiskScore < 50) {
    reasons.push(`Injury risk ${input.injuryRiskScore} — manageable`);
  } else {
    blockers.push(
      `Injury risk ${input.injuryRiskScore} — too high for peak training`
    );
  }

  return {
    ready: blockers.length === 0,
    currentPhase: "build",
    suggestedPhase: blockers.length === 0 ? "peak" : null,
    reasons,
    blockers,
  };
}

// ---- PEAK → TAPER ----

function evalPeakToTaper(input: PhaseEvalInput): PhaseEvalResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (input.targetRace) {
    const daysToRace = Math.ceil(
      (new Date(input.targetRace.date).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000)
    );
    if (daysToRace <= 21 && daysToRace > 0) {
      reasons.push(
        `${input.targetRace.name} in ${daysToRace} days — time to taper`
      );
    } else if (daysToRace > 21) {
      blockers.push(`Race is ${daysToRace} days away — continue peak training`);
    }
  } else {
    blockers.push("No target race set");
  }

  return {
    ready: blockers.length === 0,
    currentPhase: "peak",
    suggestedPhase: blockers.length === 0 ? "taper" : null,
    reasons,
    blockers,
  };
}

// ---- TAPER → RECOVERY ----

function evalTaperToRecovery(input: PhaseEvalInput): PhaseEvalResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (input.targetRace) {
    const daysToRace = Math.ceil(
      (new Date(input.targetRace.date).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000)
    );
    if (daysToRace <= 0) {
      reasons.push("Race day has passed — time for recovery");
    } else {
      blockers.push(`Race is in ${daysToRace} days — continue taper`);
    }
  } else {
    // No race, check if taper has gone on long enough
    if (input.weeksInPhase >= 3) {
      reasons.push("3 weeks of taper completed — transition to recovery");
    } else {
      blockers.push(
        `Taper week ${input.weeksInPhase} of 2-3 — continue tapering`
      );
    }
  }

  return {
    ready: blockers.length === 0,
    currentPhase: "taper",
    suggestedPhase: blockers.length === 0 ? "recovery" : null,
    reasons,
    blockers,
  };
}

// ---- RECOVERY → BASE BUILDING ----

function evalRecoveryToBase(input: PhaseEvalInput): PhaseEvalResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (input.weeksInPhase >= 2) {
    reasons.push("2+ weeks of recovery completed");
  } else {
    blockers.push(
      `Recovery week ${input.weeksInPhase} of 2 — be patient`
    );
  }

  if (input.injuryRiskScore < 30) {
    reasons.push("Low injury risk — ready to rebuild");
  } else {
    blockers.push(
      `Injury risk ${input.injuryRiskScore} — extend recovery until < 30`
    );
  }

  const avgFeel =
    input.recentFeelRatings.length > 0
      ? input.recentFeelRatings.reduce((s, f) => s + f, 0) /
        input.recentFeelRatings.length
      : 0;

  if (avgFeel >= 7 || input.recentFeelRatings.length === 0) {
    reasons.push("Feeling recovered and ready");
  } else {
    blockers.push(
      `Feel rating ${avgFeel.toFixed(1)}/10 — wait until >= 7`
    );
  }

  return {
    ready: blockers.length === 0,
    currentPhase: "recovery",
    suggestedPhase: blockers.length === 0 ? "base_building" : null,
    reasons,
    blockers,
  };
}

/** Get the next phase in the standard order */
export function getNextPhase(current: TrainingPhase): TrainingPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}
