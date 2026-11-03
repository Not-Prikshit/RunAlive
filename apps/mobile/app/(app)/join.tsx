// apps/mobile/app/(app)/join.tsx
// Join Game screen: room code entry, lobby preview, safety & location consent.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { COLORS, SPACING, RADIUS } from '@/design/tokens';
import { api, ApiError } from '@/lib/api';

interface LobbyPreview {
  id: string;
  roomCode: string;
  name: string;
  maxPlayers: number;
  playerCount: number;
  hostDisplayName: string;
}

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<LobbyPreview | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically lookup lobby preview when 6 characters are typed
  useEffect(() => {
    const cleanCode = code.toUpperCase().trim();
    if (cleanCode.length === 6) {
      void lookupLobby(cleanCode);
    } else {
      setPreview(null);
    }
  }, [code]);

  const lookupLobby = async (roomCode: string) => {
    setIsLookingUp(true);
    setError(null);
    try {
      const res = await api.get<LobbyPreview>(`/games/by-code/${roomCode}`);
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Game not found. Please verify the code.');
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    const cleanCode = code.toUpperCase().trim();

    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-character room code.');
      return;
    }

    if (!hasConsent) {
      setError('You must accept location sharing and campus safety rules to join.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.post<{ game: { id: string } }>('/games/join', {
        roomCode: cleanCode,
        locationConsentAt: new Date().toISOString(),
      });

      router.replace({
        pathname: '/(app)/lobby',
        params: { gameId: res.data.game.id },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Network error. Failed to join game.');
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
          <Text style={styles.title}>Join Game</Text>
          <Text style={styles.subtitle}>
            Enter the 6-character room code provided by your host.
          </Text>

          <Input
            label="Room Code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. XK92WP"
            inputStyle={styles.codeInput}
          />

          {isLookingUp ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.loadingText}>Looking up game…</Text>
            </View>
          ) : null}

          {/* Lobby Preview Card */}
          {preview ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>{preview.name}</Text>
              <View style={styles.previewDetailRow}>
                <Text style={styles.previewDetailLabel}>Host:</Text>
                <Text style={styles.previewDetailValue}>{preview.hostDisplayName}</Text>
              </View>
              <View style={styles.previewDetailRow}>
                <Text style={styles.previewDetailLabel}>Players in Lobby:</Text>
                <Text style={styles.previewDetailValue}>
                  {preview.playerCount} / {preview.maxPlayers}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Safety & Location Consent */}
          <View style={styles.consentCard}>
            <View style={{ flex: 1, paddingRight: SPACING.md }}>
              <Text style={styles.consentTitle}>Location & Safety Rules</Text>
              <Text style={styles.consentBody}>
                I consent to share my device location during active gameplay for campus boundary
                monitoring and proximity alerts. I understand physical tags are judged by players,
                and I must follow all campus pedestrian rules.
              </Text>
            </View>
            <Switch
              value={hasConsent}
              onValueChange={setHasConsent}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={COLORS.text}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={isLoading ? 'Joining…' : 'JOIN LOBBY'}
            onPress={() => void handleJoin()}
            disabled={isLoading || !hasConsent || code.trim().length !== 6}
            size="large"
            style={{ marginTop: SPACING.xl }}
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
  subtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: SPACING.xl, marginTop: 4 },
  codeInput: {
    letterSpacing: 4,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginLeft: SPACING.sm,
  },
  previewCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  previewDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  previewDetailLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  previewDetailValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  consentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  consentTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  consentBody: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: COLORS.danger,
    marginTop: SPACING.md,
    fontSize: 14,
    fontWeight: '600',
  },
});
