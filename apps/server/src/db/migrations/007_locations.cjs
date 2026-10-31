/* eslint-disable */
// Migration: 007_locations

exports.up = async (pgm) => {
  // Latest precise location per active player (only latest — no history)
  pgm.createTable('player_latest_locations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    game_id: {
      type: 'uuid',
      notNull: true,
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    location: {
      type: 'geography(Point,4326)',
      notNull: true,
    },
    accuracy_m: {
      type: 'numeric(8,2)',
      notNull: true,
    },
    client_ts: {
      type: 'timestamptz',
      notNull: true,
    },
    received_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    is_suspect: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    is_mocked: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // One location per player per game (UPSERT target)
  pgm.createConstraint('player_latest_locations', 'player_latest_locations_game_user_unique', {
    unique: ['game_id', 'user_id'],
  });

  pgm.createIndex('player_latest_locations', 'game_id');
  pgm.createIndex('player_latest_locations', 'user_id');
  // Spatial index
  pgm.sql(`CREATE INDEX player_latest_locations_location_idx
           ON player_latest_locations USING GIST (location)`);

  // Approximate runner snapshots sent to seekers
  pgm.createTable('runner_snapshots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    game_id: {
      type: 'uuid',
      notNull: true,
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    runner_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    approx_location: {
      type: 'geography(Point,4326)',
      notNull: true,
    },
    uncertainty_m: {
      type: 'numeric(8,2)',
      notNull: true,
    },
    captured_at: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // One snapshot per runner per game (UPSERT target — latest only)
  pgm.createConstraint('runner_snapshots', 'runner_snapshots_game_runner_unique', {
    unique: ['game_id', 'runner_user_id'],
  });
  pgm.createIndex('runner_snapshots', 'game_id');

  // Danger state per runner (latest only)
  pgm.createTable('danger_state', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    game_id: {
      type: 'uuid',
      notNull: true,
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    runner_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    band: {
      type: 'varchar(10)',
      notNull: true,
      default: "'UNKNOWN'",
      check: "band IN ('UNKNOWN','SAFE','LOW','MEDIUM','HIGH','CRITICAL')",
    },
    level: {
      type: 'int',
      notNull: true,
      default: 0,
      check: 'level BETWEEN 0 AND 100',
    },
    smoothed_distance_m: {
      type: 'numeric(10,2)',
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createConstraint('danger_state', 'danger_state_game_runner_unique', {
    unique: ['game_id', 'runner_user_id'],
  });
  pgm.createIndex('danger_state', 'game_id');
};

exports.down = async (pgm) => {
  pgm.dropTable('danger_state');
  pgm.dropTable('runner_snapshots');
  pgm.dropTable('player_latest_locations');
};
