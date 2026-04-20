-- Add cached AI coach analysis to activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS coach_analysis TEXT;
