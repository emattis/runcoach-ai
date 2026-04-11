-- RunCoach AI — Initial Database Schema
-- ===========================================

-- 1. Strava OAuth tokens
CREATE TABLE strava_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id BIGINT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Athlete profile and goals
CREATE TABLE athlete_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  goals JSONB,
  injury_history JSONB,
  preferences JSONB,
  current_phase TEXT NOT NULL DEFAULT 'base_building',
  phase_start_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_athlete_profile_phase ON athlete_profile (current_phase);

-- 3. Strava activities
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_id BIGINT UNIQUE,
  activity_date DATE NOT NULL,
  activity_type TEXT NOT NULL,
  distance_miles NUMERIC,
  duration_seconds INTEGER,
  avg_pace_per_mile NUMERIC,
  avg_hr INTEGER,
  max_hr INTEGER,
  elevation_gain_ft NUMERIC,
  perceived_effort INTEGER CHECK (perceived_effort BETWEEN 1 AND 10),
  splits JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activities_date ON activities (activity_date DESC);
CREATE INDEX idx_activities_type_date ON activities (activity_type, activity_date DESC);

-- 4. Post-run subjective feedback
CREATE TABLE run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  feel_rating INTEGER NOT NULL CHECK (feel_rating BETWEEN 1 AND 10),
  energy_level TEXT NOT NULL,
  soreness_areas JSONB DEFAULT '[]'::jsonb,
  soreness_level INTEGER NOT NULL CHECK (soreness_level BETWEEN 0 AND 10),
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 10),
  sleep_hours NUMERIC NOT NULL,
  notes TEXT,
  injury_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_feedback_activity ON run_feedback (activity_id);
CREATE INDEX idx_run_feedback_created ON run_feedback (created_at DESC);

-- 5. AI-generated training plans
CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  target_mileage NUMERIC NOT NULL,
  coach_notes TEXT,
  adjustments_made JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_training_plans_week ON training_plans (week_start DESC);
CREATE INDEX idx_training_plans_phase ON training_plans (phase);

-- 6. Individual planned workouts
CREATE TABLE planned_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  workout_type TEXT NOT NULL,
  description TEXT,
  target_distance NUMERIC,
  target_pace_range TEXT,
  target_hr_zone TEXT,
  warmup TEXT,
  cooldown TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  actual_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  athlete_modification TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_planned_workouts_date ON planned_workouts (workout_date DESC);
CREATE INDEX idx_planned_workouts_plan ON planned_workouts (plan_id);
CREATE INDEX idx_planned_workouts_type ON planned_workouts (workout_type);

-- 7. Strength training program
CREATE TABLE strength_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_date DATE NOT NULL,
  workout_name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  phase TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_strength_workouts_date ON strength_workouts (workout_date DESC);

-- 8. Strength exercise logs
CREATE TABLE strength_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strength_workout_id UUID NOT NULL REFERENCES strength_workouts(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps_completed INTEGER NOT NULL,
  weight_lbs NUMERIC,
  rpe INTEGER NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_strength_logs_workout ON strength_logs (strength_workout_id);

-- 9. Weekly summaries (AI-generated analysis)
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  total_mileage NUMERIC NOT NULL DEFAULT 0,
  total_runs INTEGER NOT NULL DEFAULT 0,
  avg_easy_pace NUMERIC,
  long_run_distance NUMERIC,
  avg_feel_rating NUMERIC,
  avg_sleep_quality NUMERIC,
  injury_risk_score NUMERIC NOT NULL DEFAULT 0,
  coach_analysis TEXT,
  plan_adherence_pct NUMERIC,
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_weekly_summaries_week ON weekly_summaries (week_start DESC);

-- 10. Coach learning log
CREATE TABLE coach_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  insight TEXT NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_coach_learnings_category ON coach_learnings (category);

-- ===========================================
-- Seed data
-- ===========================================

-- Seed athlete profile
INSERT INTO athlete_profile (name, goals, injury_history, preferences, current_phase, phase_start_date)
VALUES (
  'Eon',
  '{"marathon_target": "2:40", "half_target": "1:15", "weekly_mileage_target": 65}'::jsonb,
  '[
    {
      "date": "2023-06-01",
      "description": "General injury from return to running after years off — on-and-off running throughout 2023",
      "duration_days": 180,
      "area": "general"
    },
    {
      "date": "2026-03-01",
      "description": "Injury from building mileage and intensity too quickly simultaneously",
      "duration_days": 14,
      "area": "general"
    }
  ]'::jsonb,
  '{"preferred_long_run_day": "sunday", "easy_pace_range": "7:30-8:15", "off_days": ["monday"], "units": "miles"}'::jsonb,
  'base_building',
  '2026-04-11'
);

-- Seed initial coach learnings
INSERT INTO coach_learnings (category, insight, confidence, evidence) VALUES
(
  'injury_pattern',
  'Athlete consistently gets injured when combining mileage increases with intensity increases. Volume and intensity must be built separately — never ramp both in the same training block.',
  0.95,
  '[{"source": "athlete_history", "detail": "March 2026 injury after ramping mileage + intensity simultaneously. Similar pattern in 2023 return to running."}]'::jsonb
),
(
  'injury_pattern',
  'Needs conservative weekly mileage ramps — 5-8% maximum, not the standard 10%. History of overreach injuries means erring on the side of caution is critical.',
  0.90,
  '[{"source": "athlete_history", "detail": "Multiple injury episodes correlated with aggressive volume increases. Standard 10% rule is too aggressive for this athlete."}]'::jsonb
),
(
  'optimal_volume',
  'Ran 2:47 marathon off approximately 50-60 miles per week. Sub-2:40 will likely require sustained 55-70 mpw with proper periodization. Volume must be built gradually over 4-6 months.',
  0.70,
  '[{"source": "race_result", "detail": "2:47 marathon October 2025 on ~50-60 mpw base. 7-minute improvement needs higher sustained volume plus specific marathon work."}]'::jsonb
),
(
  'recovery_needs',
  'After a 2-week layoff from injury, must restart at 20-25 mpw with all easy running. No intensity (tempo, intervals, strides) for a minimum of 4-6 weeks. Patience in the return is non-negotiable.',
  0.85,
  '[{"source": "athlete_history", "detail": "April 2026: returning from 2-week rest after March injury. Previous rushed returns led to re-injury."}]'::jsonb
);
