# Environment Variables Reference

## Server (`apps/server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | HTTP server port |
| `LOG_LEVEL` | No | `info` | `trace`, `debug`, `info`, `warn`, `error` |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (main) |
| `DATABASE_URL_TEST` | No | — | PostgreSQL connection string (tests) |
| `JWT_ACCESS_SECRET` | **Yes** | — | ≥32 chars. `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | **Yes** | — | ≥32 chars. Different from access secret |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token TTL (jose format) |
| `JWT_REFRESH_EXPIRES_DAYS` | No | `30` | Refresh token TTL in days |
| `CORS_ORIGINS` | No | `http://localhost:8081` | Comma-separated allowed origins |
| `SMTP_HOST` | No | `localhost` | SMTP server host |
| `SMTP_PORT` | No | `1025` | SMTP server port (1025 = Mailpit dev) |
| `SMTP_SECURE` | No | `false` | Use TLS (`true` for production) |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `EMAIL_FROM` | No | `noreply@runalive.app` | From address for outgoing email |
| `STORAGE_ADAPTER` | No | `local` | `local` or `s3` |
| `LOCAL_UPLOAD_DIR` | No | `./uploads` | Local avatar storage path |
| `S3_ENDPOINT` | S3 only | — | S3-compatible endpoint URL |
| `S3_REGION` | S3 only | — | AWS region |
| `S3_BUCKET` | S3 only | — | S3 bucket name |
| `S3_ACCESS_KEY` | S3 only | — | S3 access key ID |
| `S3_SECRET_KEY` | S3 only | — | S3 secret access key |
| `S3_PUBLIC_URL` | S3 only | — | Public CDN URL for assets |
| `APP_URL` | No | `http://localhost:3000` | Server's own URL (for email links) |
| `DEEP_LINK_SCHEME` | No | `runalive` | Mobile deep link scheme |

## Mobile (`apps/mobile/.env`)

All mobile environment variables must be prefixed `EXPO_PUBLIC_` to be exposed to the app bundle.

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | **Yes** | Full URL to server API, e.g. `http://192.168.1.10:3000/api/v1`. Use LAN IP on real devices — never `localhost`. |
| `EXPO_PUBLIC_WS_URL` | **Yes** | WebSocket server URL, e.g. `http://192.168.1.10:3000` |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | **Yes (Android)** | Google Maps SDK key. [Get one here](https://console.cloud.google.com/). Enable: Maps SDK for Android, Maps SDK for iOS. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Push notifs | EAS project ID from `eas init`. Required for Expo Push Notifications. |

> [!CAUTION]
> All `EXPO_PUBLIC_*` variables are baked into the app bundle at build time and are visible to anyone who extracts the APK/IPA. **Never put secrets in mobile env vars.** API keys for Google Maps are acceptable (they are rate-limited and tied to the app package ID).

## Third-Party Setup

### Google Maps API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select an existing one
3. Enable **Maps SDK for Android** and **Maps SDK for iOS**
4. Create a credential (API key)
5. Restrict the key to your Android package (`app.runalive.mobile`) and iOS bundle
6. Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `apps/mobile/.env`

### EAS Build (for dev builds and push notifications)
1. Install EAS CLI: `npm install -g eas-cli`
2. Log in: `eas login`
3. Initialize: `eas init` in `apps/mobile/`
4. Copy the project ID to `EXPO_PUBLIC_EAS_PROJECT_ID` and `app.json > extra.eas.projectId`
5. Configure push notifications: `eas credentials`

### SMTP / Email
- **Development**: Mailpit is included in `docker-compose.yml`. Start with `docker compose up -d mailpit`. Web UI at [http://localhost:8025](http://localhost:8025).
- **Production**: Use SendGrid, AWS SES, Postmark, or any SMTP provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`.

### S3-Compatible Storage (avatars)
- **Development**: Uses local disk at `LOCAL_UPLOAD_DIR` (default `./uploads`).
- **Production**: Set `STORAGE_ADAPTER=s3` and all `S3_*` variables. Compatible with AWS S3, Cloudflare R2, Backblaze B2, MinIO.
