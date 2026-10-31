/* eslint-disable */
// Migration: 006_game_players

exports.up = async (pgm) => {
  pgm.createTable('game_players', {
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
      onDelete: 'RESTRICT',
    },
    role: {
      type: 'varchar(10)',
      notNull: true,
      default: "'RUNNER'",
      check: "role IN ('RUNNER','SEEKER','HOST')",
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'ACTIVE'",
      check: "status IN ('ACTIVE','CAUGHT','DISQUALIFIED','LOCATION_UNKNOWN','LEFT','KICKED')",
    },
    is_ready: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    connected: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    last_seen_at: {
      type: 'timestamptz',
    },
    location_consent_at: {
      type: 'timestamptz',
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    eliminated_at: {
      type: 'timestamptz',
    },
    disqualification_reason: {
      type: 'varchar(20)',
      check: "disqualification_reason IN ('BOUNDARY','LOCATION_LOSS','HOST')",
    },
  });

  // One membership per user per game
  pgm.createConstraint('game_players', 'game_players_game_user_unique', {
    unique: ['game_id', 'user_id'],
  });

  pgm.createIndex('game_players', 'game_id');
  pgm.createIndex('game_players', 'user_id');
  pgm.createIndex('game_players', ['game_id', 'role', 'status'], {
    name: 'game_players_game_role_status_idx',
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('game_players');
};
