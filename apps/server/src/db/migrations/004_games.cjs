/* eslint-disable */
// Migration: 004_games

exports.up = async (pgm) => {
  pgm.createTable('games', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    host_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'RESTRICT',
    },
    room_code: {
      type: 'varchar(6)',
      notNull: true,
    },
    name: {
      type: 'varchar(80)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'LOBBY'",
      check: "status IN ('LOBBY','STARTING','ACTIVE','PAUSED','FINISHED','CANCELLED')",
    },
    max_players: {
      type: 'int',
      notNull: true,
      default: 20,
      check: 'max_players BETWEEN 2 AND 100',
    },
    team_assignment_method: {
      type: 'varchar(10)',
      notNull: true,
      default: "'RANDOM'",
      check: "team_assignment_method IN ('RANDOM','MANUAL')",
    },
    host_participates: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    seeker_count: {
      type: 'int',
    },
    seeker_ratio: {
      type: 'numeric(4,3)',
    },
    announce_lead_seconds: {
      type: 'int',
      notNull: true,
      default: 120,
    },
    runner_share_interval_seconds: {
      type: 'int',
      notNull: true,
      default: 90,
      check: 'runner_share_interval_seconds BETWEEN 30 AND 300',
    },
    violation_grace_seconds: {
      type: 'int',
      notNull: true,
      default: 60,
    },
    catch_verification_mode: {
      type: 'varchar(20)',
      notNull: true,
      default: "'RUNNER_OR_HOST'",
      check: "catch_verification_mode IN ('RUNNER_OR_HOST','HOST_ONLY','RUNNER_ONLY')",
    },
    obfuscation_grid_m: {
      type: 'int',
      notNull: true,
      default: 60,
    },
    location_loss_threshold_seconds: {
      type: 'int',
      notNull: true,
      default: 90,
    },
    auto_eliminate_on_location_loss: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    require_all_ready: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    current_round: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    total_rounds: {
      type: 'int',
      notNull: true,
      default: 1,
    },
    started_at: {
      type: 'timestamptz',
    },
    ends_at: {
      type: 'timestamptz',
    },
    round_ends_at: {
      type: 'timestamptz',
    },
    paused_at: {
      type: 'timestamptz',
    },
    total_paused_ms: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    finished_at: {
      type: 'timestamptz',
    },
    state_version: {
      type: 'int',
      notNull: true,
      default: 1,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Room code unique among non-finished games
  pgm.createIndex('games', 'room_code', {
    unique: true,
    where: "status NOT IN ('FINISHED', 'CANCELLED')",
    name: 'games_room_code_active_unique',
  });
  pgm.createIndex('games', 'host_user_id');
  pgm.createIndex('games', 'status');
};

exports.down = async (pgm) => {
  pgm.dropTable('games');
};
