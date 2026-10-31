# Danger Meter — Algorithm & Limitations

## Purpose

The danger meter tells each **runner** how close the nearest seeker is, expressed as a band (SAFE / LOW / MEDIUM / HIGH / CRITICAL) and a 0–100 level. It does **not** reveal seeker coordinates or exact distances.

## Inputs

For each active runner, after any location update from a seeker (or on a slow keepalive tick):

1. The runner's latest GPS fix (`lat`, `lon`, `accuracyM`) — if older than 60 s, runner is excluded
2. All active seekers' latest GPS fixes — seekers with stale fixes (>60 s) are excluded

## Computation Steps

### 1. Effective Distance to Each Seeker

```
accRunner_capped = min(runner.accuracyM, 40)
accSeeker_capped = min(seeker.accuracyM, 40)
rawDistance = haversine(runner.location, seeker.location)  -- via PostGIS ST_Distance
effectiveDistance = max(0, rawDistance - 0.5 * (accRunner_capped + accSeeker_capped))
```

The accuracy subtraction means: if the runner and seeker are both accurate to ±20 m, we treat a raw distance of 40 m as effectively 0 m. This is conservative (safety-first for seekers).

### 2. Find Nearest Seeker

```
minEffectiveDistance = min(effectiveDistance) over all active seekers with fresh fixes
```

If no seeker has a fresh fix: emit `band = UNKNOWN`.

### 3. Exponential Moving Average (EMA)

To damp GPS noise (a single bad fix shouldn't cause a SAFE → CRITICAL spike):

```
alpha = 0.4
smoothedDistance = alpha * minEffectiveDistance + (1 - alpha) * previousSmoothedDistance
```

On first fix (no previous state): `smoothedDistance = minEffectiveDistance`.

The smoothed distance and the current band are stored in `danger_state`.

### 4. Band Classification with Hysteresis

Default thresholds (configurable constants in server code):

| Band | Threshold (smoothed distance) |
|---|---|
| CRITICAL | < 30 m |
| HIGH | 30–75 m |
| MEDIUM | 75–150 m |
| LOW | 150–300 m |
| SAFE | > 300 m |

**Hysteresis rule** (prevents oscillation at boundaries):
- Move to a **higher danger band** immediately when the threshold is crossed
- Move to a **lower danger band** only when `smoothedDistance > threshold * 1.20` (20% beyond)

Example: A runner in HIGH (30–75 m) drops to MEDIUM only when `smoothedDistance > 75 * 1.20 = 90 m`.

### 5. Level (0–100)

Within each band, compute a linear level:

```
level = clamp(100 - (smoothedDistance / 300 * 100), 0, 100)
```

This is sent along with the band as a continuous indicator.

### 6. Emit

Send `{ band, level }` to that runner via `runner:danger`:
- When the band changes
- On a slow keepalive (every ~30 s) even if no change, so the client knows the server is alive

**Never** send seeker coordinates, raw distance, or seeker identity.

## Limitations

1. **GPS Error**: Consumer GPS is typically ±5–20 m outdoors and can be ±50–100 m near buildings or indoors. Danger readings may be inaccurate by that margin.

2. **Stale Data**: If a seeker's phone loses GPS or goes offline, their last fix remains in `player_latest_locations` until it ages out (>60 s). During that window, the danger reading reflects old positions. If all seeker fixes are stale, band becomes UNKNOWN.

3. **EMA Lag**: The smoothing introduces a lag. A seeker who sprints toward a runner may not cause an immediate CRITICAL reading — the band may transition HIGH → CRITICAL over 2–3 update cycles (~20–30 s). This is intentional.

4. **Coarse Proximity Leakage**: Even though we send only a band, observing band transitions over time lets a sophisticated runner infer roughly how fast a seeker is approaching. This is accepted as an unavoidable consequence of any proximity warning system.

5. **Single Nearest Seeker**: The danger meter tracks only the nearest seeker. If two seekers approach from different directions, only the closer one affects the reading.

6. **No Direction Information**: The band tells you how close, not which direction. This is intentional — the game is more fun when runners can't pinpoint seeker positions.

7. **UNKNOWN ≠ SAFE**: When the band is UNKNOWN (no fresh seeker data), the app displays it differently from SAFE. A runner should not assume they are safe when band is UNKNOWN — seekers may simply have lost GPS.
