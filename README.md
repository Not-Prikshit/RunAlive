# RUN ALIVE

A real-time multiplayer location-based outdoor game for college campuses.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose (for local PostgreSQL/PostGIS + Mailpit)
- Expo CLI (installed via npx)
- Android Studio or Xcode for device builds

### Setup

```bash
# Clone and install
git clone <repo>
cd runalive
pnpm install

# Configure environment
cp apps/server/.env.example apps/server/.env
cp apps/mobile/.env.example apps/mobile/.env
# Edit both .env files with your values

# Start infrastructure (requires Docker)
docker compose up -d

# Run database migrations
pnpm --filter server db:migrate

# Seed development data (optional)
pnpm --filter server db:seed

# Start development
pnpm --filter server dev        # Backend on :3000
pnpm --filter mobile start      # Expo dev server
```

### Running Tests

```bash
pnpm test                        # All workspaces
pnpm --filter server test        # Server tests only (requires Docker for DB tests)
pnpm --filter mobile test        # Mobile unit tests only
```

### Building for Devices

See [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md) for full instructions.

```bash
# Android local prebuild
pnpm --filter mobile prebuild:android
# Then open android/ in Android Studio

# iOS (requires macOS + Xcode) or EAS Build
eas build --platform ios --profile development
```

## Documentation

- [Environment Variables](docs/ENVIRONMENT.md)
- [API Reference](docs/API.md)
- [Privacy Policy](docs/PRIVACY.md)
- [Security](docs/SECURITY.md)
- [Danger Meter Algorithm](docs/DANGER_METER.md)
- [Device Testing Guide](docs/DEVICE_TESTING.md)
- [Progress Log](docs/PROGRESS.md)

## Architecture

Monorepo with three packages:

- `apps/server` — Node 20 + Express + Socket.IO + PostgreSQL/PostGIS
- `apps/mobile` — Expo 52 + React Native + TypeScript
- `packages/shared` — Shared TypeScript types, Zod schemas, Socket.IO event contracts

## License

Private — All Rights Reserved
