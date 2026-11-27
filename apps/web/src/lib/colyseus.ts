// apps/web/src/lib/colyseus.ts
import { Client, Room } from 'colyseus.js';
import { WS_URL } from './api';

function getColyseusEndpoint(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000';

  const base = WS_URL || window.location.origin;
  // Convert http(s) URL to ws(s)
  if (base.startsWith('https://')) {
    return base.replace('https://', 'wss://');
  } else if (base.startsWith('http://')) {
    return base.replace('http://', 'ws://');
  }
  return base;
}

class ColyseusManager {
  private client: Client;
  private currentRoom: Room<any> | null = null;

  constructor() {
    this.client = new Client(getColyseusEndpoint());
  }

  public getClient(): Client {
    return this.client;
  }

  public getCurrentRoom(): Room<any> | null {
    return this.currentRoom;
  }

  public async joinOrCreateGameRoom(options: {
    sessionId?: string;
    gameId?: string;
    joinCode?: string;
    role?: string;
    isHost?: boolean;
    durationMinutes?: number;
    locationRefreshIntervalSec?: number;
    centerLat?: number;
    centerLng?: number;
    radiusMeters?: number;
  }): Promise<Room<any>> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
    const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    let displayName = 'Operative';
    let userId = '';

    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        displayName = u.displayName || u.username || 'Operative';
        userId = u.id || '';
      } catch {}
    }

    // Leave existing room if any
    if (this.currentRoom) {
      try {
        this.currentRoom.leave(false);
      } catch {}
      this.currentRoom = null;
    }

    const joinOptions = {
      ...options,
      token,
      userId,
      displayName,
    };

    const room = await this.client.joinOrCreate('runalive_game', joinOptions);
    this.currentRoom = room;

    room.onLeave((code) => {
      console.log(`[Colyseus] Left room with code: ${code}`);
      if (this.currentRoom === room) {
        this.currentRoom = null;
      }
    });

    return room;
  }

  public leaveCurrentRoom(): void {
    if (this.currentRoom) {
      try {
        this.currentRoom.leave(true);
      } catch {}
      this.currentRoom = null;
    }
  }
}

export const colyseus = new ColyseusManager();
