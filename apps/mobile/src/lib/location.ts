// apps/mobile/src/lib/location.ts
// Mobile Location Engine: foreground watcher + background TaskManager task with buffered batching.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from '@/lib/api';
import type { LocationFix } from '@runalive/shared';

const BACKGROUND_LOCATION_TASK = 'RUNALIVE_BACKGROUND_LOCATION';

let activeGameId: string | null = null;
let locationBuffer: LocationFix[] = [];
let lastFlushTime = 0;
const MIN_FLUSH_INTERVAL_MS = 3000; // Rate limit: flush at most every 3 seconds

/**
 * Flush accumulated location buffer to backend API.
 */
export async function flushLocationBuffer(): Promise<void> {
  if (!activeGameId || locationBuffer.length === 0) return;

  const now = Date.now();
  if (now - lastFlushTime < MIN_FLUSH_INTERVAL_MS) return;

  const fixesToSend = [...locationBuffer.slice(-5)]; // Max 5 fixes per batch
  locationBuffer = [];
  lastFlushTime = now;

  try {
    await api.post(`/games/${activeGameId}/location`, { fixes: fixesToSend });
  } catch {
    // Re-buffer up to 5 points on transient network failure
    locationBuffer = [...fixesToSend.slice(-3), ...locationBuffer].slice(-10);
  }
}

/**
 * Ingest fix from either foreground subscription or background task.
 */
function handleLocationFix(loc: Location.LocationObject): void {
  const fix: LocationFix = {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    accuracyM: loc.coords.accuracy ?? 20,
    clientTs: loc.timestamp,
    mocked: (loc as any).mocked ?? false,
  };

  locationBuffer.push(fix);
  if (locationBuffer.length >= 3) {
    void flushLocationBuffer();
  }
}

// ── Background Task Definition ───────────────────────────────────────────────
if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      for (const loc of locations) {
        handleLocationFix(loc);
      }
      await flushLocationBuffer();
    }
  });
}

let foregroundSubscription: Location.LocationSubscription | null = null;

/**
 * Start active match tracking (foreground + background).
 */
export async function startTracking(gameId: string): Promise<boolean> {
  activeGameId = gameId;

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    return false;
  }

  // Request background permission
  try {
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus === 'granted') {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (!hasStarted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5, // Every 5 meters
          timeInterval: 3000, // Or every 3 seconds
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'RUN ALIVE Match Active',
            notificationBody: 'Tracking position for campus zone boundaries and safety.',
            notificationColor: '#FFDD00',
          },
        });
      }
    }
  } catch {
    // Background permissions rejected or unavailable — continue with foreground
  }

  // Start foreground watcher
  if (!foregroundSubscription) {
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3,
        timeInterval: 2000,
      },
      (loc) => {
        handleLocationFix(loc);
      }
    );
  }

  return true;
}

/**
 * Stop tracking when game ends or player leaves.
 */
export async function stopTracking(): Promise<void> {
  activeGameId = null;
  locationBuffer = [];

  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // Ignored
  }
}
