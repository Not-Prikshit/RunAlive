// apps/mobile/app/(auth)/welcome.tsx
// Welcome/landing screen

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { COLORS, FONTS, SPACING } from '@/design/tokens';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>RUN ALIVE</Text>
        <Text style={styles.tagline}>The campus hunt begins.</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="LOG IN"
          onPress={() => router.push('/(auth)/login')}
          variant="primary"
          size="large"
        />
        <Button
          title="CREATE ACCOUNT"
          onPress={() => router.push('/(auth)/register')}
          variant="outline"
          size="large"
          style={{ marginTop: SPACING.md }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'space-between',
    paddingBottom: SPACING.xxl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 4,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    textAlign: 'center',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
  },
});
