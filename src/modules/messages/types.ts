/**
 * Messaging Module - Types
 * 
 * TypeScript interfaces for the messaging system
 */

// ===========================
// Message Thread Types
// ===========================

export interface MessageThreadParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
}

export interface CreateThreadInput {
  participantIds: string[];
  subject?: string;
}

export interface ThreadListItem {
  id: string;
  subject: string | null;
  participants: MessageThreadParticipant[];
  lastMessageAt: Date;
  unreadCount: number;
  lastMessage?: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
  } | null;
  createdAt: Date;
}

export interface ThreadDetails extends ThreadListItem {
  messages: MessageListItem[];
  totalMessages: number;
}

export interface ListThreadsInput {
  userId: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface ListThreadsResult {
  threads: ThreadListItem[];
  total: number;
  hasMore: boolean;
}

// ===========================
// Message Types
// ===========================

export interface SendMessageInput {
  threadId: string;
  senderId: string;
  recipientId: string;
  body: string;
  attachmentIds?: string[];
}

export interface MessageListItem {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  recipientId: string;
  body: string;
  readAt: Date | null;
  attachments: MessageAttachmentInfo[];
  createdAt: Date;
  isOwnMessage: boolean;
}

export interface ListMessagesInput {
  threadId: string;
  userId: string;
  limit?: number;
  offset?: number;
}

export interface ListMessagesResult {
  messages: MessageListItem[];
  total: number;
  hasMore: boolean;
}

export interface MarkMessagesReadInput {
  messageIds: string[];
  userId: string;
}

export interface SearchMessagesInput {
  userId: string;
  query: string;
  threadId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

// ===========================
// Attachment Types
// ===========================

export interface MessageAttachmentInfo {
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;
  createdAt: Date;
}

export interface UploadAttachmentInput {
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface AttachmentUploadResult {
  attachment: MessageAttachmentInfo;
  uploadUrl?: string;
}

// ===========================
// Validation & Security Types
// ===========================

export interface CanMessageUserInput {
  senderId: string;
  recipientId: string;
}

export interface CanMessageUserResult {
  allowed: boolean;
  reason?: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remainingMessages: number;
  resetAt: Date;
}

// ===========================
// Service Response Types
// ===========================

export interface CreateThreadResult {
  thread: {
    id: string;
    subject: string | null;
    participantIds: string[];
    participants: MessageThreadParticipant[];
    lastMessageAt: Date;
    createdAt: Date;
  };
  existingThread: boolean;
}

export interface SendMessageResult {
  message: MessageListItem;
  threadUpdated: boolean;
}

export interface UnreadCountResult {
  total: number;
  byThread: Record<string, number>;
}
