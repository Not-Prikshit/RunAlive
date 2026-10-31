# Security — Run Alive

## Authentication & Authorization

- Passwords hashed with **argon2id** (memory: 64 MB, parallelism: 4, iterations: 3)
- Short-lived **JWT access tokens** (15 min) + rotating **refresh tokens** (30 days)
- Refresh tokens stored hashed in the database; family-based reuse detection (token theft detection)
- Tokens stored on device in **expo-secure-store** (iOS Keychain / Android Keystore)
- Uniform login failure messages — no email enumeration possible
- Forgot-password always returns the same response regardless of whether the email exists
- Password reset tokens: single-use, hashed in DB, 30-minute expiry
- All auth endpoints rate-limited
- Every REST route and socket event validates authentication and authorization server-side

## Transport

- HTTPS required in production (use a reverse proxy like nginx or Caddy)
- CORS configured to explicit allow-list only
- Helmet sets secure HTTP headers (HSTS, CSP, X-Frame-Options, etc.)
- Socket.IO connections authenticated on handshake

## Data Isolation

- Every game API endpoint verifies the requesting user is a member of that game
- Non-members get 404 (not 403) to prevent leaking game existence
- Location data is never broadcast; built per-recipient with role checks
- Seekers receive obfuscated runner positions; runners receive nothing about seekers
- Host-only endpoints (`/host-overview`, disqualification list) verified against `games.host_user_id`
- Socket rooms (`game:{id}:seekers`, `game:{id}:runners`, `game:{id}:host`) are role-gated on join

## Database

- Parameterized SQL everywhere — no string interpolation in queries
- PostGIS for spatial operations (no custom haversine that could be wrong)
- Transactions with `SELECT ... FOR UPDATE` for all state changes
- Audit log (`game_events`) for every significant action

## Mobile App

- No secrets in the app bundle. Only `EXPO_PUBLIC_*` env vars (non-secret keys)
- Tokens never stored in AsyncStorage — only expo-secure-store
- Location consent recorded before any collection starts
- No coordinates in error messages, UI, or analytics

## Input Validation

- All API inputs validated with Zod schemas on the server
- All coordinates validated (lat ∈ [-90,90], lon ∈ [-180,180], finite)
- File uploads: type checked, size capped at 2 MB, re-encoded with sharp to strip EXIF

## Rate Limiting

| Endpoint class | Limit |
|---|---|
| Auth (register, login, forgot-password) | 20 req / 15 min per IP |
| Join by code | 10 req / min per IP |
| Location upload | 5 req / 10 s per user |
| General API | 200 req / min per IP |

## Realistic Limitations (Documented Honestly)

### GPS Spoofing
- **Android**: The `mocked` flag on location fixes is checked and flagged `suspect` in the DB. However, a rooted device or mock-location app can produce unflagged fixes. This is best-effort detection only.
- **iOS**: There is no `mocked` flag equivalent in the iOS location API. GPS spoofing on iOS is harder but not impossible (requires a connected Mac running Xcode or a jailbroken device). We have no detection.
- **Mitigation**: Speed plausibility check (>12 m/s sustained → flagged suspect). Host can review and disqualify manually.

### No Device Attestation
- We do not use Play Integrity API (Android) or DeviceCheck/App Attest (iOS). A modified app client could send arbitrary data.
- The server validates all state transitions and never trusts client-reported game state.

### GPS Accuracy
- Consumer GPS accuracy is typically 3–10 m outdoors, 10–50 m near buildings, and highly variable indoors.
- Boundary checks use accuracy-aware thresholds (`distance > radius + min(accuracyM, 25)`).
- Repeated boundary band changes on the danger meter can leak coarse proximity even without sending coordinates.

### Background Execution
- iOS terminates background tasks after ~30 s if the app is force-quit. A force-quit player's location will go stale.
- Android OEM battery managers (Huawei, Samsung, Xiaomi, OnePlus, etc.) may kill background services regardless of settings. Players are prompted to disable battery optimization.
- Neither platform guarantees location updates every N seconds in all conditions.

### Session Theft
- If a refresh token is stolen, our family-based reuse detection will invalidate the family on next use — but the window between theft and detection is up to 30 days if the victim does not use the app.
- Mitigation: Users should log out on shared devices.

### Network Replay
- Location fixes include `clientTs`. Fixes older than 60 seconds are rejected. Fixes in the future (beyond clock skew) are rejected. This limits replay window.
- The server uses `min(clientTs, receivedAt)` to resist clock manipulation.
