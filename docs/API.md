# API Reference — Run Alive

Base URL: `https://your-server.example.com/api/v1`
All requests/responses: `Content-Type: application/json`
Errors: `{ "error": { "code": "ERROR_CODE", "message": "Human readable message" } }`

## Authentication

Protected endpoints require: `Authorization: Bearer <accessToken>`

---

## Auth

### POST /auth/register
Register a new account.

**Body:** `{ email, password, displayName }`

**Response 201:**
```json
{ "accessToken": "...", "refreshToken": "...", "user": { "id", "email", "displayName", "avatarUrl" } }
```

**Errors:** `409 EMAIL_TAKEN`, `400 VALIDATION_ERROR`

---

### POST /auth/login
**Body:** `{ email, password }`
**Response 200:** Same as register
**Errors:** `401 INVALID_CREDENTIALS` (uniform message)

---

### POST /auth/refresh
**Body:** `{ refreshToken }`
**Response 200:** `{ accessToken, refreshToken }`
**Errors:** `401 INVALID_REFRESH_TOKEN`, `401 TOKEN_REUSE_DETECTED`

---

### POST /auth/logout
**Auth required.** Body: `{ refreshToken }`
**Response 204**

---

### POST /auth/forgot-password
**Body:** `{ email }`
**Response 200:** `{ message: "If that email exists, a reset link was sent." }`
Always returns 200 — no email enumeration.

---

### POST /auth/reset-password
**Body:** `{ token, password }`
**Response 200:** `{ message: "Password updated." }`
**Errors:** `400 INVALID_TOKEN`, `400 TOKEN_EXPIRED`

---

## Me

### GET /me
**Auth required.**
Returns current user profile.

---

### PATCH /me
**Auth required.** Body: `{ displayName? }`
Returns updated profile.

---

### POST /me/avatar
**Auth required.** `multipart/form-data` with `avatar` field.
Max 2 MB. Types: `image/jpeg`, `image/png`, `image/webp`.
Returns `{ avatarUrl }`.

---

### GET /me/history
**Auth required.**
Returns array of `ParticipationRecord`.

---

### GET /me/stats
**Auth required.**
Returns aggregate stats: games played, wins, losses, total catches, etc.

---

### DELETE /me
**Auth required.**
Anonymizes account (display name → "Deleted User", email removed). Deletes all location data. Returns 204.

---

## Games

### POST /games
**Auth required.**
**Body:** `{ config: GameConfig, rounds: GameRound[] }`
Returns created game with room code.

---

### GET /games/by-code/:code
**Auth required.**
Returns game summary (status, name, player count). Returns 404 if not found or finished.

---

### GET /games/:id
**Auth required. Must be a member.**
Returns full game state snapshot.

---

### PATCH /games/:id/config
**Auth required. Host only. Game must be LOBBY.**
**Body:** Partial `GameConfig`
Returns updated game.

---

### PUT /games/:id/rounds
**Auth required. Host only. Game must be LOBBY.**
**Body:** `{ rounds: GameRound[] }`
Replaces all rounds.

---

### POST /games/:id/join
**Auth required. Game must be LOBBY.**
**Body:** `{ roomCode, locationConsentAt }`
Idempotent — re-joining returns existing membership.
**Errors:** `400 GAME_FULL`, `400 ALREADY_STARTED`, `403 KICKED`

---

### POST /games/:id/leave
**Auth required. Must be a member. Game must be LOBBY.**
Removes membership. Returns 204.

---

### POST /games/:id/ready
**Auth required. Must be a member.**
**Body:** `{ isReady: boolean }`
Toggles ready state.

---

### POST /games/:id/teams/assign
**Auth required. Host only. LOBBY.**
**Body:** `{ userId, role: "RUNNER" | "SEEKER" }`

---

### POST /games/:id/teams/randomize
**Auth required. Host only. LOBBY.**
**Body:** `{ seekerCount? | seekerRatio? }`

---

### POST /games/:id/kick
**Auth required. Host only. LOBBY.**
**Body:** `{ userId }`

---

### POST /games/:id/start
**Auth required. Host only. LOBBY.**
Validates: ≥1 seeker, ≥1 runner, valid circles, all ready (if `requireAllReady`).
Transitions: LOBBY → STARTING (10 s) → ACTIVE.

---

### POST /games/:id/pause
**Auth required. Host only. ACTIVE.**
Transitions: ACTIVE → PAUSED. Shifts all deadlines.

---

### POST /games/:id/resume
**Auth required. Host only. PAUSED.**
Transitions: PAUSED → ACTIVE. Shifts all deadlines by paused duration.

---

### POST /games/:id/end
**Auth required. Host only. ACTIVE or PAUSED.**
Requires confirmation (`{ confirm: true }`).
Transitions to FINISHED. Writes results.

---

### POST /games/:id/request-pause
**Auth required. Any active member.**
Sends `host:alert` to host. Does not pause the game.

---

## Gameplay

### POST /games/:id/location
**Auth required. Active player. Game ACTIVE.**
**Body:** `{ fixes: LocationFix[] }` (1–5 fixes)
Returns `{ ok: true, nextPingHintSec?: number }`.
Rate-limited: minimum 3 s between accepted fixes per player.

---

### POST /games/:id/catches
**Auth required. Active SEEKER.**
**Body:** `{ runnerId, idempotencyKey }`
Idempotent — duplicate key returns existing report.
**Errors:** `400 GAME_PAUSED`, `404 RUNNER_NOT_FOUND`, `409 CATCH_ALREADY_PENDING`

---

### POST /games/:id/catches/:cid/confirm
**Auth required. Runner (self) or Host, depending on `catchVerificationMode`.**
Confirms the catch. Runner is eliminated.

---

### POST /games/:id/catches/:cid/reject
**Auth required. Runner (self) or Host.**
Rejects the catch report.

---

### POST /games/:id/catches/:cid/dispute
**Auth required. Runner (self).** Moves to DISPUTED for host resolution.

---

### POST /games/:id/catches/:cid/reverse
**Auth required. Host. Game not FINISHED.**
Reverses a confirmed catch. Runner returns to ACTIVE.

---

### GET /games/:id/disqualifications
**Auth required. Host only.**
Lists all disqualification records with reasons.

---

### POST /games/:id/disqualifications/:did/reverse
**Auth required. Host only. Game not FINISHED.**
Reverses a disqualification. Player returns to ACTIVE.

---

### GET /games/:id/host-overview
**Auth required. Host only.**
Returns: player list with connection status and last-fix age (never coordinates), pending catches, open violations, current round info.

---

### GET /games/:id/results
**Auth required. Must be a member. Game FINISHED.**
Returns `GameResult`.

---

## Socket.IO Events

### Handshake Authentication
```js
const socket = io(WS_URL, {
  auth: { token: accessToken }
});
```

### Server → Client Events

| Event | Payload type | Sent to |
|---|---|---|
| `game:state` | `GameStatePayload` | Joining player (snapshot) |
| `lobby:updated` | `LobbyUpdatedPayload` | `game:{id}` room |
| `game:started` | `GameStartedPayload` | `game:{id}` room |
| `game:paused` | `GamePausedPayload` | `game:{id}` room |
| `game:resumed` | `GameResumedPayload` | `game:{id}` room |
| `round:announce` | `RoundAnnouncePayload` | `game:{id}` room |
| `round:started` | `RoundStartedPayload` | `game:{id}` room |
| `players:count` | `PlayersCountPayload` | `game:{id}` room |
| `seekers:snapshot` | `SeekersSnapshotPayload` | `game:{id}:seekers` only |
| `runner:danger` | `RunnerDangerPayload` | `user:{id}` (that runner only) |
| `violation:started` | `ViolationStartedPayload` | `user:{id}` (that player only) |
| `violation:cleared` | `ViolationClearedPayload` | `user:{id}` |
| `player:eliminated` | `PlayerEliminatedPayload` | `game:{id}` room |
| `catch:pending` | `CatchPendingPayload` | Runner, seeker, host |
| `catch:resolved` | `CatchResolvedPayload` | Runner, seeker, host |
| `host:alert` | `HostAlertPayload` | `game:{id}:host` |
| `game:ended` | `GameEndedPayload` | `game:{id}` room |

### Client → Server Events

| Event | Payload | Response |
|---|---|---|
| `game:sync` | `{ knownStateVersion, gameId }` | Ack + triggers `game:state` emission |
| `lobby:ready` | `{ isReady }` | Ack |
| `safety:requestPause` | `{}` | Ack (sends host:alert) |
| `location:update` | `LocationBatch` | Ack |

All client events use acknowledgements: `{ ok: true }` or `{ ok: false, error: { code, message } }`.

### Every event includes
```json
{
  "stateVersion": 42,
  "serverTime": "2025-06-01T12:00:00.000Z"
}
```

Clients:
- Ignore events with `stateVersion` older than their current version
- Emit `game:sync` if they detect a gap in state versions
