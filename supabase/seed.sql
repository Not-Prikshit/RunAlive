-- ============================================================================
-- RUNALIVE: SUPABASE DEMO SEED DATA
-- Inserts default host, runner, and seeker accounts
-- Password for all accounts: RunAlive2026!
-- ============================================================================

INSERT INTO users (email, password_hash, display_name, email_verified_at)
VALUES 
  (
    'demo@runalive.test',
    '$argon2id$v=19$m=65536,t=3,p=4$v3OUfN4EZm+198vH7xZYig$q+MU5NYi+jgsB/Yi0SVCsSAOqcwTXpWYdYu8lG2vxIo',
    'Campus Host (Alex)',
    NOW()
  ),
  (
    'runner@runalive.test',
    '$argon2id$v=19$m=65536,t=3,p=4$v3OUfN4EZm+198vH7xZYig$q+MU5NYi+jgsB/Yi0SVCsSAOqcwTXpWYdYu8lG2vxIo',
    'Speedy Runner (Sam)',
    NOW()
  ),
  (
    'seeker@runalive.test',
    '$argon2id$v=19$m=65536,t=3,p=4$v3OUfN4EZm+198vH7xZYig$q+MU5NYi+jgsB/Yi0SVCsSAOqcwTXpWYdYu8lG2vxIo',
    'Eagle Seeker (Riley)',
    NOW()
  )
ON CONFLICT (email) DO UPDATE 
SET 
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  deleted_at = NULL;
