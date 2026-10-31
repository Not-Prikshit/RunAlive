/* eslint-disable */
// Migration: 005_game_rounds

exports.up = async (pgm) => {
  pgm.createTable('game_rounds', {
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
    round_number: {
      type: 'int',
      notNull: true,
      check: 'round_number > 0',
    },
    duration_seconds: {
      type: 'int',
      notNull: true,
      check: 'duration_seconds BETWEEN 60 AND 86400',
    },
    // PostGIS geography point for center
    center: {
      type: 'geography(Point,4326)',
      notNull: true,
    },
    radius_m: {
      type: 'numeric(8,2)',
      notNull: true,
      check: 'radius_m BETWEEN 50 AND 5000',
    },
    // Derived / denormalized for quick access
    center_lat: {
      type: 'numeric(10,7)',
      notNull: true,
      check: 'center_lat BETWEEN -90 AND 90',
    },
    center_lon: {
      type: 'numeric(10,7)',
      notNull: true,
      check: 'center_lon BETWEEN -180 AND 180',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // One row per round per game
  pgm.createConstraint('game_rounds', 'game_rounds_game_round_unique', {
    unique: ['game_id', 'round_number'],
  });
  pgm.createIndex('game_rounds', 'game_id');
};

exports.down = async (pgm) => {
  pgm.dropTable('game_rounds');
};
