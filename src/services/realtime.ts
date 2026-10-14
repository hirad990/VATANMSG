import { io, type Socket } from 'socket.io-client';
import type { VatanMessage } from './api';

type ServerEvents = {
  'message:new': (message: VatanMessage) => void;
};

type ClientEvents = {
  'conversation:join': (
    input: { conversationId: string },
    callback?: (result: { ok: boolean; error?: string }) => void
  ) => void;
  'message:send': (
    input: { conversationId: string; body: string },
    callback?: (result: { ok: boolean; error?: string; message?: VatanMessage }) => void
  ) => void;
};

const API_BASE_URL = (process.env.EXPO_PUBLIC_VATAN_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export type VatanSocket = Socket<ServerEvents, ClientEvents>;

/** Create an authenticated socket. Keep the token in platform secure storage when wiring login. */
export function connectVatanSocket(token: string): VatanSocket {
  return io(API_BASE_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 700,
    timeout: 10_000
  });
}
