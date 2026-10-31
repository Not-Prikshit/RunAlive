// packages/shared/src/schemas/game.ts
import { z } from 'zod';
import { TeamAssignmentMethod, CatchVerificationMode } from '../types/enums.js';

export const GameRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  durationSeconds: z.number().int().min(60).max(86400),
  centerLat: z.number().min(-90).max(90).finite(),
  centerLon: z.number().min(-180).max(180).finite(),
  radiusM: z.number().min(50).max(5000).finite(),
});
export type GameRoundInput = z.infer<typeof GameRoundSchema>;

export const GameConfigSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  maxPlayers: z.number().int().min(2).max(100),
  teamAssignmentMethod: z.nativeEnum(TeamAssignmentMethod),
  hostParticipates: z.boolean().default(false),
  seekerCount: z.number().int().positive().nullable().optional(),
  seekerRatio: z.number().min(0.1).max(0.9).nullable().optional(),
  announceLeadSeconds: z.number().int().min(30).max(600).default(120),
  runnerShareIntervalSeconds: z.number().int().min(30).max(300).default(90),
  violationGraceSeconds: z.number().int().min(10).max(300).default(60),
  catchVerificationMode: z.nativeEnum(CatchVerificationMode).default(CatchVerificationMode.RUNNER_OR_HOST),
  obfuscationGridM: z.number().int().min(10).max(200).default(60),
  locationLossThresholdSeconds: z.number().int().min(30).max(600).default(90),
  autoEliminateOnLocationLoss: z.boolean().default(false),
  requireAllReady: z.boolean().default(true),
});
export type GameConfigInput = z.infer<typeof GameConfigSchema>;

export const CreateGameSchema = z.object({
  config: GameConfigSchema,
  rounds: z.array(GameRoundSchema).min(1).max(10),
});

export const JoinGameSchema = z.object({
  roomCode: z.string().length(6).toUpperCase(),
  locationConsentAt: z.string().datetime(),
});

export const TeamAssignSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['RUNNER', 'SEEKER']),
});

export const KickPlayerSchema = z.object({
  userId: z.string().uuid(),
});

export const RandomizeTeamsSchema = z.object({
  seekerCount: z.number().int().positive().optional(),
  seekerRatio: z.number().min(0.1).max(0.9).optional(),
});
