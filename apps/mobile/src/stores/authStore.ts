// apps/mobile/src/stores/authStore.ts
// Authentication state using Zustand + expo-secure-store for token persistence

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api';

const ACCESS_TOKEN_KEY = 'runalive_access_token';
const REFRESH_TOKEN_KEY = 'runalive_refresh_token';

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setTokens: (access: string, refresh: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: true, // Start loading until session is restored
  error: null,

  setTokens: async (access, refresh) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
    set({ accessToken: access, refreshToken: refresh });
  },

  clearTokens: async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({ accessToken: null, refreshToken: null, user: null });
  },

  setUser: (user) => set({ user }),

  setLoading: (loading) => set({ isLoading: loading }),

  logout: async () => {
    const { refreshToken } = get();
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken }).catch(() => {
          // Best-effort logout
        });
      }
    } finally {
      await get().clearTokens();
    }
  },

  restore: async () => {
    set({ isLoading: true });
    try {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      ]);

      if (access && refresh) {
        set({ accessToken: access, refreshToken: refresh });
        // Try to get user profile
        try {
          const res = await api.get<User>('/me');
          set({ user: res.data });
        } catch {
          // Access token may be expired — try refresh
          try {
            const refreshRes = await api.post<{ accessToken: string; refreshToken: string }>(
              '/auth/refresh',
              { refreshToken: refresh }
            );
            await get().setTokens(refreshRes.data.accessToken, refreshRes.data.refreshToken);
            const profileRes = await api.get<User>('/me');
            set({ user: profileRes.data });
          } catch {
            await get().clearTokens();
          }
        }
      }
    } catch {
      // SecureStore unavailable — clear state
      set({ accessToken: null, refreshToken: null, user: null });
    } finally {
      set({ isLoading: false });
    }
  },
}));
