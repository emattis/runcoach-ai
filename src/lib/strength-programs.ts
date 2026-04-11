import type { TrainingPhase } from "@/types";

export interface ExerciseTemplate {
  name: string;
  sets: number;
  reps: string; // e.g. "10", "10/side", "20s"
  weight: number | null; // starting suggestion in lbs, null = bodyweight
  rest_seconds: number;
  notes: string | null;
}

export interface WorkoutTemplate {
  name: string;
  exercises: ExerciseTemplate[];
}

// ---- Base Building: 3x/week ----

const BASE_LOWER_A: WorkoutTemplate = {
  name: "Lower Body A",
  exercises: [
    { name: "Bulgarian Split Squats", sets: 3, reps: "10/leg", weight: null, rest_seconds: 90, notes: "Use dumbbells when bodyweight feels easy" },
    { name: "Romanian Deadlifts", sets: 3, reps: "10", weight: 65, rest_seconds: 90, notes: "Hinge at hips, slight knee bend" },
    { name: "Single-Leg Calf Raises", sets: 3, reps: "15/leg", weight: null, rest_seconds: 60, notes: "Slow eccentric, full range" },
    { name: "Clamshells", sets: 3, reps: "15/side", weight: null, rest_seconds: 45, notes: "Use band for added resistance" },
    { name: "Side-Lying Leg Raises", sets: 3, reps: "12/side", weight: null, rest_seconds: 45, notes: "Keep hips stacked" },
  ],
};

const BASE_CORE: WorkoutTemplate = {
  name: "Core + Stability",
  exercises: [
    { name: "Dead Bugs", sets: 3, reps: "10/side", weight: null, rest_seconds: 60, notes: "Press lower back into floor" },
    { name: "Pallof Press", sets: 3, reps: "10/side", weight: null, rest_seconds: 60, notes: "Band or cable, resist rotation" },
    { name: "Single-Leg Glute Bridges", sets: 3, reps: "12/leg", weight: null, rest_seconds: 60, notes: "Squeeze at top for 2s" },
    { name: "Copenhagen Planks", sets: 3, reps: "20s/side", weight: null, rest_seconds: 60, notes: "Start with bent knee if needed" },
    { name: "Bird Dogs", sets: 3, reps: "10/side", weight: null, rest_seconds: 45, notes: "Slow and controlled" },
  ],
};

const BASE_LOWER_B: WorkoutTemplate = {
  name: "Lower Body B",
  exercises: [
    { name: "Hip Thrusts", sets: 3, reps: "12", weight: 95, rest_seconds: 90, notes: "Barbell or heavy dumbbell" },
    { name: "Step-Ups", sets: 3, reps: "10/leg", weight: null, rest_seconds: 90, notes: "16-18 inch box, add dumbbells when ready" },
    { name: "Nordic Curl Eccentric", sets: 3, reps: "5", weight: null, rest_seconds: 90, notes: "Slow 3-5s lowering only" },
    { name: "Banded Lateral Walks", sets: 3, reps: "15/side", weight: null, rest_seconds: 60, notes: "Band above knees, stay low" },
    { name: "Single-Leg Deadlifts", sets: 3, reps: "8/side", weight: null, rest_seconds: 60, notes: "Dumbbell or kettlebell" },
  ],
};

// ---- Build Phase: 2x/week (combined, higher intensity) ----

const BUILD_COMBINED_A: WorkoutTemplate = {
  name: "Strength A — Running-Specific",
  exercises: [
    { name: "Bulgarian Split Squats", sets: 3, reps: "8/leg", weight: 25, rest_seconds: 90, notes: "Dumbbells, increase weight" },
    { name: "Romanian Deadlifts", sets: 3, reps: "8", weight: 95, rest_seconds: 90, notes: "Heavier than base phase" },
    { name: "Hip Thrusts", sets: 3, reps: "10", weight: 115, rest_seconds: 90, notes: null },
    { name: "Nordic Curl Eccentric", sets: 3, reps: "5", weight: null, rest_seconds: 90, notes: "Slow lowering" },
    { name: "Pallof Press", sets: 2, reps: "10/side", weight: null, rest_seconds: 60, notes: null },
    { name: "Dead Bugs", sets: 2, reps: "10/side", weight: null, rest_seconds: 45, notes: null },
  ],
};

const BUILD_COMBINED_B: WorkoutTemplate = {
  name: "Strength B — Stability + Power",
  exercises: [
    { name: "Step-Ups", sets: 3, reps: "8/leg", weight: 25, rest_seconds: 90, notes: "Dumbbells" },
    { name: "Single-Leg Deadlifts", sets: 3, reps: "8/side", weight: 20, rest_seconds: 90, notes: "Dumbbell" },
    { name: "Single-Leg Calf Raises", sets: 3, reps: "12/leg", weight: null, rest_seconds: 60, notes: "Weighted if possible" },
    { name: "Copenhagen Planks", sets: 2, reps: "25s/side", weight: null, rest_seconds: 60, notes: null },
    { name: "Clamshells", sets: 2, reps: "15/side", weight: null, rest_seconds: 45, notes: "Band" },
    { name: "Bird Dogs", sets: 2, reps: "10/side", weight: null, rest_seconds: 45, notes: null },
  ],
};

// ---- Peak/Taper: 1-2x/week (maintenance, -40% volume) ----

const PEAK_MAINTENANCE: WorkoutTemplate = {
  name: "Maintenance — Full Body",
  exercises: [
    { name: "Bulgarian Split Squats", sets: 2, reps: "8/leg", weight: 25, rest_seconds: 90, notes: "Same weight as build phase" },
    { name: "Romanian Deadlifts", sets: 2, reps: "8", weight: 95, rest_seconds: 90, notes: "Maintain intensity, reduce volume" },
    { name: "Hip Thrusts", sets: 2, reps: "10", weight: 115, rest_seconds: 90, notes: null },
    { name: "Dead Bugs", sets: 2, reps: "8/side", weight: null, rest_seconds: 45, notes: null },
    { name: "Single-Leg Calf Raises", sets: 2, reps: "12/leg", weight: null, rest_seconds: 60, notes: null },
  ],
};

// ---- Phase → Workout mapping ----

const PROGRAMS: Record<string, WorkoutTemplate[]> = {
  base_building: [BASE_LOWER_A, BASE_CORE, BASE_LOWER_B],
  build: [BUILD_COMBINED_A, BUILD_COMBINED_B],
  peak: [PEAK_MAINTENANCE],
  taper: [PEAK_MAINTENANCE],
  recovery: [PEAK_MAINTENANCE],
  off: [],
};

/**
 * Get strength workouts for a given training phase and week number.
 * Returns the templates appropriate for the phase.
 * Week number can be used for future progressive overload logic.
 */
export function getStrengthProgram(
  phase: TrainingPhase,
  _weekNumber: number
): WorkoutTemplate[] {
  return PROGRAMS[phase] ?? PROGRAMS.base_building;
}
