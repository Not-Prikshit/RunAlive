/* eslint-disable */
// Migration: 014_parties_and_chat

exports.up = async (pgm) => {
  // ── 1. Parties Table ────────────────────────────────────────────────────────
  pgm.createTable('parties', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    party_code: {
      type: 'varchar(6)',
      notNull: true,
      unique: true,
    },
    leader_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'RESTRICT',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'OPEN'",
      check: "status IN ('OPEN','CLOSED','EXPIRED')",
    },
    max_members: {
      type: 'int',
      notNull: true,
      default: 16,
      check: 'max_members BETWEEN 2 AND 50',
    },
    lock_when_match_starts: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    reveal_seekers_on_map: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    active_match_id: {
      type: 'uuid',
      references: 'games(id)',
      onDelete: 'SET NULL',
    },
    settings: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
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

  pgm.createIndex('parties', 'party_code');
  pgm.createIndex('parties', 'leader_user_id');
  pgm.createIndex('parties', 'status');

  // ── 2. Party Members Table ──────────────────────────────────────────────────
  pgm.createTable('party_members', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    party_id: {
      type: 'uuid',
      notNull: true,
      references: 'parties(id)',
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
      default: "'RUNNER'",
      check: "role IN ('RUNNER','SEEKER','HOST')",
    },
    is_ready: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    is_connected: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    left_at: {
      type: 'timestamptz',
    },
  });

  pgm.createConstraint('party_members', 'party_members_party_user_unique', {
    unique: ['party_id', 'user_id'],
  });
  pgm.createIndex('party_members', 'party_id');
  pgm.createIndex('party_members', 'user_id');

  // ── 3. Party Chat Messages Table ────────────────────────────────────────────
  pgm.createTable('party_chat_messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    party_id: {
      type: 'uuid',
      notNull: true,
      references: 'parties(id)',
      onDelete: 'CASCADE',
    },
    match_id: {
      type: 'uuid',
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    sender_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    message: {
      type: 'varchar(500)',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('party_chat_messages', 'party_id');
  pgm.createIndex('party_chat_messages', ['party_id', 'created_at']);

  // ── 4. Party Announcements Table ────────────────────────────────────────────
  pgm.createTable('party_announcements', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    party_id: {
      type: 'uuid',
      notNull: true,
      references: 'parties(id)',
      onDelete: 'CASCADE',
    },
    match_id: {
      type: 'uuid',
      references: 'games(id)',
      onDelete: 'CASCADE',
    },
    sender_user_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    announcement_type: {
      type: 'varchar(30)',
      notNull: true,
      default: "'SYSTEM'",
      check: "announcement_type IN ('SYSTEM','HOST','EVENT','WARNING','ELIMINATION')",
    },
    message: {
      type: 'text',
      notNull: true,
    },
    metadata: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('party_announcements', 'party_id');
  pgm.createIndex('party_announcements', ['party_id', 'created_at']);

  // ── 5. Add party_id to games table if not exists ────────────────────────────
  pgm.addColumns('games', {
    party_id: {
      type: 'uuid',
      references: 'parties(id)',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumns('games', ['party_id']);
  pgm.dropTable('party_announcements');
  pgm.dropTable('party_chat_messages');
  pgm.dropTable('party_members');
  pgm.dropTable('parties');
};
