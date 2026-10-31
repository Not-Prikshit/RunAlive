/* eslint-disable */
// Migration: 008_boundary_violations

exports.up = async (pgm) => {
  pgm.createTable('boundary_violations', {
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
    player_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'varchar(15)',
      notNull: true,
      default: "'OPEN'",
      check: "status IN ('OPEN','CLEARED','DISQUALIFIED','SUSPENDED','REVERSED')",
    },
    started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deadline_at: {
      type: 'timestamptz',
      notNull: true,
    },
    resolved_at: {
      type: 'timestamptz',
    },
    reversal_by: {
      type: 'uuid',
      references: 'users(id)',
    },
  });

  pgm.createIndex('boundary_violations', 'game_id');
  pgm.createIndex('boundary_violations', 'player_user_id');
  pgm.createIndex('boundary_violations', ['game_id', 'player_user_id', 'status'], {
    name: 'boundary_violations_game_player_status_idx',
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('boundary_violations');
};
