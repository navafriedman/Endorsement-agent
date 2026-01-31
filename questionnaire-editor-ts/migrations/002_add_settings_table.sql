-- Add settings table for configurable prompts
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default prompts (these will be overwritten when you customize them)
INSERT INTO settings (key, value) VALUES
  ('generator_system_prompt', ''),
  ('generator_user_prompt', ''),
  ('eval_system_prompt', ''),
  ('eval_user_prompt', '')
ON CONFLICT (key) DO NOTHING;
