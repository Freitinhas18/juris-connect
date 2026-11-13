import type { ChatChannel, ChatMessage, CreateChannelInput } from "./communicationTypes";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } }); }
  catch { throw new Error("Não foi possível acessar a API. Confira se PostgreSQL e backend estão ativos."); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Falha na API (HTTP ${response.status}).`;
    throw new Error(error);
  }
  return body as T;
}

export function fetchChannels(): Promise<ChatChannel[]> { return request<ChatChannel[]>("/channels"); }
export function createChannel(input: CreateChannelInput): Promise<ChatChannel> { return request<ChatChannel>("/channels", { method: "POST", body: JSON.stringify(input) }); }
export function fetchMessages(channelId: string, options: { before?: string; limit?: number } = {}): Promise<ChatMessage[]> {
  const query = new URLSearchParams();
  if (options.before) query.set("before", options.before);
  query.set("limit", String(options.limit ?? 50));
  return request<ChatMessage[]>(`/channels/${encodeURIComponent(channelId)}/messages?${query.toString()}`);
}
