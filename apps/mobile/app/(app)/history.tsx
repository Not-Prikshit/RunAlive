// apps/mobile/app/(app)/history.tsx
// Player Match History & Career Stats Screen

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COLORS, SPACING, RADIUS, TOUCH_TARGET } from '@/design/tokens';
import { api } from '@/lib/api';

interface HistoryItem {
  gameId: string;
  gameName: string;
  role: 'RUNNER' | 'SEEKER' | 'HOST';
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  survivalSeconds: number | null;
  catchesMade: number;
  wasDisqualified: boolean;
  winner: string | null;
  matchDurationSeconds: number | null;
  playedAt: string;
}

interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  totalCatches: number;
  runnerStats: {
    games: number;
    wins: number;
    survivalRate: number;
  };
  seekerStats: {
    games: number;
    wins: number;
    catchSuccessRate: number;
  };
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        api.get<{ history: HistoryItem[] }>('/me/history'),
        api.get<PlayerStats>('/me/stats'),
      ]);
      setHistory(historyRes.data.history);
      setStats(statsRes.data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading history…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        <Text style={styles.screenTitle}>CAREER STATS</Text>

        {/* Stats Grid */}
        {stats && (
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View style={styles.mainStat}>
                <Text style={styles.mainStatValue}>{stats.winRate}%</Text>
                <Text style={styles.mainStatLabel}>WIN RATE</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.mainStat}>
                <Text style={styles.mainStatValue}>{stats.totalGames}</Text>
                <Text style={styles.mainStatLabel}>MATCHES</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.mainStat}>
                <Text style={[styles.mainStatValue, { color: COLORS.seeker }]}>{stats.totalCatches}</Text>
                <Text style={styles.mainStatLabel}>CATCHES</Text>
              </View>
            </View>

            <View style={styles.breakdownRow}>
              <View style={styles.roleStatBox}>
                <Text style={[styles.roleStatTitle, { color: COLORS.runner }]}>Runner</Text>
                <Text style={styles.roleStatDetail}>
                  {stats.runnerStats.wins}W / {stats.runnerStats.games - stats.runnerStats.wins}L
                </Text>
                <Text style={styles.roleStatRate}>{stats.runnerStats.survivalRate}% survival</Text>
              </View>
              <View style={styles.roleStatBox}>
                <Text style={[styles.roleStatTitle, { color: COLORS.seeker }]}>Seeker</Text>
                <Text style={styles.roleStatDetail}>
                  {stats.seekerStats.wins}W / {stats.seekerStats.games - stats.seekerStats.wins}L
                </Text>
                <Text style={styles.roleStatRate}>{stats.seekerStats.catchSuccessRate}% clear rate</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>MATCH HISTORY</Text>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Matches Yet</Text>
            <Text style={styles.emptyBody}>Join or host a game on campus to start building your record!</Text>
            <TouchableOpacity style={styles.joinBtn} onPress={() => router.push('/(app)/join')}>
              <Text style={styles.joinBtnText}>Join a Match</Text>
            </TouchableOpacity>
          </View>
        ) : (
          history.map((item, idx) => {
            const isWin = item.outcome === 'WIN';
            const dateStr = new Date(item.playedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <View key={idx} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyName}>{item.gameName}</Text>
                  <Text style={styles.historyDate}>{dateStr}</Text>
                  <View style={styles.historyTags}>
                    <View
                      style={[
                        styles.roleTag,
                        item.role === 'RUNNER' && styles.roleRunner,
                        item.role === 'SEEKER' && styles.roleSeeker,
                      ]}
                    >
                      <Text style={styles.roleTagText}>{item.role}</Text>
                    </View>
                    {item.role === 'SEEKER' ? (
                      <Text style={styles.historyDetail}>Catches: {item.catchesMade}</Text>
                    ) : (
                      <Text style={styles.historyDetail}>
                        {item.survivalSeconds ? `${Math.floor(item.survivalSeconds / 60)}m survived` : 'Eliminated'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[styles.outcomePill, isWin ? styles.outcomeWin : styles.outcomeLoss]}>
                  <Text style={styles.outcomePillText}>{item.outcome}</Text>
                </View>
              </View>
            );
          })
        )}
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
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
    gap: SPACING.md,
  },
  screenTitle: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: SPACING.sm,
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  mainStat: {
    alignItems: 'center',
  },
  mainStatValue: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
  },
  mainStatLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  roleStatBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 2,
  },
  roleStatTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  roleStatDetail: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  roleStatRate: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  joinBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  joinBtnText: {
    color: COLORS.bg,
    fontWeight: '800',
    fontSize: 14,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyLeft: {
    gap: 4,
    flex: 1,
  },
  historyName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  historyDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  historyTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  roleTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceRaised,
  },
  roleRunner: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
  },
  roleSeeker: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  roleTagText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
  },
  historyDetail: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  outcomePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  outcomeWin: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  outcomeLoss: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  outcomePillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
