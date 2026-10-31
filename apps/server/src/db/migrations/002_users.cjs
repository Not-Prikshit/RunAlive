/* eslint-disable */
// Migration: 002_users

exports.up = async (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'citext',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    display_name: {
      type: 'varchar(50)',
      notNull: true,
    },
    avatar_url: {
      type: 'text',
    },
    email_verified_at: {
      type: 'timestamptz',
    },
    deleted_at: {
      type: 'timestamptz',
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

  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'deleted_at', { where: 'deleted_at IS NOT NULL' });
};

exports.down = async (pgm) => {
  pgm.dropTable('users');
};
