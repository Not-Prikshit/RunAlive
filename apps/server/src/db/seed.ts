// apps/server/src/db/seed.ts
// Demo database seed: creates demo users for quick start and pairing

import { pool, query } from './pool.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { logger } from '../logger.js';

export const DEMO_CREDENTIALS = {
  host: {
    email: 'demo@runalive.test',
    password: 'RunAlive2026!',
    displayName: 'Campus Host (Alex)',
  },
  runner: {
    email: 'runner@runalive.test',
    password: 'RunAlive2026!',
    displayName: 'Speedy Runner (Sam)',
  },
  seeker: {
    email: 'seeker@runalive.test',
    password: 'RunAlive2026!',
    displayName: 'Eagle Seeker (Riley)',
  },
};

export async function seedDemoUsers(): Promise<void> {
  logger.info('🌱 Seeding demo accounts...');

  for (const [key, cred] of Object.entries(DEMO_CREDENTIALS)) {
    const hash = await hashPassword(cred.password);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             display_name = EXCLUDED.display_name,
             deleted_at = NULL
       RETURNING id`,
      [cred.email.toLowerCase(), hash, cred.displayName]
    );

    logger.info({ role: key, email: cred.email, userId: rows[0]?.id }, 'Demo user ready');
  }

  logger.info('✅ Demo seeding complete.');
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDemoUsers()
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'Seed failed');
      process.exit(1);
    });
}
