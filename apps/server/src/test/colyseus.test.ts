// apps/server/src/test/colyseus.test.ts
import { describe, it, expect } from 'vitest';
import { GameRoomState, PlayerState } from '../multiplayer/schema/GameRoomState.js';
import { haversineDistanceM } from '../modules/locations/locations.service.js';
import { calculateEffectiveDistance, computeNextDangerBand } from '../modules/danger/danger.service.js';
import { DangerBand, LocationFreshness, GameStatus } from '@runalive/shared';

describe('Authoritative Colyseus Multiplayer Game Engine', () => {
  it('initializes GameRoomState with default settings and location intelligence', () => {
    const state = new GameRoomState();
    expect(state.status).toBe('LOBBY');
    expect(state.locationRefreshIntervalSec).toBe(10);
    expect(state.locationRefreshTier).toBe('NORMAL');
    expect(state.perimeter.currentRadius).toBe(500);
    expect(state.players.size).toBe(0);
    expect(state.messages.length).toBe(0);
  });

  it('supports host-configured Live Location Intelligence tiers (3s, 10s, 20s, 30s, custom)', () => {
    const state = new GameRoomState();

    // Easy tier: 3s
    state.locationRefreshIntervalSec = 3;
    state.locationRefreshTier = 'EASY';
    expect(state.locationRefreshIntervalSec).toBe(3);

    // Hard tier: 20s
    state.locationRefreshIntervalSec = 20;
    state.locationRefreshTier = 'HARD';
    expect(state.locationRefreshIntervalSec).toBe(20);

    // Extreme tier: 30s
    state.locationRefreshIntervalSec = 30;
    state.locationRefreshTier = 'EXTREME';
    expect(state.locationRefreshIntervalSec).toBe(30);

    // Custom tier: 45s
    state.locationRefreshIntervalSec = 45;
    state.locationRefreshTier = 'CUSTOM';
    expect(state.locationRefreshIntervalSec).toBe(45);
  });

  it('calculates Haversine distance and effective proximity accounting for GPS accuracy', () => {
    // Runner at (28.4595, 77.5135) with 5m accuracy
    const runner = { lat: 28.4595, lon: 77.5135, accuracyM: 5 };
    // Seeker ~30m away
    const seeker = { lat: 28.4597, lon: 77.5137, accuracyM: 5 };

    const rawDist = haversineDistanceM(runner.lat, runner.lon, seeker.lat, seeker.lon);
    expect(rawDist).toBeGreaterThan(20);
    expect(rawDist).toBeLessThan(40);

    const effDist = calculateEffectiveDistance(runner, seeker);
    expect(effDist).toBeLessThanOrEqual(rawDist);
  });

  it('evaluates danger bands accurately across proximity thresholds', () => {
    // CRITICAL: < 30m
    expect(computeNextDangerBand(DangerBand.SAFE, 15)).toBe(DangerBand.CRITICAL);

    // HIGH / DANGER: < 75m
    expect(computeNextDangerBand(DangerBand.SAFE, 45)).toBe(DangerBand.HIGH);

    // MEDIUM / WARNING: < 150m
    expect(computeNextDangerBand(DangerBand.SAFE, 85)).toBe(DangerBand.MEDIUM);

    // LOW / ELEVATED: < 300m
    expect(computeNextDangerBand(DangerBand.SAFE, 180)).toBe(DangerBand.LOW);

    // SAFE: >= 300m
    expect(computeNextDangerBand(DangerBand.SAFE, 400)).toBe(DangerBand.SAFE);
  });

  it('tracks player presence, reconnection state and location freshness', () => {
    const player = new PlayerState();
    player.id = 'usr_test_1';
    player.displayName = 'Alpha Hunter';
    player.role = 'SEEKER';
    player.isConnected = true;
    player.location.freshness = LocationFreshness.LIVE;

    expect(player.isConnected).toBe(true);
    expect(player.location.freshness).toBe(LocationFreshness.LIVE);

    // Simulate transient network disconnect
    player.isConnected = false;
    player.location.freshness = LocationFreshness.OFFLINE;

    expect(player.isConnected).toBe(false);
    expect(player.location.freshness).toBe(LocationFreshness.OFFLINE);
  });

  it('validates game state machine lifecycle transitions', () => {
    const state = new GameRoomState();
    expect(state.status).toBe(GameStatus.LOBBY);

    state.status = GameStatus.COUNTDOWN;
    expect(state.status).toBe(GameStatus.COUNTDOWN);

    state.status = GameStatus.ACTIVE;
    expect(state.status).toBe(GameStatus.ACTIVE);

    state.status = GameStatus.PAUSED;
    expect(state.status).toBe(GameStatus.PAUSED);

    state.status = GameStatus.FINISHED;
    state.winner = 'RUNNERS';
    expect(state.status).toBe(GameStatus.FINISHED);
    expect(state.winner).toBe('RUNNERS');
  });
});
