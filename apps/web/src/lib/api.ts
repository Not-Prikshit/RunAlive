const defaultHost =
  typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== ''
    ? window.location.hostname
    : 'localhost';

export const API_URL = import.meta.env.VITE_API_URL || `http://${defaultHost}:3000/api/v1`;
export const WS_URL = import.meta.env.VITE_WS_URL || `http://${defaultHost}:3000`;

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

class ApiClient {
  private inFlightGetRequests = new Map<string, Promise<any>>();
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        window.dispatchEvent(new CustomEvent('runalive_network_status', { detail: { online: true } }));
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        window.dispatchEvent(new CustomEvent('runalive_network_status', { detail: { online: false } }));
      });
    }
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  private getHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeoutMs = 8000, retries = 2, ...fetchOptions } = options;
    const url = `${API_URL}${endpoint}`;
    const method = (fetchOptions.method || 'GET').toUpperCase();

    // 1. In-flight Request Deduplication for identical GET requests
    if (method === 'GET') {
      const existing = this.inFlightGetRequests.get(endpoint);
      if (existing) {
        return existing as Promise<T>;
      }
    }

    const execWithRetry = async (attempt: number): Promise<T> => {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
          headers: {
            ...this.getHeaders(),
            ...fetchOptions.headers,
          },
        });

        clearTimeout(timeoutTimer);

        if (response.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.dispatchEvent(new Event('auth_unauthorized'));
        }

        const data = await response.json();
        if (!response.ok) {
          // Do not retry client 4xx errors
          if (response.status >= 400 && response.status < 500) {
            throw new Error(data.error?.message || 'Request failed');
          }
          // Server 5xx error: eligible for retry
          throw new Error(data.error?.message || `Server error (${response.status})`);
        }

        return data;
      } catch (err: any) {
        clearTimeout(timeoutTimer);

        // Exponential backoff with jitter for network/server errors
        if (attempt < retries && err.name !== 'AbortError' && !err.message?.includes('401')) {
          const backoffDelay = Math.min(2000, Math.pow(2, attempt) * 350 + Math.random() * 150);
          await new Promise((r) => setTimeout(r, backoffDelay));
          return execWithRetry(attempt + 1);
        }

        throw err;
      }
    };

    if (method === 'GET') {
      const promise = execWithRetry(0).finally(() => {
        this.inFlightGetRequests.delete(endpoint);
      });
      this.inFlightGetRequests.set(endpoint, promise);
      return promise;
    }

    return execWithRetry(0);
  }

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: any, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
