// packages/shared/src/schemas/catch.ts
import { z } from 'zod';

export const SubmitCatchSchema = z.object({
  runnerId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const ResolveCatchSchema = z.object({
  action: z.enum(['confirm', 'reject', 'dispute']),
});
