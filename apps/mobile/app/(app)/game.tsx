// apps/mobile/app/(app)/game.tsx
// In-Game HUD Screen — high-contrast outdoor display
// Runner view: danger meter arc, boundary distance, match timer
// Seeker view: obfuscated runner pins on map, REPORT CATCH button, timer
// Host view: player statuses, boundary alerts, pause/resume controls

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as KeepAwake from 'expo-keep-awake';
import { COLORS, SPACING, RADIUS, TOUCH_TARGET } from '@/design/tokens';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { startTracking, stopTracking } from '@/lib/location';
import { ChatModal } from '@/components/ChatModal';
import { useAuthStore } from '@/stores/authStore';
import {
  PlayerRole,
  PlayerStatus,
  DangerBand,
  SocketEvent,
  type DangerState,
  type PlayerSummary,
  type RunnerSnapshot,
  type SeekersSnapshotPayload,
  type RunnerDangerPayload,
  type PlayerEliminatedPayload,
  type GamePausedPayload,
  type GameResumedPayload,
  type GameEndedPayload,
  type ViolationStartedPayload,
  type ViolationClearedPayload,
  type CatchPendingPayload,
  type CatchResolvedPayload,
} from '@runalive/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GameState {
  id: string;
  hostUserId: string;
  status: string;
  currentRound: number;
  totalRounds: number;
  endsAt: string | null;
  roundEndsAt: string | null;
  runnersLeft: number;
  totalRunners: number;
  stateVersion: number;
}

interface MyPlayerState {
  role: PlayerRole;
  status: PlayerStatus;
}

interface PendingCatch {
  id: string;
  runnerId: string;
  seekerId: string;
  status: string;
  createdAt: string;
}

interface ViolationState {
  id: string;
  deadlineAt: string;
  startedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(targetIso: string | null): string {
  if (!targetIso) return '--:--';
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function dangerColor(band: DangerBand): string {
  switch (band) {
    case DangerBand.CRITICAL: return COLORS.dangerCritical;
    case DangerBand.HIGH:     return COLORS.dangerHigh;
    case DangerBand.MEDIUM:   return COLORS.dangerMedium;
    case DangerBand.LOW:      return COLORS.dangerLow;
    case DangerBand.SAFE:     return COLORS.dangerSafe;
    default:                  return COLORS.dangerUnknown;
  }
}

function dangerLabel(band: DangerBand): string {
  switch (band) {
    case DangerBand.CRITICAL: return 'CRITICAL';
    case DangerBand.HIGH:     return 'HIGH';
    case DangerBand.MEDIUM:   return 'MEDIUM';
    case DangerBand.LOW:      return 'LOW';
    case DangerBand.SAFE:     return 'SAFE';
    default:                  return 'UNKNOWN';
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Danger meter: large color-coded level bar + band label */
function DangerMeter({ danger }: { danger: DangerState }) {
  const color = dangerColor(danger.band);
  const label = dangerLabel(danger.band);
  const isCritical = danger.band === DangerBand.CRITICAL;

  return (
    <View style={styles.dangerCard}>
      <Text style={[styles.dangerLabel, { color }]}>{label}</Text>
      <View style={styles.dangerBarTrack}>
        <View
          style={[
            styles.dangerBarFill,
            { width: `${danger.level}%`, backgroundColor: color },
            isCritical && styles.dangerBarCriticalPulse,
          ]}
        />
      </View>
      <Text style={[styles.dangerLevelText, { color }]}>{danger.level}/100</Text>
      {isCritical && (
        <Text style={styles.criticalWarning}>⚠ SEEKER VERY CLOSE — MOVE NOW</Text>
      )}
      {danger.band === DangerBand.UNKNOWN && (
        <Text style={styles.unknownNote}>No seeker location data · Assume seekers nearby</Text>
      )}
    </View>
  );
}

/** Match countdown timer display */
function MatchTimer({
  endsAt,
  roundEndsAt,
  currentRound,
  totalRounds,
  isPaused,
}: {
  endsAt: string | null;
  roundEndsAt: string | null;
  currentRound: number;
  totalRounds: number;
  isPaused: boolean;
}) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (isPaused) return;
    const tick = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [isPaused]);

  return (
    <View style={styles.timerCard}>
      <Text style={styles.timerLabel}>MATCH ENDS IN</Text>
      <Text style={[styles.timerValue, isPaused && styles.timerPaused]}>
        {isPaused ? 'PAUSED' : formatCountdown(endsAt)}
      </Text>
      <Text style={styles.timerRound}>
        Round {currentRound}/{totalRounds} · ends {isPaused ? '...' : formatCountdown(roundEndsAt)}
      </Text>
    </View>
  );
}

/** Boundary violation alert */
function ViolationAlert({ violation, onRequest }: { violation: ViolationState; onRequest: () => void }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const secsLeft = Math.max(0, Math.floor((new Date(violation.deadlineAt).getTime() - Date.now()) / 1000));

  return (
    <View style={styles.violationBanner}>
      <Text style={styles.violationTitle}>⚠ BOUNDARY VIOLATION</Text>
      <Text style={styles.violationBody}>
        Return to the play zone! {secsLeft}s before disqualification.
      </Text>
      <TouchableOpacity style={styles.violationButton} onPress={onRequest}>
        <Text style={styles.violationButtonText}>Request Safety Pause</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Runner-view panel */
function RunnerHUD({
  danger,
  game,
  violation,
  myStatus,
  onEmergencyPause,
}: {
  danger: DangerState;
  game: GameState;
  violation: ViolationState | null;
  myStatus: PlayerStatus;
  onEmergencyPause: () => void;
}) {
  const isPaused = game.status === 'PAUSED';
  const isCaught = myStatus === PlayerStatus.CAUGHT;
  const isDisqualified = myStatus === PlayerStatus.DISQUALIFIED;

  if (isCaught) {
    return (
      <View style={styles.eliminatedCard}>
        <Text style={styles.eliminatedTitle}>YOU'VE BEEN CAUGHT</Text>
        <Text style={styles.eliminatedBody}>
          The seeker tagged you. You can still watch the match until it ends.
        </Text>
      </View>
    );
  }

  if (isDisqualified) {
    return (
      <View style={styles.eliminatedCard}>
        <Text style={styles.eliminatedTitle}>DISQUALIFIED</Text>
        <Text style={styles.eliminatedBody}>
          You left the play boundary. Contact the host to appeal.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.hudScroll}>
      <Text style={styles.roleTag}>🏃 RUNNER</Text>
      <DangerMeter danger={danger} />
      {violation && (
        <ViolationAlert violation={violation} onRequest={onEmergencyPause} />
      )}
      <MatchTimer
        endsAt={game.endsAt}
        roundEndsAt={game.roundEndsAt}
        currentRound={game.currentRound}
        totalRounds={game.totalRounds}
        isPaused={isPaused}
      />
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{game.runnersLeft}</Text>
          <Text style={styles.statLabel}>Runners Left</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{game.currentRound}</Text>
          <Text style={styles.statLabel}>Round</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.safetyButton} onPress={onEmergencyPause}>
        <Text style={styles.safetyButtonText}>🆘 EMERGENCY PAUSE</Text>
      </TouchableOpacity>
      {isPaused && (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedText}>⏸ GAME PAUSED</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** Seeker-view panel */
function SeekerHUD({
  game,
  snapshots,
  onReportCatch,
  onEmergencyPause,
}: {
  game: GameState;
  snapshots: RunnerSnapshot[];
  onReportCatch: () => void;
  onEmergencyPause: () => void;
}) {
  const isPaused = game.status === 'PAUSED';
  const activeRunners = snapshots.filter((s) => s.isFresh);

  return (
    <ScrollView contentContainerStyle={styles.hudScroll}>
      <Text style={styles.roleTag}>🔍 SEEKER</Text>
      <MatchTimer
        endsAt={game.endsAt}
        roundEndsAt={game.roundEndsAt}
        currentRound={game.currentRound}
        totalRounds={game.totalRounds}
        isPaused={isPaused}
      />

      {/* Runner snapshot list — approximate locations, no exact coords */}
      <View style={styles.snapshotSection}>
        <Text style={styles.sectionTitle}>Runner Approximate Locations</Text>
        <Text style={styles.sectionNote}>
          Positions are approximate (±{snapshots[0]?.location?.uncertaintyM ?? 100}m). Physical tag required.
        </Text>
        {snapshots.length === 0 ? (
          <Text style={styles.emptyNote}>No runner location data yet.</Text>
        ) : (
          snapshots.map((snap) => (
            <View key={snap.userId} style={styles.snapshotCard}>
              <View style={styles.snapshotHeader}>
                <Text style={styles.snapshotName}>{snap.displayName}</Text>
                <View
                  style={[
                    styles.snapshotStatus,
                    { backgroundColor: snap.isFresh ? COLORS.dangerSafe : COLORS.textMuted },
                  ]}
                >
                  <Text style={styles.snapshotStatusText}>
                    {snap.isFresh ? 'FRESH' : 'STALE'}
                  </Text>
                </View>
              </View>
              {snap.location ? (
                <Text style={styles.snapshotCoords}>
                  Approx: {snap.location.lat.toFixed(4)}°, {snap.location.lon.toFixed(4)}°
                  {'\n'}Uncertainty: ±{snap.location.uncertaintyM}m ·{' '}
                  {Math.round(snap.location.freshnessSeconds)}s ago
                </Text>
              ) : (
                <Text style={styles.snapshotNoLocation}>Location unknown</Text>
              )}
            </View>
          ))
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{game.runnersLeft}</Text>
          <Text style={styles.statLabel}>Active Runners</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: COLORS.seeker }]}>{activeRunners.length}</Text>
          <Text style={styles.statLabel}>Fresh Pings</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.catchButton, isPaused && styles.catchButtonDisabled]}
        onPress={onReportCatch}
        disabled={isPaused}
      >
        <Text style={styles.catchButtonText}>📍 REPORT CATCH</Text>
        <Text style={styles.catchButtonNote}>Only after physically tagging a runner</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.safetyButton} onPress={onEmergencyPause}>
        <Text style={styles.safetyButtonText}>🆘 EMERGENCY PAUSE</Text>
      </TouchableOpacity>

      {isPaused && (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedText}>⏸ GAME PAUSED</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** Host-view panel */
function HostHUD({
  game,
  players,
  onPause,
  onResume,
  onEnd,
}: {
  game: GameState;
  players: PlayerSummary[];
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  const isPaused = game.status === 'PAUSED';
  const isActive = game.status === 'ACTIVE';

  const runners = players.filter((p) => p.role === PlayerRole.RUNNER);
  const seekers = players.filter((p) => p.role === PlayerRole.SEEKER);

  function statusColor(status: PlayerStatus) {
    switch (status) {
      case PlayerStatus.ACTIVE: return COLORS.dangerSafe;
      case PlayerStatus.CAUGHT: return COLORS.dangerCritical;
      case PlayerStatus.DISQUALIFIED: return COLORS.dangerHigh;
      default: return COLORS.textMuted;
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.hudScroll}>
      <Text style={styles.roleTag}>👑 HOST</Text>
      <MatchTimer
        endsAt={game.endsAt}
        roundEndsAt={game.roundEndsAt}
        currentRound={game.currentRound}
        totalRounds={game.totalRounds}
        isPaused={isPaused}
      />

      {/* Host Controls */}
      <View style={styles.hostControls}>
        {isActive && (
          <TouchableOpacity style={styles.hostControlBtn} onPress={onPause}>
            <Text style={styles.hostControlBtnText}>⏸ Pause Match</Text>
          </TouchableOpacity>
        )}
        {isPaused && (
          <TouchableOpacity style={[styles.hostControlBtn, styles.hostResumeBtn]} onPress={onResume}>
            <Text style={styles.hostControlBtnText}>▶ Resume Match</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.hostControlBtn, styles.hostEndBtn]} onPress={onEnd}>
          <Text style={styles.hostControlBtnText}>⏹ End Match Early</Text>
        </TouchableOpacity>
      </View>

      {/* Stats summary */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: COLORS.runner }]}>{game.runnersLeft}</Text>
          <Text style={styles.statLabel}>Runners Active</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: COLORS.seeker }]}>{seekers.length}</Text>
          <Text style={styles.statLabel}>Seekers</Text>
        </View>
      </View>

      {/* Runner roster */}
      <Text style={styles.sectionTitle}>Runners</Text>
      {runners.map((p) => (
        <View key={p.userId} style={styles.playerRow}>
          <View style={[styles.playerStatusDot, { backgroundColor: statusColor(p.status) }]} />
          <Text style={styles.playerName}>{p.displayName}</Text>
          <Text style={[styles.playerStatusLabel, { color: statusColor(p.status) }]}>
            {p.status}
          </Text>
          <View style={[styles.connectionDot, { backgroundColor: p.isConnected ? COLORS.dangerSafe : COLORS.dangerCritical }]} />
        </View>
      ))}

      {/* Seeker roster */}
      <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Seekers</Text>
      {seekers.map((p) => (
        <View key={p.userId} style={styles.playerRow}>
          <View style={[styles.playerStatusDot, { backgroundColor: statusColor(p.status) }]} />
          <Text style={styles.playerName}>{p.displayName}</Text>
          <Text style={[styles.playerStatusLabel, { color: statusColor(p.status) }]}>
            {p.status}
          </Text>
          <View style={[styles.connectionDot, { backgroundColor: p.isConnected ? COLORS.dangerSafe : COLORS.dangerCritical }]} />
        </View>
      ))}

      {isPaused && (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedText}>⏸ GAME PAUSED</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Report Catch Modal ────────────────────────────────────────────────────────

function ReportCatchModal({
  visible,
  runners,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  runners: RunnerSnapshot[];
  onClose: () => void;
  onSubmit: (runnerId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeRunners = runners.filter((r) => r.isFresh || r.location !== null);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onSubmit(selected);
      setSelected(null);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not submit catch report. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Report Catch</Text>
          <Text style={styles.modalNote}>
            Only submit if you physically tagged the runner. The app cannot verify this automatically.
          </Text>
          {activeRunners.length === 0 ? (
            <Text style={styles.emptyNote}>No active runners to report.</Text>
          ) : (
            activeRunners.map((r) => (
              <TouchableOpacity
                key={r.userId}
                style={[styles.runnerSelectRow, selected === r.userId && styles.runnerSelectRowActive]}
                onPress={() => setSelected(r.userId)}
              >
                <View style={[styles.radioCircle, selected === r.userId && styles.radioCircleActive]} />
                <Text style={styles.runnerSelectName}>{r.displayName}</Text>
              </TouchableOpacity>
            ))
          )}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSubmitBtn, (!selected || submitting) && styles.modalSubmitDisabled]}
              onPress={handleSubmit}
              disabled={!selected || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.bg} size="small" />
              ) : (
                <Text style={styles.modalSubmitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function GameScreen() {
  const params = useLocalSearchParams<{ gameId?: string; activeGameId?: string }>();
  const gameId = params.gameId ?? params.activeGameId ?? '';
  const currentUser = useAuthStore((s) => s.user);

  const [game, setGame] = useState<GameState | null>(null);
  const [myPlayer, setMyPlayer] = useState<MyPlayerState | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [danger, setDanger] = useState<DangerState>({ band: DangerBand.UNKNOWN, level: 0 });
  const [snapshots, setSnapshots] = useState<RunnerSnapshot[]>([]);
  const [violation, setViolation] = useState<ViolationState | null>(null);
  const [pendingCatches, setPendingCatches] = useState<PendingCatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [catchModalVisible, setCatchModalVisible] = useState(false);
  const [hostModalVisible, setHostModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);

  const isHost = game?.hostUserId === currentUser?.id;

  // Keep screen awake during active match
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => {
      KeepAwake.deactivateKeepAwake();
    };
  }, []);

  // Active match GPS location tracking for both Seekers and Runners
  useEffect(() => {
    if (!gameId) return;
    void startTracking(gameId);
    return () => {
      void stopTracking();
    };
  }, [gameId]);

  // Load initial game state
  const loadGame = useCallback(async () => {
    if (!gameId || !currentUser) return;
    try {
      const [gameRes, playersRes] = await Promise.all([
        api.get<GameState>(`/games/${gameId}`),
        api.get<{ players: PlayerSummary[] }>(`/games/${gameId}`),
      ]);
      const full = gameRes.data as any;
      setGame({
        id: full.id,
        hostUserId: full.hostUserId ?? '',
        status: full.status,
        currentRound: full.currentRound,
        totalRounds: full.totalRounds,
        endsAt: full.endsAt,
        roundEndsAt: full.roundEndsAt,
        runnersLeft: full.runnersLeft ?? 0,
        totalRunners: full.totalRunners ?? 0,
        stateVersion: full.stateVersion,
      });
      const allPlayers: PlayerSummary[] = full.players ?? [];
      setPlayers(allPlayers);
      const me = allPlayers.find((p: PlayerSummary) => p.userId === currentUser.id);
      if (me) {
        setMyPlayer({ role: me.role, status: me.status });
        if (me.role === PlayerRole.RUNNER) {
          try {
            const dangerRes = await api.get<{ danger: DangerState }>(`/games/${gameId}/danger`);
            if (dangerRes.data?.danger) {
              setDanger(dangerRes.data.danger);
            }
          } catch {
            // Initial danger state not yet available, socket will update
          }
        }
      }
    } catch {
      // ignore, keep showing whatever state we have
    } finally {
      setIsLoading(false);
    }
  }, [gameId, currentUser]);

  // Socket event subscriptions
  useEffect(() => {
    if (!gameId || !currentUser) return;
    const socket = connectSocket();
    socket.emit('game:join', { gameId });

    // Runner danger (only received by the runner themselves)
    socket.on(SocketEvent.RUNNER_DANGER, (payload: RunnerDangerPayload) => {
      if (payload?.danger) {
        setDanger(payload.danger);
      }
    });

    // Seeker: runner snapshots
    socket.on(SocketEvent.SEEKERS_SNAPSHOT, (payload: SeekersSnapshotPayload) => {
      setSnapshots(payload.runners);
    });

    // Game paused
    socket.on(SocketEvent.GAME_PAUSED, (_payload: GamePausedPayload) => {
      setGame((g) => g ? { ...g, status: 'PAUSED' } : g);
    });

    // Game resumed
    socket.on(SocketEvent.GAME_RESUMED, (payload: GameResumedPayload) => {
      setGame((g) =>
        g
          ? {
              ...g,
              status: 'ACTIVE',
              endsAt: payload.endsAt,
              roundEndsAt: payload.roundEndsAt,
              stateVersion: payload.stateVersion,
            }
          : g
      );
    });

    // Game ended
    socket.on(SocketEvent.GAME_ENDED, (payload: GameEndedPayload) => {
      setGame((g) => (g ? { ...g, status: 'FINISHED' } : g));
      const winner = (payload as any).winner ?? payload.result?.winner ?? 'RUNNERS';
      setTimeout(() => {
        Alert.alert(
          'Match Over',
          `Winner: ${winner === 'RUNNERS' ? '🏃 Runners survived!' : '🔍 Seekers caught everyone!'}`,
          [{ text: 'View Results', onPress: () => router.replace(`/(app)/results?gameId=${gameId}`) }]
        );
      }, 500);
    });

    // Violation started
    socket.on(SocketEvent.VIOLATION_STARTED, (payload: ViolationStartedPayload) => {
      setViolation({
        id: payload.violation.id,
        deadlineAt: payload.violation.deadlineAt,
        startedAt: payload.violation.startedAt,
      });
    });

    // Violation cleared
    socket.on(SocketEvent.VIOLATION_CLEARED, (_payload: ViolationClearedPayload) => {
      setViolation(null);
    });

    // Player eliminated
    socket.on(SocketEvent.PLAYER_ELIMINATED, (payload: PlayerEliminatedPayload) => {
      setGame((g) => g ? { ...g, runnersLeft: payload.runnersLeft } : g);
      setPlayers((ps) =>
        ps.map((p) =>
          p.userId === payload.userId ? { ...p, status: payload.status } : p
        )
      );
      if (payload.userId === currentUser.id) {
        setMyPlayer((m) => m ? { ...m, status: payload.status } : m);
      }
    });

    // Catch pending (runner receives — must confirm/reject)
    socket.on(SocketEvent.CATCH_PENDING, (payload: CatchPendingPayload) => {
      if (
        myPlayer?.role === PlayerRole.RUNNER &&
        payload.report.runnerId === currentUser.id &&
        payload.report.status === 'PENDING'
      ) {
        setPendingCatches((prev) => [...prev.filter((c) => c.id !== payload.report.id), payload.report]);
        // Alert runner immediately
        Alert.alert(
          '⚠ Catch Reported!',
          'A seeker reported catching you. Do you confirm?',
          [
            {
              text: 'Reject',
              style: 'destructive',
              onPress: () => rejectCatch(payload.report.id),
            },
            {
              text: 'Confirm',
              onPress: () => confirmCatch(payload.report.id),
            },
          ]
        );
      }
    });

    // Catch resolved
    socket.on(SocketEvent.CATCH_RESOLVED, (payload: CatchResolvedPayload) => {
      setPendingCatches((prev) => prev.filter((c) => c.id !== payload.report.id));
    });

    void loadGame();

    return () => {
      socket.off(SocketEvent.RUNNER_DANGER);
      socket.off(SocketEvent.SEEKERS_SNAPSHOT);
      socket.off(SocketEvent.GAME_PAUSED);
      socket.off(SocketEvent.GAME_RESUMED);
      socket.off(SocketEvent.GAME_ENDED);
      socket.off(SocketEvent.VIOLATION_STARTED);
      socket.off(SocketEvent.VIOLATION_CLEARED);
      socket.off(SocketEvent.PLAYER_ELIMINATED);
      socket.off(SocketEvent.CATCH_PENDING);
      socket.off(SocketEvent.CATCH_RESOLVED);
    };
  }, [gameId, currentUser, myPlayer?.role, loadGame]);

  // Actions
  const confirmCatch = async (catchId: string) => {
    try {
      await api.post(`/games/${gameId}/catches/${catchId}/confirm`, {});
    } catch {
      Alert.alert('Error', 'Could not confirm catch');
    }
  };

  const rejectCatch = async (catchId: string) => {
    try {
      await api.post(`/games/${gameId}/catches/${catchId}/reject`, { reason: 'Runner rejected' });
    } catch {
      Alert.alert('Error', 'Could not reject catch');
    }
  };

  const reportCatch = async (runnerId: string) => {
    const idempotencyKey = crypto.randomUUID();
    await api.post(`/games/${gameId}/catches`, { runnerId, idempotencyKey });
  };

  const requestEmergencyPause = async () => {
    try {
      await api.post(`/games/${gameId}/request-pause`, { reason: 'Safety emergency pause' });
      Alert.alert('Pause requested', 'The host has been notified.');
    } catch {
      Alert.alert('Error', 'Could not request pause');
    }
  };

  const hostPause = async () => {
    try {
      await api.post(`/games/${gameId}/pause`, {});
    } catch {
      Alert.alert('Error', 'Could not pause match');
    }
  };

  const hostResume = async () => {
    try {
      await api.post(`/games/${gameId}/resume`, {});
    } catch {
      Alert.alert('Error', 'Could not resume match');
    }
  };

  const hostEnd = () => {
    Alert.alert('End Match', 'Are you sure you want to end the match early?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Match',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/games/${gameId}/end`, {});
          } catch {
            Alert.alert('Error', 'Could not end match');
          }
        },
      },
    ]);
  };

  // ── Render ──

  if (isLoading || !game || !myPlayer) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading match…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>RUN ALIVE</Text>
          <Text style={styles.headerCode}>R{game.currentRound}/{game.totalRounds}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.chatBadgeBtn}
            onPress={() => setChatModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.chatBadgeText}>💬 CHAT</Text>
          </TouchableOpacity>
          {isHost && (
            <TouchableOpacity
              style={styles.hostBadgeBtn}
              onPress={() => setHostModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.hostBadgeText}>👑 HOST MENU</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Role-specific content */}
      {myPlayer.role === PlayerRole.RUNNER && (
        <RunnerHUD
          danger={danger}
          game={game}
          violation={violation}
          myStatus={myPlayer.status}
          onEmergencyPause={requestEmergencyPause}
        />
      )}

      {myPlayer.role === PlayerRole.SEEKER && (
        <>
          <SeekerHUD
            game={game}
            snapshots={snapshots}
            onReportCatch={() => setCatchModalVisible(true)}
            onEmergencyPause={requestEmergencyPause}
          />
          <ReportCatchModal
            visible={catchModalVisible}
            runners={snapshots}
            onClose={() => setCatchModalVisible(false)}
            onSubmit={reportCatch}
          />
        </>
      )}

      {myPlayer.role === PlayerRole.HOST && (
        <HostHUD
          game={game}
          players={players}
          onPause={hostPause}
          onResume={hostResume}
          onEnd={hostEnd}
        />
      )}

      {/* Host Controls Sheet for playing hosts */}
      {isHost && (
        <Modal visible={hostModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>👑 Host Controls</Text>
                <TouchableOpacity onPress={() => setHostModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: SPACING.md }}>
                <View style={styles.hostControls}>
                  {game.status === 'ACTIVE' && (
                    <TouchableOpacity
                      style={styles.hostControlBtn}
                      onPress={() => {
                        setHostModalVisible(false);
                        void hostPause();
                      }}
                    >
                      <Text style={styles.hostControlBtnText}>⏸ Pause Match</Text>
                    </TouchableOpacity>
                  )}
                  {game.status === 'PAUSED' && (
                    <TouchableOpacity
                      style={[styles.hostControlBtn, styles.hostResumeBtn]}
                      onPress={() => {
                        setHostModalVisible(false);
                        void hostResume();
                      }}
                    >
                      <Text style={styles.hostControlBtnText}>▶ Resume Match</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.hostControlBtn, styles.hostEndBtn]}
                    onPress={() => {
                      setHostModalVisible(false);
                      hostEnd();
                    }}
                  >
                    <Text style={styles.hostControlBtnText}>⏹ End Match Early</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionTitle}>Players Overview ({players.length})</Text>
                {players.map((p) => (
                  <View key={p.userId} style={styles.playerRow}>
                    <View
                      style={[
                        styles.playerStatusDot,
                        {
                          backgroundColor:
                            p.role === PlayerRole.RUNNER ? COLORS.runner : COLORS.seeker,
                        },
                      ]}
                    />
                    <Text style={styles.playerName}>
                      {p.displayName} ({p.role})
                    </Text>
                    <Text
                      style={[
                        styles.playerStatusLabel,
                        {
                          color:
                            p.status === PlayerStatus.ACTIVE
                              ? COLORS.success
                              : COLORS.danger,
                        },
                      ]}
                    >
                      {p.status}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Squad Chat Modal */}
      <ChatModal
        visible={chatModalVisible}
        onClose={() => setChatModalVisible(false)}
        gameId={gameId}
        currentUserId={currentUser?.id}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  hostBadgeBtn: {
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.host,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  hostBadgeText: {
    color: COLORS.host,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  chatBadgeBtn: {
    backgroundColor: 'rgba(255, 221, 0, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  chatBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
  },
  headerCode: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  hudScroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
    gap: SPACING.md,
  },
  roleTag: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  // Danger Meter
  dangerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  dangerLabel: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  dangerBarTrack: {
    height: 20,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  dangerBarFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  dangerBarCriticalPulse: {
    // In production use Animated API for pulsating effect
    opacity: 0.9,
  },
  dangerLevelText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  criticalWarning: {
    color: COLORS.dangerCritical,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: 1,
  },
  unknownNote: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Timer
  timerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  timerLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  timerValue: {
    color: COLORS.text,
    fontSize: 52,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timerPaused: {
    color: COLORS.warning,
    fontSize: 32,
  },
  timerRound: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  // Violation Banner
  violationBanner: {
    backgroundColor: '#2A0A0A',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.dangerCritical,
    gap: SPACING.sm,
  },
  violationTitle: {
    color: COLORS.dangerCritical,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
  },
  violationBody: {
    color: COLORS.text,
    fontSize: 14,
  },
  violationButton: {
    backgroundColor: COLORS.dangerCritical,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  violationButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 36,
    fontWeight: '900',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // Safety/Emergency button
  safetyButton: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: TOUCH_TARGET,
  },
  safetyButtonText: {
    color: COLORS.dangerHigh,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },

  // Catch button (Seekers)
  catchButton: {
    backgroundColor: COLORS.seeker,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: TOUCH_TARGET * 1.5,
    justifyContent: 'center',
  },
  catchButtonDisabled: {
    opacity: 0.4,
  },
  catchButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 2,
  },
  catchButtonNote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },

  // Paused banner
  pausedBanner: {
    backgroundColor: '#1C1800',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  pausedText: {
    color: COLORS.warning,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 3,
  },

  // Eliminated
  eliminatedCard: {
    flex: 1,
    margin: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.dangerCritical,
  },
  eliminatedTitle: {
    color: COLORS.dangerCritical,
    fontWeight: '900',
    fontSize: 24,
    letterSpacing: 3,
    textAlign: 'center',
  },
  eliminatedBody: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Seeker snapshots
  snapshotSection: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 1,
  },
  sectionNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  emptyNote: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  snapshotCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snapshotName: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  snapshotStatus: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  snapshotStatusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  snapshotCoords: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: 'Courier New',
    lineHeight: 18,
  },
  snapshotNoLocation: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Host controls
  hostControls: {
    gap: SPACING.sm,
  },
  hostControlBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: TOUCH_TARGET,
  },
  hostResumeBtn: {
    borderColor: COLORS.dangerSafe,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  hostEndBtn: {
    borderColor: COLORS.dangerCritical,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  hostControlBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },

  // Player rows (host)
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  playerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  playerName: {
    color: COLORS.text,
    fontSize: 14,
    flex: 1,
  },
  playerStatusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg * 2,
    borderTopRightRadius: RADIUS.lg * 2,
    padding: SPACING.xl,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  modalTitle: {
    color: COLORS.text,
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 2,
  },
  modalNote: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  runnerSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  runnerSelectRowActive: {
    borderColor: COLORS.seeker,
    backgroundColor: 'rgba(249,115,22,0.1)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  radioCircleActive: {
    borderColor: COLORS.seeker,
    backgroundColor: COLORS.seeker,
  },
  runnerSelectName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.seeker,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
  modalSubmitDisabled: {
    opacity: 0.4,
  },
  modalSubmitText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
});
