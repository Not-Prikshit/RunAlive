-- ============================================================================
-- RUNALIVE: MUTUAL CAPTURE VERIFICATION, POLYGON PERIMETERS & GAME MODES
-- Migration: 20261125000002_mutual_capture_and_polygon_perimeter.sql
-- Safe & Non-Destructive: Uses IF NOT EXISTS for all columns and indexes
-- ============================================================================

-- 1. ENHANCE GAMES TABLE
-- Add support for team switching toggle, hider headstart duration, and perimeter shape
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS allow_team_switching BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hider_headstart_seconds INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS perimeter_shape VARCHAR(15) NOT NULL DEFAULT 'CIRCLE' CHECK (perimeter_shape IN ('CIRCLE', 'RECTANGLE', 'POLYGON'));

-- 2. ENHANCE GAME ROUNDS TABLE (POLYGON BOUNDARIES & FUTURE SHRINK ZONES)
-- Add polygon boundary support and pre-calculated hidden next safe zones
ALTER TABLE game_rounds
  ADD COLUMN IF NOT EXISTS perimeter_type VARCHAR(15) NOT NULL DEFAULT 'CIRCLE' CHECK (perimeter_type IN ('CIRCLE', 'RECTANGLE', 'POLYGON')),
  ADD COLUMN IF NOT EXISTS boundary_polygon GEOGRAPHY(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS polygon_points JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_center GEOGRAPHY(Point, 4326),
  ADD COLUMN IF NOT EXISTS next_radius_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS next_center_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS next_center_lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS next_zone_revealed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_zone_shrink_at TIMESTAMPTZ;

-- Spatial index for polygon boundary
CREATE INDEX IF NOT EXISTS game_rounds_boundary_polygon_idx 
  ON game_rounds USING GIST (boundary_polygon) 
  WHERE boundary_polygon IS NOT NULL;

-- 3. ENHANCE CATCH REPORTS FOR MANDATORY MUTUAL VERIFICATION & GPS AUDIT
-- Both Hider and Seeker must approve, and GPS coordinates + accuracy must be verified
ALTER TABLE catch_reports
  ADD COLUMN IF NOT EXISTS seeker_approved BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS runner_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seeker_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS seeker_lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS seeker_accuracy_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS runner_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS runner_lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS runner_accuracy_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS verified_distance_m NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '60 seconds');

CREATE INDEX IF NOT EXISTS catch_reports_expires_at_idx 
  ON catch_reports (expires_at) 
  WHERE status = 'PENDING';

-- 4. FUNCTION: VERIFY PROXIMITY FOR MUTUAL CAPTURE
-- Authoritative server-side PostGIS distance calculation between seeker and runner
CREATE OR REPLACE FUNCTION verify_capture_proximity(
  p_seeker_lat NUMERIC,
  p_seeker_lon NUMERIC,
  p_seeker_acc NUMERIC,
  p_runner_lat NUMERIC,
  p_runner_lon NUMERIC,
  p_runner_acc NUMERIC,
  p_max_distance_m NUMERIC DEFAULT 10.0,
  p_max_accuracy_m NUMERIC DEFAULT 10.0
)
RETURNS TABLE (
  is_valid BOOLEAN,
  distance_m NUMERIC,
  reason TEXT
) AS $$
DECLARE
  v_distance NUMERIC;
BEGIN
  -- 1. Validate GPS Accuracy
  IF p_seeker_acc > p_max_accuracy_m THEN
    RETURN QUERY SELECT FALSE, 0.0::numeric, 'Seeker GPS accuracy (' || p_seeker_acc || 'm) exceeds limit of ' || p_max_accuracy_m || 'm';
    RETURN;
  END IF;

  IF p_runner_acc > p_max_accuracy_m THEN
    RETURN QUERY SELECT FALSE, 0.0::numeric, 'Runner GPS accuracy (' || p_runner_acc || 'm) exceeds limit of ' || p_max_accuracy_m || 'm';
    RETURN;
  END IF;

  -- 2. Calculate Great-Circle Distance via PostGIS ST_Distance (meters)
  v_distance := ST_Distance(
    ST_SetSRID(ST_MakePoint(p_seeker_lon, p_seeker_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_runner_lon, p_runner_lat), 4326)::geography
  );

  -- 3. Verify Maximum 10-meter Proximity Rule
  IF v_distance <= p_max_distance_m THEN
    RETURN QUERY SELECT TRUE, ROUND(v_distance, 2), 'Proximity verified within ' || p_max_distance_m || 'm';
  ELSE
    RETURN QUERY SELECT FALSE, ROUND(v_distance, 2), 'Distance between players (' || ROUND(v_distance, 1) || 'm) exceeds ' || p_max_distance_m || 'm limit';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
