/* eslint-disable */
// Migration: 012_idempotency_keys

exports.up = async (pgm) => {
  pgm.createTable('idempotency_keys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    key: {
      type: 'uuid',
      notNull: true,
      unique: true,
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    resource_type: {
      type: 'varchar(30)',
      notNull: true,
    },
    resource_id: {
      type: 'uuid',
    },
    response_status: {
      type: 'int',
    },
    response_body: {
      type: 'jsonb',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('idempotency_keys', 'key');
  pgm.createIndex('idempotency_keys', 'expires_at', {
    name: 'idempotency_keys_expires_idx',
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('idempotency_keys');
};
