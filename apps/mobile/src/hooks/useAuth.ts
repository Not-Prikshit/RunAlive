// apps/mobile/src/hooks/useAuth.ts
import { useState } from 'react';
import { router } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuthStore();

  const login = async (input: LoginInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthTokens>('/auth/login', input);
      await setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      router.replace('/(app)/home');
    } catch (err) {
      if (err instanceof ApiError) {
        // Use uniform message — never reveal whether email exists
        setError('Invalid email or password.');
      } else {
        setError('Connection error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { login, isLoading, error };
}

export function useRegister() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuthStore();

  const register = async (input: RegisterInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthTokens>('/auth/register', input);
      await setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      router.replace('/(app)/home');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('An account with this email already exists.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Connection error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { register, isLoading, error };
}
