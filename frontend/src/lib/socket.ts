import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL, {
      auth: (cb) => {
        cb({ token: localStorage.getItem('accessToken') ?? '' });
      },
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) {
      resolve();
      return;
    }
    s.once('connect', () => resolve());
    s.once('connect_error', (err) => reject(err));
    s.connect();
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
