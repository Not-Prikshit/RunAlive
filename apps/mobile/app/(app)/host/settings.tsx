// apps/mobile/app/(app)/host/settings.tsx
// Game creation screen with interactive map perimeter editor and game rules configuration.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { PerimeterEditor, type PerimeterValue } from '@/components/PerimeterEditor';
import { COLORS, SPACING, RADIUS } from '@/design/tokens';
import { api, ApiError } from '@/lib/api';
import { TeamAssignmentMethod, CatchVerificationMode } from '@runalive/shared';

export default function HostSettingsScreen() {
  const [name, setName] = useState('Campus Hunt');
  const [maxPlayers, setMaxPlayers] = useState('16');
  const [durationMinutes, setDurationMinutes] = useState('20');
  const [hostParticipates, setHostParticipates] = useState(false);
  const [perimeter, setPerimeter] = useState<PerimeterValue>({
    center: { latitude: 37.7749, longitude: -122.4194 },
    radiusM: 350,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGame = async () => {
    setError(null);
    const parsedMaxPlayers = parseInt(maxPlayers, 10);
    const parsedDuration = parseInt(durationMinutes, 10);

    if (!name.trim()) {
      setError('Please provide a game name.');
      return;
    }

    if (isNaN(parsedMaxPlayers) || parsedMaxPlayers < 2 || parsedMaxPlayers > 100) {
      setError('Player count must be between 2 and 100.');
      return;
    }

    if (isNaN(parsedDuration) || parsedDuration < 2 || parsedDuration > 120) {
      setError('Duration must be between 2 and 120 minutes.');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        config: {
          name: name.trim(),
          maxPlayers: parsedMaxPlayers,
          teamAssignmentMethod: TeamAssignmentMethod.RANDOM,
          hostParticipates,
          announceLeadSeconds: 120,
          runnerShareIntervalSeconds: 90,
          violationGraceSeconds: 60,
          catchVerificationMode: CatchVerificationMode.RUNNER_OR_HOST,
          obfuscationGridM: 60,
          locationLossThresholdSeconds: 90,
          autoEliminateOnLocationLoss: false,
          requireAllReady: true,
        },
        rounds: [
          {
            roundNumber: 1,
            durationSeconds: parsedDuration * 60,
            centerLat: perimeter.center.latitude,
            centerLon: perimeter.center.longitude,
            radiusM: perimeter.radiusM,
          },
        ],
      };

      const res = await api.post<{ id: string; roomCode: string }>('/games', payload);
      router.replace({
        pathname: '/(app)/lobby',
        params: { gameId: res.data.id },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Network error. Failed to create game.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Host New Match</Text>
          <Text style={styles.subtitle}>
            Set the campus play boundary and match rules.
          </Text>

          {/* Interactive Map Boundary Editor */}
          <Text style={styles.sectionHeader}>1. Play Perimeter</Text>
          <Text style={styles.helperText}>
            Drag the pin to campus center and adjust zone radius.
          </Text>
          <PerimeterEditor
            initialCenter={perimeter.center}
            initialRadiusM={perimeter.radiusM}
            onChange={setPerimeter}
          />

          {/* Configuration Inputs */}
          <Text style={styles.sectionHeader}>2. Game Rules</Text>
          <Input
            label="Game Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. North Campus Tag"
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: SPACING.md }}>
              <Input
                label="Max Players"
                value={maxPlayers}
                onChangeText={setMaxPlayers}
                keyboardType="numeric"
                placeholder="16"
                style={{ marginTop: SPACING.md }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Duration (min)"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="numeric"
                placeholder="20"
                style={{ marginTop: SPACING.md }}
              />
            </View>
          </View>

          {/* Host Participates Switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={styles.switchLabel}>Participate as Player</Text>
              <Text style={styles.switchSub}>
                Join as a runner/seeker alongside referee duties.
              </Text>
            </View>
            <Switch
              value={hostParticipates}
              onValueChange={setHostParticipates}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={COLORS.text}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={isLoading ? 'Creating Room…' : 'CREATE GAME & OPEN LOBBY'}
            onPress={() => void handleCreateGame()}
            disabled={isLoading}
            size="large"
            style={{ marginTop: SPACING.xl, marginBottom: SPACING.xxl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.xl },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  subtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: SPACING.lg, marginTop: 4 },
  sectionHeader: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  helperText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  switchSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    color: COLORS.danger,
    marginTop: SPACING.md,
    fontSize: 14,
    fontWeight: '600',
  },
});
