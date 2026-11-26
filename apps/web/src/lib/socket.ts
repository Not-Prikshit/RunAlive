import { io, Socket } from 'socket.io-client';
import { WS_URL } from './api';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket && socket.connected) {
    return socket;
  }

  // If already connecting, return existing instance
  if (socket && !socket.disconnected) {
    return socket;
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('runalive_socket_status', { detail: { connected: true } }));
    }
  });

  socket.on('disconnect', (reason) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('runalive_socket_status', { detail: { connected: false, reason } })
      );
    }
  });

  socket.on('reconnect_attempt', () => {
    // Refresh auth token on reconnect attempts in case it was refreshed
    const currentToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (socket) {
      socket.auth = { token: currentToken };
    }
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
