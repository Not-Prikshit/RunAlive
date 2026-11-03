// apps/mobile/app/(app)/lobby.tsx
// Realtime Game Lobby: roster, role assignment, ready toggling, live socket updates.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { COLORS, SPACING, RADIUS } from '@/design/tokens';
import { api, ApiError } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import {
  PlayerRole,
  SocketEvent,
  type PlayerSummary,
  type LobbyUpdatedPayload,
} from '@runalive/shared';

interface GameDetails {
  id: string;
  roomCode: string;
  name: string;
  hostUserId: string;
  maxPlayers: number;
  requireAllReady: boolean;
  status: string;
  players: PlayerSummary[];
}

export default function LobbyScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const currentUser = useAuthStore((s) => s.user);

  const [game, setGame] = useState<GameDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isHost = game?.hostUserId === currentUser?.id;
  const myPlayer = game?.players.find((p) => p.userId === currentUser?.id);
  const allReady = game?.players.every((p) => p.role === PlayerRole.HOST || p.isReady) ?? false;
  const canStart = isHost && (!game?.requireAllReady || allReady) && (game?.players.length ?? 0) >= 2;

  const loadGame = async () => {
    if (!gameId) return;
    try {
      const res = await api.get<GameDetails>(`/games/${gameId}`);
      setGame(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load lobby details.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadGame();

    const socket = connectSocket();
    socket.emit('game:join', { gameId });

    socket.on(SocketEvent.LOBBY_UPDATED, (data: LobbyUpdatedPayload) => {
      setGame((prev) => (prev ? { ...prev, players: data.players } : prev));
    });

    socket.on(SocketEvent.GAME_STARTED, () => {
      router.replace({
        pathname: '/(app)/home',
        params: { activeGameId: gameId },
      });
    });

    socket.on('lobby:kicked', () => {
      Alert.alert('Removed', 'You were removed from this lobby by the host.', [
        { text: 'OK', onPress: () => router.replace('/(app)/home') },
      ]);
    });

    return () => {
      socket.off(SocketEvent.LOBBY_UPDATED);
      socket.off(SocketEvent.GAME_STARTED);
      socket.off('lobby:kicked');
    };
  }, [gameId]);

  const handleShareCode = async () => {
    if (!game) return;
    try {
      await Share.share({
        message: `Join my RUN ALIVE match! Room Code: ${game.roomCode}`,
      });
    } catch {
      // Ignored
    }
  };

  const handleToggleReady = async () => {
    if (!game || !myPlayer) return;
    setActionLoading(true);
    try {
      await api.post(`/games/${game.id}/ready`, { isReady: !myPlayer.isReady });
    } catch {
      Alert.alert('Error', 'Could not update ready state.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignRole = async (targetUserId: string, newRole: PlayerRole) => {
    if (!game || !isHost) return;
    try {
      await api.post(`/games/${game.id}/teams/assign`, {
        userId: targetUserId,
        role: newRole,
      });
    } catch {
      Alert.alert('Error', 'Failed to update player role.');
    }
  };

  const handleRandomizeTeams = async () => {
    if (!game || !isHost) return;
    setActionLoading(true);
    try {
      await api.post(`/games/${game.id}/teams/randomize`, {});
    } catch (err) {
      if (err instanceof ApiError) {
        Alert.alert('Notice', err.message);
      } else {
        Alert.alert('Error', 'Failed to randomize teams.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickPlayer = (target: PlayerSummary) => {
    if (!game || !isHost) return;
    Alert.alert('Remove Player', `Are you sure you want to kick ${target.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kick',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/games/${game.id}/kick`, { userId: target.userId });
          } catch {
            Alert.alert('Error', 'Failed to remove player.');
          }
        },
      },
    ]);
  };

  const handleLeaveLobby = async () => {
    if (!game) return;
    try {
      await api.post(`/games/${game.id}/leave`);
      router.replace('/(app)/home');
    } catch {
      router.replace('/(app)/home');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Connecting to lobby…</Text>
      </SafeAreaView>
    );
  }

  if (error || !game) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorText}>{error ?? 'Lobby not found'}</Text>
        <Button title="Back to Home" onPress={() => router.replace('/(app)/home')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.gameName}>{game.name}</Text>
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>ROOM CODE</Text>
            <TouchableOpacity onPress={() => void handleShareCode()} activeOpacity={0.7}>
              <Text style={styles.roomCode}>{game.roomCode}</Text>
              <Text style={styles.shareHint}>Tap to share code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Players Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            PLAYERS ({game.players.length} / {game.maxPlayers})
          </Text>
          {isHost ? (
            <TouchableOpacity
              onPress={() => void handleRandomizeTeams()}
              disabled={actionLoading}
              style={styles.shuffleBtn}
            >
              <Text style={styles.shuffleBtnText}>🎲 Shuffle Teams</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Player Roster */}
        {game.players.map((player) => {
          const isMe = player.userId === currentUser?.id;
          const isPlayerHost = player.role === PlayerRole.HOST;

          return (
            <View key={player.userId} style={styles.playerCard}>
              <View style={styles.playerInfo}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: player.isConnected ? COLORS.success : COLORS.textMuted },
                  ]}
                />
                <Text style={styles.playerName}>
                  {player.displayName} {isMe ? '(You)' : ''}
                </Text>
              </View>

              <View style={styles.playerActions}>
                {/* Role Badge */}
                <TouchableOpacity
                  disabled={!isHost}
                  onPress={() => {
                    let nextRole: PlayerRole;
                    if (player.role === PlayerRole.RUNNER) {
                      nextRole = PlayerRole.SEEKER;
                    } else if (player.role === PlayerRole.SEEKER) {
                      nextRole = isMe ? PlayerRole.HOST : PlayerRole.RUNNER;
                    } else {
                      nextRole = PlayerRole.RUNNER;
                    }
                    void handleAssignRole(player.userId, nextRole);
                  }}
                  style={[
                    styles.roleBadge,
                    player.role === PlayerRole.SEEKER && styles.roleSeeker,
                    player.role === PlayerRole.RUNNER && styles.roleRunner,
                    isPlayerHost && styles.roleHost,
                  ]}
                >
                  <Text style={styles.roleText}>{player.role}</Text>
                </TouchableOpacity>

                {/* Ready Status */}
                {!isPlayerHost ? (
                  <View
                    style={[
                      styles.readyBadge,
                      player.isReady ? styles.readyYes : styles.readyNo,
                    ]}
                  >
                    <Text style={styles.readyText}>
                      {player.isReady ? 'READY' : 'NOT READY'}
                    </Text>
                  </View>
                ) : null}

                {/* Kick Button for Host */}
                {isHost && !isMe ? (
                  <TouchableOpacity
                    onPress={() => handleKickPlayer(player)}
                    style={styles.kickBtn}
                  >
                    <Text style={styles.kickBtnText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Action Controls */}
        <View style={styles.bottomControls}>
          {isHost ? (
            <Button
              title="START MATCH"
              onPress={() => {
                Alert.alert(
                  'Start Match',
                  'Are all players gathered and ready?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Start',
                      onPress: async () => {
                        try {
                          await api.post(`/games/${game.id}/start`);
                        } catch {
                          Alert.alert('Notice', 'Starting match engine (Stage 5).');
                        }
                      },
                    },
                  ]
                );
              }}
              disabled={!canStart}
              size="large"
              style={{ marginBottom: SPACING.md }}
            />
          ) : (
            <Button
              title={myPlayer?.isReady ? 'CHANGE TO NOT READY' : 'I AM READY'}
              variant={myPlayer?.isReady ? 'outline' : 'primary'}
              onPress={() => void handleToggleReady()}
              disabled={actionLoading}
              size="large"
              style={{ marginBottom: SPACING.md }}
            />
          )}

          <Button
            title={isHost ? 'Cancel Game' : 'Leave Lobby'}
            variant="ghost"
            onPress={() => void handleLeaveLobby()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  content: { padding: SPACING.xl },
  loadingText: { color: COLORS.textMuted, marginTop: SPACING.md, fontSize: 14 },
  errorText: { color: COLORS.danger, marginBottom: SPACING.lg, fontSize: 16 },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  gameName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  codeContainer: {
    alignItems: 'center',
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  codeLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  roomCode: {
    color: COLORS.accent,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 2,
  },
  shareHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shuffleBtn: {
    backgroundColor: COLORS.surface,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shuffleBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  playerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.sm,
  },
  playerName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  playerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    marginRight: SPACING.xs,
  },
  roleRunner: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
  },
  roleSeeker: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  roleHost: {
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
  },
  roleText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
  },
  readyBadge: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
  },
  readyYes: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  readyNo: {
    backgroundColor: 'rgba(102, 102, 102, 0.2)',
  },
  readyText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.text,
  },
  kickBtn: {
    marginLeft: SPACING.xs,
    padding: 4,
  },
  kickBtnText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  bottomControls: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
  },
});
