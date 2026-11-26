-- ============================================================================
-- RUNALIVE: FIX MISSING COLUMNS ON games TABLE
-- The original Supabase migration was missing these columns that the
-- node-pg-migrate 004_games migration includes.
-- ============================================================================

-- Add missing columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_rounds INT NOT NULL DEFAULT 1;
ALTER TABLE games ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS round_ends_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_paused_ms BIGINT NOT NULL DEFAULT 0;

-- Drop wrong column if it exists
ALTER TABLE games DROP COLUMN IF EXISTS paused_remaining_seconds;
