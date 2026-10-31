// apps/mobile/src/lib/api.ts
// Axios-like API client using fetch — no axios dependency to keep bundle lean
// Automatically attaches access token and handles 401 refresh

import { useAuthStore } from '@/stores/authStore';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

interface ApiResponse<T> {
  data: T;
  status: number;
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOnUnauth = true
): Promise<ApiResponse<T>> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — try token refresh once
  if (res.status === 401 && retryOnUnauth) {
    const store = useAuthStore.getState();
    if (store.refreshToken) {
      try {
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: store.refreshToken }),
        });
        if (refreshRes.ok) {
          const data = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
          await store.setTokens(data.accessToken, data.refreshToken);
          return request<T>(method, path, body, false);
        }
      } catch {
        // Refresh failed
      }
      await store.clearTokens();
    }
  }

  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } } & T;

  if (!res.ok) {
    const errorBody = json as { error?: { code: string; message: string } };
    throw new ApiError(
      res.status,
      errorBody.error?.code ?? 'UNKNOWN_ERROR',
      errorBody.error?.message ?? 'Request failed'
    );
  }

  return { data: json as T, status: res.status };
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export { ApiError };
