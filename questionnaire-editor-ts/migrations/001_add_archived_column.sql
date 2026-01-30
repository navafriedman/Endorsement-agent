-- Add archived column to questionnaires table
-- Run this migration in your Supabase SQL editor

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- Update any existing NULL values to FALSE
UPDATE questionnaires SET archived = FALSE WHERE archived IS NULL;
