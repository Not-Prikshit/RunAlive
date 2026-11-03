// apps/mobile/src/lib/socket.ts
// Realtime Socket.IO client manager with auth token injection & lifecycle hooks.

import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

const SOCKET_URL =
  process.env['EXPO_PUBLIC_SOCKET_URL'] ??
  (process.env['EXPO_PUBLIC_API_URL']
    ? process.env['EXPO_PUBLIC_API_URL'].replace(/\/api\/v1\/?$/, '')
    : 'http://localhost:3000');

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const { accessToken } = useAuthStore.getState();

    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        token: accessToken,
      },
    });

    socket.on('connect_error', async (err) => {
      // If unauthorized, token might be expired
      if (err.message.includes('UNAUTHORIZED')) {
        const store = useAuthStore.getState();
        if (store.refreshToken) {
          try {
            await store.restore();
            const newToken = useAuthStore.getState().accessToken;
            if (newToken && socket) {
              socket.auth = { token: newToken };
              socket.connect();
            }
          } catch {
            // Re-auth failed
          }
        }
      }
    });
  }

  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    s.auth = { token: accessToken };
  }
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
