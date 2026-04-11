-- RunCoach AI — Initial Database Schema
-- ===========================================

-- Athlete profile and goals
CREATE TABLE athlete_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  goals JSONB,
  injury_history JSONB,
  preferences JSONB,
  current_phase TEXT DEFAULT 'base_building',
  phase_start_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Strava activities synced
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_id BIGINT UNIQUE,
  activity_date DATE,
  activity_type TEXT,
  distance_miles NUMERIC,
  duration_seconds INTEGER,
  avg_pace_per_mile NUMERIC,
  avg_hr INTEGER,
  max_hr INTEGER,
  elevation_gain_ft NUMERIC,
  perceived_effort INTEGER,
  splits JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Post-run subjective feedback
CREATE TABLE run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id),
  feel_rating INTEGER CHECK (feel_rating BETWEEN 1 AND 10),
  energy_level TEXT,
  soreness_areas JSONB,
  soreness_level INTEGER CHECK (soreness_level BETWEEN 0 AND 10),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  sleep_hours NUMERIC,
  notes TEXT,
  injury_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated training plans
CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  week_number INTEGER,
  phase TEXT,
  target_mileage NUMERIC,
  planned_workouts JSONB,
  coach_notes TEXT,
  adjustments_made JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual planned workouts
CREATE TABLE planned_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES training_plans(id),
  workout_date DATE,
  workout_type TEXT,
  description TEXT,
  target_distance NUMERIC,
  target_pace_range TEXT,
  target_hr_zone TEXT,
  warmup TEXT,
  cooldown TEXT,
  completed BOOLEAN DEFAULT false,
  actual_activity_id UUID REFERENCES activities(id),
  athlete_modification TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Strength training program
CREATE TABLE strength_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_date DATE,
  workout_name TEXT,
  exercises JSONB,
  phase TEXT,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Strength exercise logs
CREATE TABLE strength_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strength_workout_id UUID REFERENCES strength_workouts(id),
  exercise_name TEXT,
  set_number INTEGER,
  reps_completed INTEGER,
  weight_lbs NUMERIC,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly summaries (AI-generated analysis)
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  total_mileage NUMERIC,
  total_runs INTEGER,
  avg_easy_pace NUMERIC,
  long_run_distance NUMERIC,
  avg_feel_rating NUMERIC,
  avg_sleep_quality NUMERIC,
  injury_risk_score NUMERIC,
  coach_analysis TEXT,
  plan_adherence_pct NUMERIC,
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Coach learning log
CREATE TABLE coach_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  insight TEXT,
  confidence NUMERIC,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Strava tokens
CREATE TABLE strava_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
