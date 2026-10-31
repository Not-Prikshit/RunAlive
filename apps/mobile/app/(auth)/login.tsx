// apps/mobile/app/(auth)/login.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { COLORS, FONTS, SPACING } from '@/design/tokens';
import { useLogin } from '@/hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { login, isLoading, error } = useLogin();

  const handleLogin = async () => {
    setFieldError(null);
    if (!email.trim() || !password) {
      setFieldError('Please fill in all fields.');
      return;
    }
    await login({ email, password });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Welcome back</Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Input
            label="Password"
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
            title={isLoading ? 'Logging in…' : 'LOG IN'}
            onPress={() => void handleLogin()}
            disabled={isLoading}
            size="large"
            style={{ marginTop: SPACING.xl }}
          />

          <Button
            title="Forgot password?"
            onPress={() => router.push('/(auth)/forgot-password')}
            variant="ghost"
            style={{ marginTop: SPACING.sm }}
          />

          <Button
            title="No account? Sign up"
            onPress={() => router.replace('/(auth)/register')}
            variant="ghost"
            style={{ marginTop: SPACING.xs }}
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
