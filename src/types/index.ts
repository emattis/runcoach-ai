// ============================================================
// RunCoach AI — Core Type Definitions
// ============================================================

// --- Training Phases & Workout Types ---

export type TrainingPhase =
  | "base_building"
  | "build"
  | "peak"
  | "taper"
  | "recovery"
  | "off";

export type WorkoutType =
  | "easy"
  | "long_run"
  | "tempo"
  | "intervals"
  | "recovery"
  | "off"
  | "cross_train"
  | "strides";

export type EnergyLevel = "depleted" | "tired" | "moderate" | "strong" | "great";

export type LearningCategory =
  | "injury_pattern"
  | "optimal_volume"
  | "recovery_needs"
  | "race_readiness";

// --- Athlete ---

export interface AthleteGoals {
  marathon_target: string;
  half_target: string;
  weekly_mileage_target: number;
}

export interface InjuryRecord {
  date: string;
  description: string;
  duration_days: number;
  area: string;
}

export interface AthletePreferences {
  preferred_long_run_day: string;
  easy_pace_range: string;
  off_days: string[];
}

export interface AthleteProfile {
  id: string;
  name: string | null;
  goals: AthleteGoals | null;
  injury_history: InjuryRecord[] | null;
  preferences: AthletePreferences | null;
  current_phase: TrainingPhase;
  phase_start_date: string | null;
  created_at: string;
  updated_at: string;
}

// --- Activities (Strava) ---

export interface Split {
  mile: number;
  pace_seconds: number;
  elevation_gain_ft: number;
  avg_hr: number | null;
}

export interface Activity {
  id: string;
  strava_id: number | null;
  activity_date: string;
  activity_type: "run" | "ride" | "walk" | "strength";
  distance_miles: number | null;
  duration_seconds: number | null;
  avg_pace_per_mile: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_ft: number | null;
  perceived_effort: number | null;
  splits: Split[] | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

// --- Run Feedback ---

export interface RunFeedback {
  id: string;
  activity_id: string;
  feel_rating: number;
  energy_level: EnergyLevel;
  soreness_areas: string[];
  soreness_level: number;
  sleep_quality: number;
  sleep_hours: number;
  notes: string | null;
  injury_flag: boolean;
  created_at: string;
}

// --- Training Plans ---

export interface PlanAdjustment {
  date: string;
  reason: string;
  original: string;
  modified: string;
}

export interface TrainingPlan {
  id: string;
  week_start: string;
  week_number: number;
  phase: TrainingPhase;
  target_mileage: number;
  planned_workouts: PlannedWorkoutData[];
  coach_notes: string | null;
  adjustments_made: PlanAdjustment[] | null;
  created_at: string;
}

// --- Planned Workouts ---

export interface PlannedWorkout {
  id: string;
  plan_id: string;
  workout_date: string;
  workout_type: WorkoutType;
  description: string | null;
  target_distance: number | null;
  target_pace_range: string | null;
  target_hr_zone: string | null;
  warmup: string | null;
  cooldown: string | null;
  completed: boolean;
  actual_activity_id: string | null;
  athlete_modification: string | null;
  created_at: string;
}

/** Shape returned by AI plan generation */
export interface PlannedWorkoutData {
  day: string;
  workout_type: WorkoutType;
  distance: number;
  pace_guidance: string;
  hr_zone: string;
  description: string;
  coach_rationale: string;
}

// --- Strength Training ---

export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number;
  weight: number | null;
  rest_seconds: number;
  notes: string | null;
}

export interface StrengthWorkout {
  id: string;
  workout_date: string;
  workout_name: string;
  exercises: StrengthExercise[];
  phase: TrainingPhase;
  completed: boolean;
  created_at: string;
}

export interface StrengthLog {
  id: string;
  strength_workout_id: string;
  exercise_name: string;
  set_number: number;
  reps_completed: number;
  weight_lbs: number | null;
  rpe: number;
  notes: string | null;
  created_at: string;
}

// --- Weekly Summaries ---

export interface WeeklySummary {
  id: string;
  week_start: string;
  total_mileage: number;
  total_runs: number;
  avg_easy_pace: number | null;
  long_run_distance: number | null;
  avg_feel_rating: number | null;
  avg_sleep_quality: number | null;
  injury_risk_score: number;
  coach_analysis: string | null;
  plan_adherence_pct: number | null;
  recommendations: Record<string, unknown> | null;
  created_at: string;
}

// --- Coach Learnings ---

export interface CoachLearning {
  id: string;
  category: LearningCategory;
  insight: string;
  confidence: number;
  evidence: Record<string, unknown>[] | null;
  created_at: string;
  updated_at: string;
}

// --- Strava OAuth ---

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// --- Dashboard ---

export interface GoalProgress {
  label: string;
  current: string;
  target: string;
  progress_pct: number;
}

export interface DashboardData {
  athlete: AthleteProfile;
  current_week_mileage: number;
  planned_week_mileage: number;
  today_workout: PlannedWorkout | null;
  feel_trend: number[];
  injury_risk_score: number;
  goals: GoalProgress[];
  streak_weeks: number;
  coach_note: string | null;
  next_race: { name: string; date: string; days_away: number } | null;
  recent_activities: Activity[];
}
