// apps/mobile/app/(app)/join.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '@/design/tokens';

export default function JoinScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Join Game</Text>
      <Text style={styles.wip}>Join-by-code, consent, safety notice coming in Stage 3.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.xl },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  wip: { color: COLORS.textMuted, fontStyle: 'italic' },
});
