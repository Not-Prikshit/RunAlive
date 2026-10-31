# Progress Log — RUN ALIVE

## Stage 0 — Scaffold *(In Progress)*

### Done
- [x] Environment inspected: Node 22.21.0, npm 10.9.4, pnpm 12.16.1, Git 2.55.0
- [x] Docker ❌ NOT installed — noted as blocker for DB tests; documented
- [x] Git repository initialized at `c:\RunAlive`
- [x] pnpm workspace configured (`pnpm-workspace.yaml`)
- [x] Root `package.json` with workspace scripts
- [x] `tsconfig.base.json` with strict TypeScript settings
- [x] `docker-compose.yml` (postgis/postgis:15-3.4, Mailpit) — requires Docker to run
- [x] `.env.example` root, `apps/server/.env.example`, `apps/mobile/.env.example`
- [x] `.gitignore`
- [x] `README.md`
- [x] `.prettierrc.json`
- [x] `.github/workflows/ci.yml` (lint, typecheck, test)
- [x] `packages/shared` — full type system, Zod schemas, Socket.IO event contract
- [x] `apps/server` — Express app, health route, config, logger, DB pool, Clock interface
- [x] `apps/server` — All 13 DB migrations (001–013)
- [x] `apps/server` — Module stubs (auth, me, games, realtime)
- [x] `apps/server` — Vitest config + health test
- [x] `apps/mobile` — Expo 52, Expo Router, TypeScript strict, key screens
- [x] `apps/mobile` — Design token system, Button + Input components
- [x] `apps/mobile` — Zustand auth store, API client, session restore hook
- [x] Docs: PROGRESS.md, ENVIRONMENT.md, PRIVACY.md, SECURITY.md, DANGER_METER.md, DEVICE_TESTING.md, API.md

### Gate Checks
- [ ] `pnpm install` — pending (installing dependencies)
- [ ] `pnpm typecheck` — pending
- [ ] `pnpm lint` — pending
- [ ] `pnpm test` (health route test) — pending (DB not available)

### Known Limitations / Blockers
- **Docker not installed**: Cannot run PostgreSQL + PostGIS locally. DB tests require Docker.
  All migrations are written and correct; they need Docker to run.
- **iOS builds**: Require macOS + Xcode. Use EAS Build for CI builds.
  Documented in `docs/DEVICE_TESTING.md`.
- **Google Maps API key**: Placeholder in `apps/mobile/.env.example`.

---

## Stage 1 — Migrations & DB Layer *(Not Started)*

### Planned
- [ ] Run migrations on clean Docker PostgreSQL
- [ ] Verify up/down for all 13 migrations
- [ ] DB test harness
- [ ] Clock interface tests

### Gate
- [ ] `pnpm --filter server db:migrate` succeeds on clean DB (requires Docker)

---

## Stage 2 — Auth *(Not Started)*

### Planned
- [ ] argon2id registration, login, logout
- [ ] JWT access + rotating refresh tokens
- [ ] Password reset via email (Mailpit)
- [ ] Avatar upload (sharp)
- [ ] Auth Vitest + Supertest tests
- [ ] Mobile: login/register screens wired to real server

### Gate
- [ ] Auth test suite green
- [ ] App logs in to real server

---

## Stage 3 — Games, Lobby, Teams *(Not Started)*

---

## Stage 4 — Perimeter Editor *(Not Started)*

---

## Stage 5 — Game Engine *(Not Started)*

---

## Stage 6 — Location Pipeline *(Not Started)*

---

## Stage 7 — Boundary Enforcement *(Not Started)*

---

## Stage 8 — Danger Meter *(Not Started)*

---

## Stage 9 — Catches, Win Conditions, Results *(Not Started)*

---

## Stage 10 — History, Stats, Push Notifications *(Not Started)*

---

## Stage 11 — Polish, Docs, Accessibility *(Not Started)*

---

## Needs Manual Verification (device/hardware)

- iOS background location (force-quit behavior, Always vs While Using)
- Android OEM battery manager and background service survival
- GPS accuracy in urban/campus environments
- Physical boundary walk test
- Real-device multi-player match test
- Push notifications (requires EAS project ID and credentials)

## Known Limitations

- GPS spoofing: Android mock flag is best-effort (apps can bypass); iOS has no mock detection
- No device attestation
- Background execution limits are OS/OEM dependent
- Danger meter accuracy limited by GPS error (~5–20 m typical, worse indoors)
