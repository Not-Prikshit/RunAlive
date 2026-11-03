# Progress Log — RUN ALIVE

## Stage 0 — Monorepo Scaffold ✅
- [x] Node 22.21.0, npm 10.9.4, pnpm 12.16.1, Git 2.55.0
- [x] Monorepo workspace (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`)
- [x] Strict TypeScript configuration
- [x] `packages/shared`: Enums, Models, Zod schemas, Socket.IO event contract
- [x] `apps/server`: Express, Helmet, CORS, Rate Limiting, Pino Logger, Vitest
- [x] `apps/mobile`: React Native 0.76, Expo 52, Expo Router 4, Design Tokens
- [x] Documentation: `README.md`, `PROGRESS.md`, `API.md`, `SECURITY.md`, `PRIVACY.md`, `DEVICE_TESTING.md`, `DANGER_METER.md`
- **Gate Check:** `pnpm -r typecheck` passes with 0 errors across all workspaces.

---

## Stage 1 — Migrations & DB Layer ✅
- [x] 13 additive, reversible PostgreSQL migrations (001–013: extensions, users, tokens, games, rounds, players, locations, violations, catches, events, jobs, idempotency, results)
- [x] `Clock` interface (`RealClock` & `TestClock`) for time injection in deterministic testing
- [x] Unit tests for `Clock` in `apps/server/src/test/clock.test.ts` (5 tests passing)
- **Gate Check:** Clock unit tests green.

---

## Stage 2 — Authentication Module ✅
- [x] Argon2id password hashing (`memoryCost: 65536, timeCost: 3, parallelism: 4`)
- [x] Timing-attack resistant login verification with uniform error responses
- [x] Short-lived JWT Access Tokens (15m) + Long-lived Rotating Refresh Tokens (30d)
- [x] Refresh token family reuse detection (immediate family-wide revocation on token replay)
- [x] Password reset request with 30m single-use token and email notification
- [x] User `/api/v1/me` profile endpoints (GET, PATCH display name, DELETE soft-delete)
- [x] Mobile auth screens (`login.tsx`, `register.tsx`, `forgot-password.tsx`) connected to API
- [x] Unit and Supertest tests in `apps/server/src/test/auth.test.ts` (18 tests passing)
- **Gate Check:** Auth test suite green (18 tests passing).

---

## Stage 3 — Games, Lobby, Teams ✅
- [x] Cryptographic 6-character room code generator (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
- [x] Game creation with configurable rounds and rules (`POST /api/v1/games`)
- [x] Public lobby preview by room code (`GET /api/v1/games/by-code/:code`)
- [x] Player join with required location & safety consent (`POST /api/v1/games/join`)
- [x] Player ready toggle (`POST /api/v1/games/:id/ready`)
- [x] Team assignment: manual role selection & Fisher-Yates random shuffle (`POST /api/v1/games/:id/teams/assign`, `/randomize`)
- [x] Host player kick with self-kick protection (`POST /api/v1/games/:id/kick`)
- [x] Socket.IO server room lifecycle (`game:{id}`, `game:{id}:runners`, `game:{id}:seekers`, `user:{id}`)
- [x] Mobile Lobby screen (`apps/mobile/app/(app)/lobby.tsx`) with realtime live updates
- [x] Unit and Supertest tests in `apps/server/src/test/lobby.test.ts` (8 tests passing)
- **Gate Check:** Lobby test suite green (8 tests passing).

---

## Stage 4 — Circular Perimeter Editor ✅
- [x] Interactive `PerimeterEditor` component (`apps/mobile/src/components/PerimeterEditor.tsx`)
- [x] `react-native-maps` circular zone renderer with high-contrast outdoor styling
- [x] Draggable zone center marker for repositioning campus play boundaries
- [x] Radius stepper adjustments (-50m, -10m, +10m, +50m) from 50m to 5000m
- [x] GPS current location centering via `expo-location`
- [x] Host settings screen (`apps/mobile/app/(app)/host/settings.tsx`) integrating the perimeter editor
- **Gate Check:** Monorepo typecheck passes cleanly with mobile map components.

---

## Stage 5 — Game Engine & Durable Scheduler ✅
- [x] State machine transitions: `LOBBY` -> `ACTIVE` <-> `PAUSED` -> `FINISHED`
- [x] Durable job scheduler backed by PostgreSQL `scheduled_jobs` table
- [x] Polling worker with `SELECT ... FOR UPDATE SKIP LOCKED` concurrency control
- [x] Handlers for `ROUND_ANNOUNCE`, `ROUND_END`, and `MATCH_END`
- [x] Pause & Resume math: shifts deadlines and pending scheduled jobs by elapsed paused duration
- [x] Emergency safety pause callable by any active player
- [x] Match host controls: `/start`, `/pause`, `/resume`, `/end`, `/request-pause`
- [x] Unit and Supertest tests in `apps/server/src/test/engine.test.ts` (7 tests passing)
- **Gate Check:** Engine test suite green (7 tests passing, 41 total tests passing).

---

## Stage 6 — Location Ingestion Pipeline *(In Progress)*
- [ ] Mobile foreground & background location tasks (`expo-task-manager`)
- [ ] Location batch ingestion endpoint (`POST /api/v1/games/:id/location`)
- [ ] Speed plausibility checks (> 12 m/s suspect flag)
- [ ] Obfuscated runner coordinate snapshots on `SHARE_TICK` (grid snapping + jitter)

---

## Stage 7 — Boundary Enforcement *(Pending)*
- [ ] PostGIS `ST_DWithin` boundary distance calculations
- [ ] Grace period countdown timer (default 60s) on perimeter exit
- [ ] Conclusive GPS fix filter (`accuracyM <= 50`)
- [ ] Disqualification handling on expired grace period

---

## Stage 8 — Danger Meter *(Pending)*
- [ ] Seeker-runner distance calculation
- [ ] Exponential Moving Average (EMA, alpha = 0.4) distance smoothing
- [ ] 20% hysteresis band transition logic (Safe, Low, Medium, High, Critical)
- [ ] Individual danger band emission per runner via Socket.IO

---

## Stage 9 — Catch Reporting, Win Conditions, Results *(Pending)*
- [ ] Seeker catch submission with idempotency key
- [ ] Runner confirmation / Host dispute verification
- [ ] Win condition resolution (all runners eliminated -> Seekers win; timer expires -> Runners win)
- [ ] Match summary calculations and results persistence

---

## Stage 10 & 11 — Match History, Stats, Device Testing *(Pending)*
- [ ] Match history screen and user stats
- [ ] Device testing documentation and EAS Build profiles
