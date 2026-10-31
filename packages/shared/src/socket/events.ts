// packages/shared/src/socket/events.ts
// Single source of truth for all Socket.IO event names and payload types.
// Import this on both server and mobile.

import type {
  GameStateSummary,
  PlayerSummary,
  GameRound,
  RunnerSnapshot,
  DangerState,
  ViolationInfo,
  CatchReportPublic,
  GameResult,
} from '../types/models.js';
import type { PlayerStatus } from '../types/enums.js';

// ─── Event Name Constants ─────────────────────────────────────────────────────

export const SocketEvent = {
  // Server → Client
  GAME_STATE: 'game:state',
  LOBBY_UPDATED: 'lobby:updated',
  GAME_STARTED: 'game:started',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',
  ROUND_ANNOUNCE: 'round:announce',
  ROUND_STARTED: 'round:started',
  PLAYERS_COUNT: 'players:count',
  SEEKERS_SNAPSHOT: 'seekers:snapshot',
  RUNNER_DANGER: 'runner:danger',
  VIOLATION_STARTED: 'violation:started',
  VIOLATION_CLEARED: 'violation:cleared',
  PLAYER_ELIMINATED: 'player:eliminated',
  CATCH_PENDING: 'catch:pending',
  CATCH_RESOLVED: 'catch:resolved',
  HOST_ALERT: 'host:alert',
  GAME_ENDED: 'game:ended',

  // Client → Server
  GAME_SYNC: 'game:sync',
  LOBBY_READY: 'lobby:ready',
  SAFETY_REQUEST_PAUSE: 'safety:requestPause',
  LOCATION_UPDATE: 'location:update',
} as const;

export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];

// ─── Server → Client Payloads ─────────────────────────────────────────────────

export interface GameStatePayload {
  game: GameStateSummary;
  players: PlayerSummary[];
  currentRound: GameRound | null;
  stateVersion: number;
  serverTime: string;
}

export interface LobbyUpdatedPayload {
  players: PlayerSummary[];
  gameConfig: {
    name: string;
    maxPlayers: number;
    totalRounds: number;
    totalMatchDurationSeconds: number;
    requireAllReady: boolean;
  };
  stateVersion: number;
  serverTime: string;
}

export interface GameStartedPayload {
  endsAt: string;
  currentRound: GameRound;
  roundEndsAt: string;
  stateVersion: number;
  serverTime: string;
}

export interface GamePausedPayload {
  pausedAt: string;
  stateVersion: number;
  serverTime: string;
}

export interface GameResumedPayload {
  resumedAt: string;
  endsAt: string;
  roundEndsAt: string;
  stateVersion: number;
  serverTime: string;
}

export interface RoundAnnouncePayload {
  currentRound: number;
  nextRound: GameRound;
  transitionAt: string; // ISO timestamp when next round activates
  stateVersion: number;
  serverTime: string;
}

export interface RoundStartedPayload {
  roundNumber: number;
  round: GameRound;
  roundEndsAt: string;
  endsAt: string;
  stateVersion: number;
  serverTime: string;
}

export interface PlayersCountPayload {
  runnersLeft: number;
  totalRunners: number;
  stateVersion: number;
  serverTime: string;
}

export interface SeekersSnapshotPayload {
  runners: RunnerSnapshot[];
  capturedAt: string;
  stateVersion: number;
  serverTime: string;
}

export interface RunnerDangerPayload {
  danger: DangerState;
  stateVersion: number;
  serverTime: string;
}

export interface ViolationStartedPayload {
  violation: ViolationInfo;
  stateVersion: number;
  serverTime: string;
}

export interface ViolationClearedPayload {
  violationId: string;
  stateVersion: number;
  serverTime: string;
}

export interface PlayerEliminatedPayload {
  userId: string;
  displayName: string;
  status: PlayerStatus;
  reason: string;
  runnersLeft: number;
  stateVersion: number;
  serverTime: string;
}

export interface CatchPendingPayload {
  report: CatchReportPublic;
  stateVersion: number;
  serverTime: string;
}

export interface CatchResolvedPayload {
  report: CatchReportPublic;
  stateVersion: number;
  serverTime: string;
}

export interface HostAlertPayload {
  type: 'LOCATION_UNKNOWN' | 'SEEKER_ELIMINATED' | 'CATCH_DISPUTE' | 'PAUSE_REQUESTED' | 'DISQUALIFICATION';
  message: string;
  userId?: string;
  stateVersion: number;
  serverTime: string;
}

export interface GameEndedPayload {
  result: GameResult;
  stateVersion: number;
  serverTime: string;
}

// ─── Client → Server Payloads ─────────────────────────────────────────────────

export interface GameSyncPayload {
  knownStateVersion: number;
}

export interface LobbyReadyPayload {
  isReady: boolean;
}

// ─── Handshake Auth ──────────────────────────────────────────────────────────

export interface SocketHandshakeAuth {
  token: string; // JWT access token
}

// ─── Acknowledgement types ────────────────────────────────────────────────────

export interface AckSuccess<T = void> {
  ok: true;
  data?: T;
}

export interface AckError {
  ok: false;
  error: { code: string; message: string };
}

export type Ack<T = void> = AckSuccess<T> | AckError;
