import { z } from "zod";

export const APP_NAME = "juris-connect";

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isPrivate: z.boolean().default(false),
});

export const historyQuerySchema = z.object({
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export const SOCKET_EVENTS = {
  joinChannel: "channel:join",
  sendMessage: "message:send",
  newMessage: "message:new",
} as const;