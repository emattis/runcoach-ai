-- Quick notes from athlete to coach (ad-hoc, not tied to a workout)
CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_coach_notes_date ON coach_notes (note_date DESC);

ALTER TABLE coach_notes DISABLE ROW LEVEL SECURITY;

-- Strength workout feedback (simplified version of run_feedback)
CREATE TABLE strength_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strength_workout_id UUID NOT NULL REFERENCES strength_workouts(id) ON DELETE CASCADE,
  feel_rating INTEGER NOT NULL CHECK (feel_rating BETWEEN 1 AND 10),
  energy_level TEXT NOT NULL,
  soreness_areas JSONB DEFAULT '[]'::jsonb,
  soreness_level INTEGER NOT NULL CHECK (soreness_level BETWEEN 0 AND 10),
  notes TEXT,
  injury_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_strength_feedback_workout ON strength_feedback (strength_workout_id);

ALTER TABLE strength_feedback DISABLE ROW LEVEL SECURITY;
