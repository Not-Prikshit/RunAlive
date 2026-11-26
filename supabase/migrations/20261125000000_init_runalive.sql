-- ============================================================================
-- RUNALIVE: SUPABASE FULL DATABASE SCHEMA INITIALIZATION
-- Compatible with Supabase SQL Editor and Supabase CLI
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------------------------
-- 2. USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  avatar_url TEXT,
  email_verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. AUTH & REFRESH TOKENS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family UUID NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);

-- ----------------------------------------------------------------------------
-- 4. GAMES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  room_code VARCHAR(6) NOT NULL,
  name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'LOBBY' CHECK (status IN ('LOBBY','STARTING','ACTIVE','PAUSED','FINISHED','CANCELLED')),
  max_players INT NOT NULL DEFAULT 20 CHECK (max_players BETWEEN 2 AND 100),
  team_assignment_method VARCHAR(10) NOT NULL DEFAULT 'RANDOM' CHECK (team_assignment_method IN ('RANDOM','MANUAL')),
  host_participates BOOLEAN NOT NULL DEFAULT FALSE,
  seeker_count INT,
  seeker_ratio NUMERIC(4,3),
  announce_lead_seconds INT NOT NULL DEFAULT 120,
  runner_share_interval_seconds INT NOT NULL DEFAULT 90 CHECK (runner_share_interval_seconds BETWEEN 30 AND 300),
  violation_grace_seconds INT NOT NULL DEFAULT 60,
  catch_verification_mode VARCHAR(20) NOT NULL DEFAULT 'RUNNER_OR_HOST' CHECK (catch_verification_mode IN ('RUNNER_OR_HOST','HOST_ONLY','RUNNER_ONLY')),
  obfuscation_grid_m INT NOT NULL DEFAULT 60,
  location_loss_threshold_seconds INT NOT NULL DEFAULT 90,
  auto_eliminate_on_location_loss BOOLEAN NOT NULL DEFAULT FALSE,
  require_all_ready BOOLEAN NOT NULL DEFAULT TRUE,
  current_round INT NOT NULL DEFAULT 0,
  total_rounds INT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  round_ends_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  total_paused_ms BIGINT NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  state_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS games_active_room_code_unique ON games (room_code) WHERE status NOT IN ('FINISHED','CANCELLED');
CREATE INDEX IF NOT EXISTS games_host_user_id_idx ON games (host_user_id);
CREATE INDEX IF NOT EXISTS games_status_idx ON games (status);

-- ----------------------------------------------------------------------------
-- 5. GAME ROUNDS (POSTGIS PERIMETER / BOUNDARY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INT NOT NULL CHECK (round_number > 0),
  duration_seconds INT NOT NULL CHECK (duration_seconds BETWEEN 60 AND 86400),
  center GEOGRAPHY(Point,4326) NOT NULL,
  radius_m NUMERIC(8,2) NOT NULL CHECK (radius_m BETWEEN 50 AND 5000),
  center_lat NUMERIC(10,7) NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lon NUMERIC(10,7) NOT NULL CHECK (center_lon BETWEEN -180 AND 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_rounds_game_round_unique UNIQUE (game_id, round_number)
);

CREATE INDEX IF NOT EXISTS game_rounds_game_id_idx ON game_rounds (game_id);

-- ----------------------------------------------------------------------------
-- 6. GAME PLAYERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(10) NOT NULL DEFAULT 'RUNNER' CHECK (role IN ('RUNNER','SEEKER','HOST')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CAUGHT','DISQUALIFIED','LOCATION_UNKNOWN','LEFT','KICKED')),
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  location_consent_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eliminated_at TIMESTAMPTZ,
  disqualification_reason VARCHAR(20) CHECK (disqualification_reason IN ('BOUNDARY','LOCATION_LOSS','HOST')),
  CONSTRAINT game_players_game_user_unique UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS game_players_game_id_idx ON game_players (game_id);
CREATE INDEX IF NOT EXISTS game_players_user_id_idx ON game_players (user_id);
CREATE INDEX IF NOT EXISTS game_players_game_role_status_idx ON game_players (game_id, role, status);

-- ----------------------------------------------------------------------------
-- 7. LOCATIONS, SNAPSHOTS & DANGER METERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_latest_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location GEOGRAPHY(Point,4326) NOT NULL,
  accuracy_m NUMERIC(8,2) NOT NULL,
  client_ts TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_suspect BOOLEAN NOT NULL DEFAULT FALSE,
  is_mocked BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT player_latest_locations_game_user_unique UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS player_latest_locations_game_id_idx ON player_latest_locations (game_id);
CREATE INDEX IF NOT EXISTS player_latest_locations_user_id_idx ON player_latest_locations (user_id);
CREATE INDEX IF NOT EXISTS player_latest_locations_location_idx ON player_latest_locations USING GIST (location);

CREATE TABLE IF NOT EXISTS runner_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  runner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approx_location GEOGRAPHY(Point,4326) NOT NULL,
  uncertainty_m NUMERIC(8,2) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT runner_snapshots_game_runner_unique UNIQUE (game_id, runner_user_id)
);

CREATE INDEX IF NOT EXISTS runner_snapshots_game_id_idx ON runner_snapshots (game_id);

CREATE TABLE IF NOT EXISTS danger_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  runner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  band VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN' CHECK (band IN ('UNKNOWN','SAFE','LOW','MEDIUM','HIGH','CRITICAL')),
  level INT NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 100),
  smoothed_distance_m NUMERIC(10,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT danger_state_game_runner_unique UNIQUE (game_id, runner_user_id)
);

CREATE INDEX IF NOT EXISTS danger_state_game_id_idx ON danger_state (game_id);

-- ----------------------------------------------------------------------------
-- 8. BOUNDARY VIOLATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boundary_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLEARED','DISQUALIFIED','SUSPENDED','REVERSED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  reversal_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS boundary_violations_game_id_idx ON boundary_violations (game_id);
CREATE INDEX IF NOT EXISTS boundary_violations_player_user_id_idx ON boundary_violations (player_user_id);
CREATE INDEX IF NOT EXISTS boundary_violations_game_player_status_idx ON boundary_violations (game_id, player_user_id, status);

-- ----------------------------------------------------------------------------
-- 9. CATCH REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catch_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seeker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  runner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL UNIQUE,
  status VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED','DISPUTED')),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catch_reports_game_id_idx ON catch_reports (game_id);
CREATE INDEX IF NOT EXISTS catch_reports_seeker_user_id_idx ON catch_reports (seeker_user_id);
CREATE INDEX IF NOT EXISTS catch_reports_runner_user_id_idx ON catch_reports (runner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS catch_reports_one_pending_per_runner ON catch_reports (game_id, runner_user_id) WHERE status = 'PENDING';

-- ----------------------------------------------------------------------------
-- 10. GAME AUDIT EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  state_version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_events_game_id_idx ON game_events (game_id);
CREATE INDEX IF NOT EXISTS game_events_game_time_idx ON game_events (game_id, created_at);

-- ----------------------------------------------------------------------------
-- 11. SCHEDULED JOBS (GAME ENGINE TICKER & CRON)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(30) NOT NULL CHECK (type IN ('START_COUNTDOWN_END','ROUND_ANNOUNCE','ROUND_END','MATCH_END','VIOLATION_DEADLINE','SHARE_TICK','LOCATION_LOSS_CHECK','JANITOR')),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL UNIQUE,
  due_at TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs (due_at) WHERE completed_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS scheduled_jobs_game_id_idx ON scheduled_jobs (game_id);

-- ----------------------------------------------------------------------------
-- 12. IDEMPOTENCY KEYS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type VARCHAR(30) NOT NULL,
  resource_id UUID,
  response_status INT,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idempotency_keys_key_idx ON idempotency_keys (key);
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx ON idempotency_keys (expires_at) WHERE expires_at < NOW();

-- ----------------------------------------------------------------------------
-- 13. GAME RESULTS & PARTICIPATION STATS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  winner VARCHAR(10) NOT NULL CHECK (winner IN ('RUNNERS','SEEKERS','DRAW')),
  match_duration_seconds INT NOT NULL,
  rounds_completed INT NOT NULL,
  runners_caught INT NOT NULL DEFAULT 0,
  runners_disqualified INT NOT NULL DEFAULT 0,
  runners_remaining INT NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('RUNNER','SEEKER','HOST')),
  outcome VARCHAR(5) NOT NULL CHECK (outcome IN ('WIN','LOSS','DRAW')),
  survival_seconds INT,
  catches_made INT NOT NULL DEFAULT 0,
  was_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_participations_game_user_unique UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS game_participations_user_id_idx ON game_participations (user_id);
CREATE INDEX IF NOT EXISTS game_participations_game_id_idx ON game_participations (game_id);
