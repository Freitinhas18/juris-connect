import type { ChatMessage, CreateChannelInput } from "@juris-connect/shared";

export type { ChatMessage, CreateChannelInput };
export type ChatChannel = { id: string; name: string; isPrivate: boolean; createdAt: string };
export type ApiError = { error?: string; details?: unknown };
