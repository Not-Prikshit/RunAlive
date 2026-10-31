// apps/mobile/app/(auth)/register.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { COLORS, SPACING } from '@/design/tokens';
import { useRegister } from '@/hooks/useAuth';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { register, isLoading, error } = useRegister();

  const handleRegister = async () => {
    setFieldError(null);
    if (!email.trim() || !password || !displayName.trim()) {
      setFieldError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    await register({ email, password, displayName });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create account</Text>

          <Input label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Runner42" />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
            style={{ marginTop: SPACING.md }}
          />
          <Input
            label="Password (min 8 chars)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            style={{ marginTop: SPACING.md }}
          />

          {(fieldError ?? error) ? (
            <Text style={styles.error}>{fieldError ?? error}</Text>
          ) : null}

          <Button
            title={isLoading ? 'Creating account…' : 'CREATE ACCOUNT'}
            onPress={() => void handleRegister()}
            disabled={isLoading}
            size="large"
            style={{ marginTop: SPACING.xl }}
          />
          <Button
            title="Already have an account? Log in"
            onPress={() => router.replace('/(auth)/login')}
            variant="ghost"
            style={{ marginTop: SPACING.sm }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.xl, paddingTop: SPACING.xxl },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xl },
  error: { color: COLORS.danger, marginTop: SPACING.sm, fontSize: 14 },
});
