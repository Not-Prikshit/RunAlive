// packages/shared/src/types/models.ts
// Shared data shape types (subset safe for client consumption)

import type {
  TeamAssignmentMethod,
  CatchVerificationMode,
  PlayerRole,
  PlayerStatus,
  GameStatus,
  DangerBand,
  CatchReportStatus,
  GameWinner,
  PartyStatus,
} from './enums.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

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
  teamAssignmentMethod: TeamAssignmentMethod;
  hostParticipates: boolean;
  seekerCount: number | null;
  seekerRatio: number | null;
  announceLeadSeconds: number;
  runnerShareIntervalSeconds: number;
  violationGraceSeconds: number;
  catchVerificationMode: CatchVerificationMode;
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
  role: PlayerRole;
  status: PlayerStatus;
  isReady: boolean;
  isConnected: boolean;
  lastSeenAt: string | null;
  lat?: number | undefined;
  lon?: number | undefined;
  accuracyM?: number | undefined;
}

export interface GameStateSummary {
  id: string;
  roomCode: string;
  status: GameStatus;
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
  band: DangerBand;
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
  status: CatchReportStatus;
  createdAt: string;
}

export interface GameResult {
  gameId: string;
  winner: GameWinner;
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
  role: PlayerRole;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  survivalSeconds: number | null;
  catchesMade: number;
  wasDisqualified: boolean;
  playedAt: string;
}

export interface PartyMemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  joinedAt: string;
}

export interface PartySummary {
  id: string;
  partyCode: string;
  leaderUserId: string;
  status: PartyStatus;
  maxMembers: number;
  memberCount: number;
  lockWhenMatchStarts: boolean;
  revealSeekersOnMap: boolean;
  activeMatchId: string | null;
  members: PartyMemberSummary[];
  createdAt: string;
}

export interface PartyChatMessage {
  id: string;
  partyId: string;
  matchId?: string | null;
  senderUserId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  senderRole?: PlayerRole;
  message: string;
  createdAt: string;
}

export interface PartyAnnouncement {
  id: string;
  partyId: string;
  matchId?: string | null;
  senderUserId?: string | null;
  senderDisplayName?: string | null;
  announcementType: 'SYSTEM' | 'HOST' | 'EVENT' | 'WARNING' | 'ELIMINATION';
  message: string;
  metadata?: Record<string, any>;
  createdAt: string;
}
