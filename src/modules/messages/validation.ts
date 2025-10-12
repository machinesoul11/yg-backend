/**
 * Messaging Module - Validation Schemas
 * 
 * Zod schemas for input validation
 */

import { z } from 'zod';

// ===========================
// Thread Validation Schemas
// ===========================

export const CreateThreadSchema = z.object({
  participantIds: z
    .array(z.string().cuid())
    .min(2, 'Thread must have at least 2 participants')
    .max(10, 'Thread cannot have more than 10 participants'),
  subject: z.string().max(255).optional(),
});

export const GetThreadSchema = z.object({
  threadId: z.string().cuid(),
});

export const ListThreadsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  includeArchived: z.boolean().default(false),
});

export const ArchiveThreadSchema = z.object({
  threadId: z.string().cuid(),
});

// ===========================
// Message Validation Schemas
// ===========================

export const SendMessageSchema = z.object({
  threadId: z.string().cuid(),
  body: z.string().min(1, 'Message body cannot be empty').max(10000, 'Message too long'),
  recipientId: z.string().cuid(),
  attachmentIds: z.array(z.string().cuid()).max(5, 'Maximum 5 attachments per message').optional(),
});

export const ListMessagesSchema = z.object({
  threadId: z.string().cuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const MarkMessagesReadSchema = z.object({
  messageIds: z.array(z.string().cuid()).min(1).max(100),
});

export const MarkMessageReadSchema = z.object({
  messageId: z.string().cuid(),
});

export const MarkThreadReadSchema = z.object({
  threadId: z.string().cuid(),
});

export const SearchMessagesSchema = z.object({
  query: z.string().min(1).max(500),
  threadId: z.string().cuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ===========================
// Attachment Validation Schemas
// ===========================

export const UploadAttachmentSchema = z.object({
  messageId: z.string().cuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB max
  mimeType: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type'),
});

export const GetAttachmentSchema = z.object({
  attachmentId: z.string().cuid(),
});

export const DeleteAttachmentSchema = z.object({
  attachmentId: z.string().cuid(),
});

// ===========================
// Type Exports
// ===========================

export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;
export type GetThreadInput = z.infer<typeof GetThreadSchema>;
export type ListThreadsInput = z.infer<typeof ListThreadsSchema>;
export type ArchiveThreadInput = z.infer<typeof ArchiveThreadSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type ListMessagesInput = z.infer<typeof ListMessagesSchema>;
export type MarkMessagesReadInput = z.infer<typeof MarkMessagesReadSchema>;
export type MarkMessageReadInput = z.infer<typeof MarkMessageReadSchema>;
export type MarkThreadReadInput = z.infer<typeof MarkThreadReadSchema>;
export type SearchMessagesInput = z.infer<typeof SearchMessagesSchema>;
export type UploadAttachmentInput = z.infer<typeof UploadAttachmentSchema>;
export type GetAttachmentInput = z.infer<typeof GetAttachmentSchema>;
export type DeleteAttachmentInput = z.infer<typeof DeleteAttachmentSchema>;
