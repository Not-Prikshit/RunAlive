// packages/shared/src/schemas/location.ts
import { z } from 'zod';

export const LocationFixSchema = z.object({
  lat: z.number().min(-90).max(90).finite(),
  lon: z.number().min(-180).max(180).finite(),
  accuracyM: z.number().min(0).max(10000).finite(),
  clientTs: z.number().int().positive(), // Unix ms
  mocked: z.boolean().optional().default(false),
});
export type LocationFix = z.infer<typeof LocationFixSchema>;

export const LocationBatchSchema = z.object({
  fixes: z.array(LocationFixSchema).min(1).max(5),
});
export type LocationBatch = z.infer<typeof LocationBatchSchema>;
