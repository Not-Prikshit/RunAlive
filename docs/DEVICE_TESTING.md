# Device Testing Guide

## Building Dev Builds

Run Alive requires a **development build** (not Expo Go) because it uses:
- `expo-location` with `startLocationUpdatesAsync` (background task)
- `expo-task-manager`
- `react-native-maps`
- Custom native modules

### Option A: Local Prebuild (Android — Windows compatible)

```bash
# Prerequisites: Android Studio, Android SDK, Java 17+
cd apps/mobile
pnpm prebuild:android   # runs: expo prebuild --platform android

# Open in Android Studio
open android/         # or: start android/

# Or build from CLI (requires connected device or running emulator)
pnpm android          # runs: expo run:android
```

### Option B: EAS Build (Recommended — works on Windows/Linux for Android AND iOS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Initialize project (generates projectId)
cd apps/mobile
eas init

# Build development client for Android
eas build --platform android --profile development

# Build development client for iOS (requires Apple Developer account)
eas build --platform ios --profile development
```

Configure `eas.json` in `apps/mobile/`:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "http://YOUR_LAN_IP:3000/api/v1" }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

## Installing on Devices

### Android
1. Enable Developer Mode and USB Debugging
2. Connect via USB or use wireless debugging
3. `eas build --platform android --profile development --local` (local) or download the APK from EAS dashboard
4. Install: `adb install runalive-development.apk`

### iOS
1. Requires an Apple Developer account (\$99/year)
2. Add device UDIDs to your provisioning profile or use Internal Distribution
3. Download the IPA from EAS dashboard
4. Install via TestFlight (Enterprise) or direct install with Apple Configurator 2

## Test Script — Multi-Phone Game

**Minimum: 3 devices (1 host/seeker, 2 runners)**

### Pre-game Setup
1. All devices: install dev build, ensure location permission is "Always Allow"
2. Disable battery optimization on Android (Settings → Battery → App → Unrestricted)
3. Ensure all devices can reach the server (same network or VPN)

### Test Sequence

| Step | Actor | Expected result |
|---|---|---|
| 1. Create game | Device A (host) | Room code displayed, lobby opens |
| 2. Join by code | Device B, C | All appear in lobby |
| 3. Assign teams | Host | B=Seeker, C=Runner |
| 4. Mark ready | All | All-ready state confirmed |
| 5. Start game | Host | 10-second countdown, then ACTIVE |
| 6. Walk into perimeter | All | Map shows circle, runner on their own map |
| 7. Walk outside perimeter | Runner C | Violation warning within 3 fixes |
| 8. Return inside | Runner C | Violation cleared |
| 9. Seeker approaches runner | Seeker B, Runner C | Runner sees danger band increase |
| 10. Seeker reports catch | Seeker B | Runner C receives confirmation prompt |
| 11. Runner confirms catch | Runner C | Runner eliminated, RUNNERS LEFT decrements |
| 12. End game | Host | Results screen shown |

### Background Location Tests

These tests require real devices with screens locked.

1. **Screen locked 10+ minutes**: Lock screen immediately after joining. Verify location updates still appear on host console (age of last fix < 30 s).
2. **App backgrounded**: Press home button. Play continues. Verify location still updating.
3. **Airplane mode and reconnect**: Enable airplane mode for 60 s, then disable. Verify:
   - Player shown as LOCATION_UNKNOWN after `location_loss_threshold_seconds`
   - Player returns to ACTIVE after reconnect and valid fix
   - No disqualification unless `auto_eliminate_on_location_loss` is enabled
4. **Battery saver mode**: Enable battery saver. Verify location updates (may slow down).
5. **Android OEM battery settings**: On Huawei/Xiaomi/Samsung, verify app is not killed. Prompt user to whitelist app.
6. **iOS Always vs While Using**: Test with "While Using" permission → verify foreground-only warning shown, `expo-keep-awake` active.
7. **Force-quit (iOS)**: Force-quit the app while in game. Verify location stops updating (iOS terminates background tasks on force-quit). Document this limitation to players.

### Boundary and Danger Tests (walking)

1. Stand 100 m outside perimeter → receive violation warning
2. Wait grace period → disqualification (if `violation_grace_seconds` elapses)
3. Return inside before deadline → CLEARED
4. Seeker walks toward runner (both have GPS lock) → observe danger band progression: SAFE → LOW → MEDIUM → HIGH → CRITICAL
5. Seeker stops → band stabilizes, then drops with hysteresis (20% past threshold)

## Known Device Limitations to Document for Players

1. **iPhone force-quit**: If you force-quit Run Alive on iOS, background location stops immediately. The app cannot track you until you reopen it.
2. **Android battery managers**: Some Android manufacturers (Huawei, Xiaomi, OnePlus, Samsung) aggressively kill background apps. Go to Settings → Battery → Run Alive → set to "No restrictions" or "Unrestricted".
3. **Indoor GPS**: GPS is unreliable indoors. Avoid playing inside buildings.
4. **GPS accuracy near buildings**: Multipath reflections can cause 20–50 m errors near tall buildings.
5. **Location permission on iOS**: Must grant "Always" permission for background tracking. "While Using" means tracking stops when you lock your phone.
