// apps/mobile/app/(app)/results.tsx
// Match Results Screen: Winner announcement, duration, stats breakdown, player roster outcomes

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { COLORS, SPACING, RADIUS, TOUCH_TARGET } from '@/design/tokens';
import { api } from '@/lib/api';
import {
  GameWinner,
  PlayerRole,
  type GameResult,
  type ParticipationRecord,
} from '@runalive/shared';

interface ResultsData extends GameResult {
  participations: ParticipationRecord[];
}

export default function ResultsScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const fetchResults = async () => {
      try {
        const res = await api.get<ResultsData>(`/games/${gameId}/results`);
        setResults(res.data);
      } catch (err: any) {
        setError(err.message ?? 'Could not load match results');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchResults();
  }, [gameId]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Calculating results…</Text>
      </SafeAreaView>
    );
  }

  if (error || !results) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Results Unavailable</Text>
        <Text style={styles.errorBody}>{error ?? 'No results recorded for this match'}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(app)/home')}>
          <Text style={styles.primaryBtnText}>Return Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isRunnersWin = results.winner === GameWinner.RUNNERS;
  const isSeekersWin = results.winner === GameWinner.SEEKERS;
  const durationMins = Math.floor(results.matchDurationSeconds / 60);
  const durationSecs = results.matchDurationSeconds % 60;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Winner Banner */}
        <View
          style={[
            styles.winnerBanner,
            isRunnersWin && styles.runnersBanner,
            isSeekersWin && styles.seekersBanner,
          ]}
        >
          <Text style={styles.winnerSubtitle}>MATCH OUTCOME</Text>
          <Text style={styles.winnerTitle}>
            {isRunnersWin ? '🏃 RUNNERS WIN!' : isSeekersWin ? '🔍 SEEKERS WIN!' : '🤝 DRAW'}
          </Text>
          <Text style={styles.winnerReason}>
            {isRunnersWin
              ? `${results.runnersRemaining} runner(s) survived until time expired.`
              : 'All runners were physically caught before time expired!'}
          </Text>
        </View>

        {/* Match Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Match Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {durationMins}:{String(durationSecs).padStart(2, '0')}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{results.roundsCompleted}</Text>
              <Text style={styles.statLabel}>Rounds</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: COLORS.runner }]}>
                {results.runnersRemaining}
              </Text>
              <Text style={styles.statLabel}>Survived</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: COLORS.seeker }]}>
                {results.runnersCaught}
              </Text>
              <Text style={styles.statLabel}>Caught</Text>
            </View>
          </View>
        </View>

        {/* Players Roster & Outcomes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player Outcomes ({results.participations.length})</Text>
          {results.participations.map((p, idx) => {
            const isWin = p.outcome === 'WIN';
            return (
              <View key={idx} style={styles.playerRow}>
                <View
                  style={[
                    styles.roleBadge,
                    p.role === PlayerRole.RUNNER && styles.roleRunner,
                    p.role === PlayerRole.SEEKER && styles.roleSeeker,
                  ]}
                >
                  <Text style={styles.roleText}>{p.role}</Text>
                </View>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerGameName}>Player #{idx + 1}</Text>
                  {p.role === PlayerRole.SEEKER ? (
                    <Text style={styles.playerStatsNote}>Catches made: {p.catchesMade}</Text>
                  ) : p.wasDisqualified ? (
                    <Text style={styles.playerStatsNoteDisq}>Disqualified</Text>
                  ) : (
                    <Text style={styles.playerStatsNote}>
                      Survived: {p.survivalSeconds ? `${Math.floor(p.survivalSeconds / 60)}m` : '0m'}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.outcomeBadge,
                    isWin ? styles.outcomeWin : styles.outcomeLoss,
                  ]}
                >
                  <Text style={styles.outcomeText}>{p.outcome}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/(app)/home')}
          >
            <Text style={styles.primaryBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  errorContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  errorBody: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
    gap: SPACING.lg,
  },
  winnerBanner: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  runnersBanner: {
    borderColor: COLORS.runner,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  seekersBanner: {
    borderColor: COLORS.seeker,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  winnerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  winnerTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  winnerReason: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  roleBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceRaised,
  },
  roleRunner: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
  },
  roleSeeker: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  roleText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
  },
  playerMeta: {
    flex: 1,
    gap: 2,
  },
  playerGameName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  playerStatsNote: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  playerStatsNoteDisq: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  outcomeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  outcomeWin: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  outcomeLoss: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  outcomeText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actions: {
    marginTop: SPACING.md,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: COLORS.bg,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
});
