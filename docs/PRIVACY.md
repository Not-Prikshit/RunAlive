# Privacy Policy — Run Alive

*Last updated: 2026-10-31*

## What Location Data We Collect

When you join an active game, Run Alive collects your device's GPS coordinates while:
- You are in the foreground with the game screen active, or
- The app is in the background (if background location permission is granted)

We collect: latitude, longitude, accuracy (meters), and a client timestamp.

## Why We Collect It

Location data is used solely for game mechanics:
- Checking whether you are inside the active game perimeter
- Computing your approximate danger level (distance to seekers — you never see seeker coordinates, seekers never see your exact coordinates)
- Generating an approximate, grid-snapped snapshot of runner positions shared to seekers every 90 seconds (configurable)

## What We Do NOT Do

- We do not store location history. Only your **latest fix** is kept, per active game.
- We do not log coordinates in application logs or audit events.
- We do not share precise coordinates with other players. Seekers receive obfuscated, grid-snapped positions with added jitter. Runners never receive seeker positions.
- We do not sell or share location data with third parties.

## How Location Data Is Stored

- **`player_latest_locations`**: Your latest GPS fix (one row per player per game). Readable only by server-side game logic. Never exposed via API.
- **`runner_snapshots`**: Grid-snapped, jittered approximate location of runners (one per runner per game). Sent only to seekers in the same game.
- **`danger_state`**: A danger band (SAFE/LOW/MEDIUM/HIGH/CRITICAL) and a 0–100 level number. No coordinates.

## How Location Data Is Deleted

| Event | What is deleted |
|---|---|
| Player leaves a game | That player's `player_latest_locations` row deleted immediately |
| Game ends (FINISHED or CANCELLED) | All `player_latest_locations`, `runner_snapshots`, and `danger_state` rows for the game deleted atomically in the same transaction that ends the game |
| Orphan cleanup | A janitor job runs periodically and purges any location rows that have no corresponding active game, as a safety net |
| Account deletion | All personal data including any residual location rows are deleted or anonymized |

## Your Rights

- You may revoke location permission at any time in your device settings. This prevents future collection but does not affect already-stored data.
- You may request account deletion via `DELETE /api/v1/me`. This anonymizes your account and deletes all location data immediately.
- You may leave a game at any time; your location data is deleted on leave.

## Background Location

Background location collection requires explicit permission ("Always" on iOS, "Allow all the time" on Android). If you deny background permission:
- Location is collected only while the app is in the foreground
- The app uses `expo-keep-awake` to try to keep the screen on during play
- Missing background fixes are treated as "location unknown" — you will not be auto-disqualified for this (unless the host has enabled `auto_eliminate_on_location_loss`)

## Data Retention Summary

| Data type | Retention |
|---|---|
| Precise GPS fixes | Only while game is ACTIVE; deleted at game end |
| Approximate runner positions | Only while game is ACTIVE; deleted at game end |
| Danger band (no coordinates) | Only while game is ACTIVE; deleted at game end |
| Audit events | Retained with game record; no coordinates |
| Game participation (outcome, survival time, catches) | Retained indefinitely for game history; no location data |
| Account data (email, display name) | Until account deletion |
