// apps/mobile/app/index.tsx
// Boot/splash screen — redirects to auth or home based on session

import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '@/design/tokens';

export default function Index() {
  const { isLoading, accessToken } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return <Redirect href={accessToken ? '/(app)/home' : '/(auth)/welcome'} />;
}
