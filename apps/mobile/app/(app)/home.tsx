// apps/mobile/app/(app)/home.tsx
// Home screen: HOST A GAME / JOIN A GAME

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { COLORS, SPACING, FONTS } from '@/design/tokens';
import { useAuthStore } from '@/stores/authStore';

export default function HomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {user?.displayName ?? 'Player'}</Text>
          <Text style={styles.subtitle}>Ready to play?</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/profile')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.displayName?.[0] ?? 'P').toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <Button
          title="HOST A GAME"
          onPress={() => router.push('/(app)/host/settings')}
          variant="primary"
          size="large"
        />
        <Button
          title="JOIN A GAME"
          onPress={() => router.push('/(app)/join')}
          variant="outline"
          size="large"
          style={{ marginTop: SPACING.lg }}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => router.push('/(app)/history')}>
          <Text style={styles.footerLink}>Game History</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void logout()}>
          <Text style={[styles.footerLink, { color: COLORS.textMuted }]}>Log out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#000', fontWeight: '800', fontSize: 20 },
  actions: { flex: 1, justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.lg,
  },
  footerLink: { color: COLORS.textSecondary, fontSize: 14 },
});
