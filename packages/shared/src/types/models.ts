// packages/shared/src/types/models.ts
// Shared data shape types (subset safe for client consumption)

export interface UserPublic {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface GameRound {
  roundNumber: number;
  durationSeconds: number;
  centerLat: number;
  centerLon: number;
  radiusM: number;
}

export interface GameConfig {
  name: string;
  maxPlayers: number;
  teamAssignmentMethod: import('./enums').TeamAssignmentMethod;
  hostParticipates: boolean;
  seekerCount: number | null;
  seekerRatio: number | null;
  announceLeadSeconds: number;
  runnerShareIntervalSeconds: number;
  violationGraceSeconds: number;
  catchVerificationMode: import('./enums').CatchVerificationMode;
  obfuscationGridM: number;
  locationLossThresholdSeconds: number;
  autoEliminateOnLocationLoss: boolean;
  requireAllReady: boolean;
  rounds: GameRound[];
}

export interface PlayerSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: import('./enums').PlayerRole;
  status: import('./enums').PlayerStatus;
  isReady: boolean;
  isConnected: boolean;
  lastSeenAt: string | null;
}

export interface GameStateSummary {
  id: string;
  roomCode: string;
  status: import('./enums').GameStatus;
  hostUserId: string;
  currentRound: number;
  totalRounds: number;
  endsAt: string | null;
  roundEndsAt: string | null;
  runnersLeft: number;
  totalRunners: number;
  stateVersion: number;
  serverTime: string;
}

export interface ApproxLocation {
  lat: number;
  lon: number;
  uncertaintyM: number;
  capturedAt: string;
  freshnessSeconds: number;
}

export interface RunnerSnapshot {
  userId: string;
  displayName: string;
  location: ApproxLocation | null;
  isFresh: boolean;
}

export interface DangerState {
  band: import('./enums').DangerBand;
  level: number; // 0-100
}

export interface ViolationInfo {
  id: string;
  deadlineAt: string;
  startedAt: string;
}

export interface CatchReportPublic {
  id: string;
  runnerId: string;
  seekerId: string;
  status: import('./enums').CatchReportStatus;
  createdAt: string;
}

export interface GameResult {
  gameId: string;
  winner: import('./enums').GameWinner;
  matchDurationSeconds: number;
  roundsCompleted: number;
  runnersCaught: number;
  runnersDisqualified: number;
  runnersRemaining: number;
  finishedAt: string;
}

export interface ParticipationRecord {
  gameId: string;
  gameName: string;
  role: import('./enums').PlayerRole;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  survivalSeconds: number | null;
  catchesMade: number;
  wasDisqualified: boolean;
  playedAt: string;
}
