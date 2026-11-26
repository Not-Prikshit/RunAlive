// apps/web/src/lib/interpolation.ts
// Real-Time Smooth Position Interpolator with Dead Reckoning, GPS Anomaly Filtering & Stale Detection
// Separates authoritative game coordinates from visual rendering coordinates.

export interface VisualPosition {
  lat: number;
  lng: number;
  isInterpolating: boolean;
  isStale: boolean;
  isSuspectJump: boolean;
}

interface PlayerInterpolationTrack {
  id: string;
  // Authoritative coordinate checkpoints
  prevLat: number;
  prevLng: number;
  targetLat: number;
  targetLng: number;
  // Current smoothly rendered position
  currentLat: number;
  currentLng: number;
  // Timestamps (ms)
  prevTs: number;
  targetTs: number;
  // Velocity vectors (deg/ms) for bounded dead reckoning
  velocityLat: number;
  velocityLng: number;
  // Health flags
  isStale: boolean;
  isSuspectJump: boolean;
}

const DEFAULT_PING_INTERVAL_MS = 30_000; // 30s match cycle default
const MAX_EXTRAPOLATION_MS = 2_500; // Cap dead reckoning to 2.5s beyond expected arrival
const STALE_TIMEOUT_MS = 45_000; // After 45s without update, mark as stale
const MAX_PLAUSIBLE_JUMP_M = 150; // Jumps > 150m within 2s are filtered as GPS teleport anomalies

const safeRaf =
  typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb: (t: number) => void) => (setTimeout(() => cb(performance.now()), 16) as unknown as number);

const safeCancelRaf =
  typeof cancelAnimationFrame !== 'undefined'
    ? cancelAnimationFrame
    : (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);

// Haversine distance in meters
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ease out cubic for smooth deceleration towards target GPS ping
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export class PositionInterpolationEngine {
  private tracks = new Map<string, PlayerInterpolationTrack>();
  private animFrameId: number | null = null;
  private listeners = new Set<(positions: Map<string, VisualPosition>) => void>();
  private isRunning = false;
  private lastTick = performance.now();

  /**
   * Ingest an authoritative GPS update for a player.
   */
  public updatePlayer(id: string, lat: number, lng: number, timestampMs = Date.now()): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const existing = this.tracks.get(id);

    if (!existing) {
      // First fix for this player — immediately place at coordinate
      this.tracks.set(id, {
        id,
        prevLat: lat,
        prevLng: lng,
        targetLat: lat,
        targetLng: lng,
        currentLat: lat,
        currentLng: lng,
        prevTs: timestampMs,
        targetTs: timestampMs,
        velocityLat: 0,
        velocityLng: 0,
        isStale: false,
        isSuspectJump: false,
      });
      return;
    }

    const timeDelta = Math.max(100, timestampMs - existing.targetTs);
    const jumpDist = distanceMeters(existing.currentLat, existing.currentLng, lat, lng);

    let isSuspectJump = false;
    // Anomaly filtering: foot chase cannot move > 150m in under 2 seconds
    if (timeDelta < 2000 && jumpDist > MAX_PLAUSIBLE_JUMP_M) {
      isSuspectJump = true;
    }

    // Calculate instantaneous velocity vector
    const velocityLat = (lat - existing.targetLat) / timeDelta;
    const velocityLng = (lng - existing.targetLng) / timeDelta;

    // Shift target into prev and set new target
    existing.prevLat = existing.currentLat;
    existing.prevLng = existing.currentLng;
    existing.targetLat = lat;
    existing.targetLng = lng;
    existing.prevTs = timestampMs - 1; // start interpolation cycle
    existing.targetTs = timestampMs + Math.min(3000, timeDelta); // smooth transition window
    existing.velocityLat = velocityLat;
    existing.velocityLng = velocityLng;
    existing.isStale = false;
    existing.isSuspectJump = isSuspectJump;
  }

  /**
   * Remove a player who left the match or disconnected.
   */
  public removePlayer(id: string): void {
    this.tracks.delete(id);
  }

  /**
   * Clear all tracks on match reset or view exit.
   */
  public clear(): void {
    this.tracks.clear();
  }

  /**
   * Subscribe to 60fps visual position ticks.
   */
  public subscribe(callback: (positions: Map<string, VisualPosition>) => void): () => void {
    this.listeners.add(callback);
    if (!this.isRunning && this.listeners.size > 0) {
      this.start();
    }
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  /**
   * Get instant visual position for a specific player.
   */
  public getPosition(id: string): VisualPosition | null {
    const t = this.tracks.get(id);
    if (!t) return null;
    return {
      lat: t.currentLat,
      lng: t.currentLng,
      isInterpolating: t.currentLat !== t.targetLat || t.currentLng !== t.targetLng,
      isStale: t.isStale,
      isSuspectJump: t.isSuspectJump,
    };
  }

  private start(): void {
    this.isRunning = true;
    this.lastTick = performance.now();
    const loop = (now: number) => {
      this.step(now);
      if (this.isRunning) {
        this.animFrameId = safeRaf(loop);
      }
    };
    this.animFrameId = safeRaf(loop);
  }

  private stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      safeCancelRaf(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private step(now: number): void {
    const wallNow = Date.now();
    const resultMap = new Map<string, VisualPosition>();
    let hasChanges = false;

    this.tracks.forEach((track, id) => {
      // Check stale status
      const timeSinceUpdate = wallNow - track.prevTs;
      track.isStale = timeSinceUpdate > STALE_TIMEOUT_MS;

      const duration = Math.max(200, track.targetTs - track.prevTs);
      const elapsed = wallNow - track.prevTs;

      if (elapsed <= duration) {
        // Active interpolation window
        const linearT = Math.max(0, Math.min(1, elapsed / duration));
        const easedT = easeOutQuad(linearT);

        track.currentLat = track.prevLat + (track.targetLat - track.prevLat) * easedT;
        track.currentLng = track.prevLng + (track.targetLng - track.prevLng) * easedT;
        hasChanges = true;
      } else if (elapsed <= duration + MAX_EXTRAPOLATION_MS && !track.isStale) {
        // Bounded Dead Reckoning (minor extrapolation during network jitter)
        const extraMs = elapsed - duration;
        track.currentLat = track.targetLat + track.velocityLat * extraMs * 0.4;
        track.currentLng = track.targetLng + track.velocityLng * extraMs * 0.4;
        hasChanges = true;
      } else {
        // Interpolation complete and extrapolation budget expired — hold target
        track.currentLat = track.targetLat;
        track.currentLng = track.targetLng;
      }

      resultMap.set(id, {
        lat: track.currentLat,
        lng: track.currentLng,
        isInterpolating: elapsed <= duration,
        isStale: track.isStale,
        isSuspectJump: track.isSuspectJump,
      });
    });

    if (hasChanges || this.tracks.size > 0) {
      this.listeners.forEach((fn) => fn(resultMap));
    }
  }
}

// Global Singleton Engine for RunAlive Game View & Tactical Map
export const globalInterpolationEngine = new PositionInterpolationEngine();
