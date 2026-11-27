// apps/server/src/multiplayer/schema/GameRoomState.ts
import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class PlayerLocationState extends Schema {
  @type('number') latitude: number = 0;
  @type('number') longitude: number = 0;
  @type('number') accuracy: number = 0;
  @type('number') heading: number = 0;
  @type('number') speed: number = 0;
  @type('number') timestamp: number = 0;
  @type('string') freshness: string = 'OFFLINE'; // LIVE | UPDATING | STALE | OFFLINE
  @type('number') lastUpdatedAt: number = 0;
}

export class DangerState extends Schema {
  @type('string') band: string = 'SAFE'; // SAFE | ELEVATED | WARNING | DANGER | CRITICAL | CAUGHT
  @type('number') effectiveDistance: number = 9999;
  @type('string') nearestOpponentId: string = '';
  @type('number') pulseFrequencyHz: number = 0.5;
  @type('string') vibrationPattern: string = 'NONE';
  @type('number') updatedAt: number = 0;
}

export class PerimeterState extends Schema {
  @type('number') centerLat: number = 0;
  @type('number') centerLng: number = 0;
  @type('number') currentRadius: number = 500;
  @type('number') targetRadius: number = 500;
  @type('number') shrinkDurationSec: number = 60;
  @type('number') shrinkStartTime: number = 0;
  @type('number') shrinkIntervalSec: number = 300;
  @type('boolean') isShrinking: boolean = false;
}

export class PlayerState extends Schema {
  @type('string') id: string = '';
  @type('string') displayName: string = '';
  @type('string') role: string = 'RUNNER'; // RUNNER (Hider) | SEEKER | HOST
  @type('string') status: string = 'ACTIVE'; // ACTIVE | CAUGHT | DISQUALIFIED | LOCATION_UNKNOWN | LEFT
  @type('boolean') isReady: boolean = false;
  @type('boolean') isConnected: boolean = true;
  @type('boolean') isHost: boolean = false;
  @type(PlayerLocationState) location: PlayerLocationState = new PlayerLocationState();
  @type(DangerState) danger: DangerState = new DangerState();
  @type('number') lastSeenAt: number = Date.now();
}

export class ChatMessageState extends Schema {
  @type('string') id: string = '';
  @type('string') senderId: string = '';
  @type('string') senderName: string = '';
  @type('string') senderRole: string = 'RUNNER';
  @type('string') message: string = '';
  @type('number') timestamp: number = Date.now();
  @type('boolean') isSystem: boolean = false;
  @type('boolean') isAnnouncement: boolean = false;
  @type('string') targetRole: string = 'ALL'; // ALL | SEEKER | RUNNER
}

export class GameRoomState extends Schema {
  @type('string') sessionId: string = '';
  @type('string') joinCode: string = '';
  @type('string') sessionName: string = 'RunAlive Session';
  @type('string') hostId: string = '';
  @type('string') status: string = 'LOBBY'; // WAITING | LOBBY | PLANNING | COUNTDOWN | ACTIVE | PAUSED | FINISHED | CANCELLED
  @type('number') durationMinutes: number = 15;
  @type('number') timeRemainingSec: number = 900;
  @type('number') locationRefreshIntervalSec: number = 10; // Default: 10s (Normal)
  @type('string') locationRefreshTier: string = 'NORMAL'; // EASY (3s) | NORMAL (10s) | HARD (20s) | EXTREME (30s) | CUSTOM
  @type('number') nextLocationBroadcastTime: number = 0;
  @type(PerimeterState) perimeter: PerimeterState = new PerimeterState();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([ChatMessageState]) messages = new ArraySchema<ChatMessageState>();
  @type('string') winner: string = 'NONE'; // NONE | RUNNERS | SEEKERS | DRAW
  @type('number') startedAt: number = 0;
  @type('number') endedAt: number = 0;
}
