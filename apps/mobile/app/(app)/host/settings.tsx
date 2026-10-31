// apps/mobile/app/(app)/host/settings.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '@/design/tokens';

export default function HostSettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Host Settings</Text>
      <Text style={styles.wip}>Game creation and settings editor coming in Stage 3.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.xl },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  wip: { color: COLORS.textMuted, fontStyle: 'italic' },
});
