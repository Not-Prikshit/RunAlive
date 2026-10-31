// apps/mobile/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
import { COLORS } from '@/design/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.bg },
        animation: 'fade',
      }}
    />
  );
}
