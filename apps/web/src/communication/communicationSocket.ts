import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type ChatMessage } from "@juris-connect/shared";

type Ack = { ok: true } | { ok: false; error: string };
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3333";
let activeSocket: Socket | null = null;

export function connectCommunicationSocket(): Socket {
  if (activeSocket) return activeSocket;
  activeSocket = io(SOCKET_URL, { withCredentials: true, autoConnect: false, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 8000 });
  activeSocket.connect();
  return activeSocket;
}

export function joinChannel(socket: Socket, channelId: string): Promise<void> {
  return new Promise((resolve, reject) => socket.timeout(10_000).emit(SOCKET_EVENTS.joinChannel, channelId, (timeout: Error | null, ack: Ack) => timeout ? reject(new Error("Tempo esgotado ao entrar no canal.")) : ack?.ok ? resolve() : reject(new Error(ack?.error ?? "Não foi possível entrar no canal."))));
}

export function sendMessage(socket: Socket, channelId: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => socket.timeout(10_000).emit(SOCKET_EVENTS.sendMessage, { channelId, content }, (timeout: Error | null, ack: Ack) => timeout ? reject(new Error("Tempo esgotado ao enviar. Verifique a conexão e tente novamente.")) : ack?.ok ? resolve() : reject(new Error(ack?.error ?? "Não foi possível enviar a mensagem."))));
}

export function listenForMessages(socket: Socket, listener: (message: ChatMessage) => void): () => void {
  const handler = (message: ChatMessage) => listener(message);
  socket.on(SOCKET_EVENTS.newMessage, handler);
  return () => { socket.off(SOCKET_EVENTS.newMessage, handler); };
}

export function closeCommunicationSocket(socket: Socket): void {
  if (activeSocket !== socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  activeSocket = null;
}
