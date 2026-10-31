/* eslint-disable */
// Migration: 013_results

exports.up = async (pgm) => {
  pgm.createTable('game_results', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    game_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    winner: {
      type: 'varchar(10)',
      notNull: true,
      check: "winner IN ('RUNNERS','SEEKERS','DRAW')",
    },
    match_duration_seconds: {
      type: 'int',
      notNull: true,
    },
    rounds_completed: {
      type: 'int',
      notNull: true,
    },
    runners_caught: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    runners_disqualified: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    runners_remaining: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    finished_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createTable('game_participations', {
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
    role: {
      type: 'varchar(10)',
      notNull: true,
      check: "role IN ('RUNNER','SEEKER','HOST')",
    },
    outcome: {
      type: 'varchar(5)',
      notNull: true,
      check: "outcome IN ('WIN','LOSS','DRAW')",
    },
    survival_seconds: {
      type: 'int',
    },
    catches_made: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    was_disqualified: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createConstraint('game_participations', 'game_participations_game_user_unique', {
    unique: ['game_id', 'user_id'],
  });
  pgm.createIndex('game_participations', 'user_id');
  pgm.createIndex('game_participations', 'game_id');
};

exports.down = async (pgm) => {
  pgm.dropTable('game_participations');
  pgm.dropTable('game_results');
};
