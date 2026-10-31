/* eslint-disable */
// Migration: 010_game_events (audit log)

exports.up = async (pgm) => {
  pgm.createTable('game_events', {
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
    actor_user_id: {
      type: 'uuid',
      references: 'users(id)',
    },
    event_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    // JSON payload — NO coordinates, NO tokens
    payload: {
      type: 'jsonb',
      notNull: true,
      default: "'{}'",
    },
    state_version: {
      type: 'int',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('game_events', 'game_id');
  pgm.createIndex('game_events', ['game_id', 'created_at'], {
    name: 'game_events_game_time_idx',
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('game_events');
};
