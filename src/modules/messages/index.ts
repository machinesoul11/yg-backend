/**
 * Messaging Module
 * 
 * Handles user-to-user messaging, threads, and attachments
 */

export * from './types';
export * from './errors';
export * from './services';

// Router
export { messagesRouter } from './router';

// Re-export validation schemas (not types to avoid conflicts)
export {
  CreateThreadSchema,
  GetThreadSchema,
  ListThreadsSchema,
  ArchiveThreadSchema,
  SendMessageSchema,
  ListMessagesSchema,
  MarkMessagesReadSchema,
  MarkThreadReadSchema,
  SearchMessagesSchema,
  UploadAttachmentSchema,
  GetAttachmentSchema,
  DeleteAttachmentSchema,
} from './validation';

/**
 * Messages Module
 * 
 * Exports all messaging-related services, types, and utilities
 */

export { ThreadService } from './services/thread.service';
export { MessageService } from './services/message.service';
export { AttachmentService } from './services/attachment.service';
export { MessageNotificationService, messageNotificationQueue } from './services/notification.service';
