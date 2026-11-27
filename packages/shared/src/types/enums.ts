// packages/shared/src/types/enums.ts
// All enumerations used across server and mobile

export const GameStatus = {
  WAITING: 'WAITING',
  LOBBY: 'LOBBY',
  PLANNING: 'PLANNING',
  COUNTDOWN: 'COUNTDOWN',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
  RECOVERING: 'RECOVERING',
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export const LocationRefreshTier = {
  EASY: 3,
  NORMAL: 10,
  HARD: 20,
  EXTREME: 30,
} as const;
export type LocationRefreshTier = (typeof LocationRefreshTier)[keyof typeof LocationRefreshTier];

export const LocationFreshness = {
  LIVE: 'LIVE',
  UPDATING: 'UPDATING',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
} as const;
export type LocationFreshness = (typeof LocationFreshness)[keyof typeof LocationFreshness];

export const PartyStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const;
export type PartyStatus = (typeof PartyStatus)[keyof typeof PartyStatus];

export const PlayerRole = {
  RUNNER: 'RUNNER',
  SEEKER: 'SEEKER',
  HOST: 'HOST',
} as const;
export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

export const PlayerStatus = {
  ACTIVE: 'ACTIVE',
  CAUGHT: 'CAUGHT',
  DISQUALIFIED: 'DISQUALIFIED',
  LOCATION_UNKNOWN: 'LOCATION_UNKNOWN',
  LEFT: 'LEFT',
  KICKED: 'KICKED',
} as const;
export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus];

export const TeamAssignmentMethod = {
  RANDOM: 'RANDOM',
  MANUAL: 'MANUAL',
} as const;
export type TeamAssignmentMethod = (typeof TeamAssignmentMethod)[keyof typeof TeamAssignmentMethod];

export const CatchVerificationMode = {
  RUNNER_OR_HOST: 'RUNNER_OR_HOST',
  HOST_ONLY: 'HOST_ONLY',
  RUNNER_ONLY: 'RUNNER_ONLY',
} as const;
export type CatchVerificationMode = (typeof CatchVerificationMode)[keyof typeof CatchVerificationMode];

export const CatchReportStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  DISPUTED: 'DISPUTED',
} as const;
export type CatchReportStatus = (typeof CatchReportStatus)[keyof typeof CatchReportStatus];

export const ViolationStatus = {
  OPEN: 'OPEN',
  CLEARED: 'CLEARED',
  DISQUALIFIED: 'DISQUALIFIED',
  SUSPENDED: 'SUSPENDED',
  REVERSED: 'REVERSED',
} as const;
export type ViolationStatus = (typeof ViolationStatus)[keyof typeof ViolationStatus];

export const DisqualificationReason = {
  BOUNDARY: 'BOUNDARY',
  LOCATION_LOSS: 'LOCATION_LOSS',
  HOST: 'HOST',
} as const;
export type DisqualificationReason = (typeof DisqualificationReason)[keyof typeof DisqualificationReason];

export const DangerBand = {
  UNKNOWN: 'UNKNOWN',
  SAFE: 'SAFE',
  LOW: 'LOW',
  ELEVATED: 'ELEVATED',
  MEDIUM: 'MEDIUM',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  DANGER: 'DANGER',
  CRITICAL: 'CRITICAL',
  CAUGHT: 'CAUGHT',
} as const;
export type DangerBand = (typeof DangerBand)[keyof typeof DangerBand];

export const JobType = {
  START_COUNTDOWN_END: 'START_COUNTDOWN_END',
  ROUND_ANNOUNCE: 'ROUND_ANNOUNCE',
  ROUND_END: 'ROUND_END',
  MATCH_END: 'MATCH_END',
  VIOLATION_DEADLINE: 'VIOLATION_DEADLINE',
  SHARE_TICK: 'SHARE_TICK',
  LOCATION_LOSS_CHECK: 'LOCATION_LOSS_CHECK',
  JANITOR: 'JANITOR',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const GameWinner = {
  RUNNERS: 'RUNNERS',
  SEEKERS: 'SEEKERS',
  DRAW: 'DRAW',
} as const;
export type GameWinner = (typeof GameWinner)[keyof typeof GameWinner];
