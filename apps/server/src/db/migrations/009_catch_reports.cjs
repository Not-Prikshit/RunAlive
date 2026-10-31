/* eslint-disable */
// Migration: 009_catch_reports

exports.up = async (pgm) => {
  pgm.createTable('catch_reports', {
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
    seeker_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'RESTRICT',
    },
    runner_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'RESTRICT',
    },
    idempotency_key: {
      type: 'uuid',
      notNull: true,
    },
    status: {
      type: 'varchar(15)',
      notNull: true,
      default: "'PENDING'",
      check: "status IN ('PENDING','CONFIRMED','REJECTED','DISPUTED')",
    },
    verified_by: {
      type: 'uuid',
      references: 'users(id)',
    },
    verified_at: {
      type: 'timestamptz',
    },
    reject_reason: {
      type: 'text',
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

  pgm.createIndex('catch_reports', 'game_id');
  pgm.createIndex('catch_reports', 'seeker_user_id');
  pgm.createIndex('catch_reports', 'runner_user_id');
  pgm.createIndex('catch_reports', 'idempotency_key', { unique: true });

  // Only one PENDING catch per runner per game at a time
  pgm.sql(`
    CREATE UNIQUE INDEX catch_reports_one_pending_per_runner
    ON catch_reports (game_id, runner_user_id)
    WHERE status = 'PENDING'
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('catch_reports');
};
