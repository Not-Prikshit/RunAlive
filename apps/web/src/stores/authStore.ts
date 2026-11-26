import { create } from 'zustand';
import { api } from '../lib/api';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, displayName: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  updateDisplayName: (displayName: string) => void;
}

const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('runalive_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: getStoredUser(),
  token: typeof window !== 'undefined' ? localStorage.getItem('access_token') : null,
  isLoading: false,

  updateDisplayName: (displayName: string) => {
    set((state) => {
      const updatedUser: User = state.user
        ? { ...state.user, displayName }
        : { id: 'user-self', email: 'operator@runalive.app', displayName };
      localStorage.setItem('runalive_user', JSON.stringify(updatedUser));
      return { user: updatedUser };
    });
  },

  login: async (email, password) => {
    try {
      const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
        email,
        password,
      });
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('runalive_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.accessToken, isLoading: false });
    } catch {
      // Seamless fallback for static client hosting (e.g. GitHub Pages without live backend)
      const fallbackName = email.split('@')[0].toUpperCase();
      const fallbackUser: User = {
        id: `demo-user-${Date.now()}`,
        email,
        displayName: fallbackName || 'OPERATOR',
      };
      const fallbackToken = `demo_jwt_token_${Date.now()}`;
      localStorage.setItem('access_token', fallbackToken);
      localStorage.setItem('runalive_user', JSON.stringify(fallbackUser));
      set({ user: fallbackUser, token: fallbackToken, isLoading: false });
    }
  },

  register: async (email, password, displayName) => {
    try {
      const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>('/auth/register', {
        email,
        password,
        displayName,
      });
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('runalive_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.accessToken, isLoading: false });
    } catch {
      const fallbackUser: User = {
        id: `demo-user-${Date.now()}`,
        email,
        displayName: displayName || email.split('@')[0],
      };
      const fallbackToken = `demo_jwt_token_${Date.now()}`;
      localStorage.setItem('access_token', fallbackToken);
      localStorage.setItem('runalive_user', JSON.stringify(fallbackUser));
      set({ user: fallbackUser, token: fallbackToken, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('runalive_user');
    set({ user: null, token: null, isLoading: false });
  },

  restoreSession: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      set({ user: null, token: null, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const res = await api.get<any>('/me');
      const loadedUser: User = res.user || res;
      if (loadedUser && (loadedUser.displayName || loadedUser.email)) {
        localStorage.setItem('runalive_user', JSON.stringify(loadedUser));
        set({ user: loadedUser, token, isLoading: false });
      } else {
        set({ token, isLoading: false });
      }
    } catch {
      const cached = getStoredUser();
      if (cached) {
        set({ user: cached, token, isLoading: false });
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, token: null, isLoading: false });
      }
    }
  },
}));
