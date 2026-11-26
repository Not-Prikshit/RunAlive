/* eslint-disable */
// Migration: 011_scheduled_jobs

exports.up = async (pgm) => {
  pgm.createTable('scheduled_jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    type: {
      type: 'varchar(30)',
      notNull: true,
      check: "type IN ('START_COUNTDOWN_END','ROUND_ANNOUNCE','ROUND_END','MATCH_END','VIOLATION_DEADLINE','SHARE_TICK','LOCATION_LOSS_CHECK','JANITOR')",
    },
    game_id: {
      type: 'uuid',
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    // JSON payload for the job handler
    payload: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    dedupe_key: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    due_at: {
      type: 'timestamptz',
      notNull: true,
    },
    locked_at: {
      type: 'timestamptz',
    },
    completed_at: {
      type: 'timestamptz',
    },
    failed_at: {
      type: 'timestamptz',
    },
    error_message: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Index for the scheduler poll: due, not completed
  pgm.createIndex('scheduled_jobs', ['due_at'], {
    name: 'scheduled_jobs_due_idx',
    where: 'completed_at IS NULL AND failed_at IS NULL',
  });
  pgm.createIndex('scheduled_jobs', 'game_id');
};

exports.down = async (pgm) => {
  pgm.dropTable('scheduled_jobs');
};
