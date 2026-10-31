// apps/mobile/app/(app)/profile.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '@/design/tokens';
import { useAuthStore } from '@/stores/authStore';

export default function ProfileScreen() {
  const { user } = useAuthStore();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.name}>{user?.displayName}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <Text style={styles.wip}>Avatar upload and account management coming in Stage 10.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.xl },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  name: { fontSize: 20, color: COLORS.text, fontWeight: '700' },
  email: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.xs },
  wip: { color: COLORS.textMuted, marginTop: SPACING.xl, fontStyle: 'italic' },
});
