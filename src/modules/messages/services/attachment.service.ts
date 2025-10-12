/**
 * Attachment Service
 * 
 * Manages message attachments and storage integration
 */

import { PrismaClient } from '@prisma/client';
import {
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  InvalidAttachmentTypeError,
  MessageAccessDeniedError,
} from '../errors';
import type {
  MessageAttachmentInfo,
  UploadAttachmentInput,
  AttachmentUploadResult,
} from '../types';

// Import storage provider
import { storageProvider } from '@/lib/storage';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

export class AttachmentService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create attachment record after file upload
   */
  async createAttachment(
    userId: string,
    input: UploadAttachmentInput
  ): Promise<MessageAttachmentInfo> {
    const { messageId, storageKey, fileName, fileSize, mimeType } = input;

    // Verify message exists and user has access
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new AttachmentNotFoundError(messageId);
    }

    // Verify user is sender
    if (message.senderId !== userId) {
      throw new MessageAccessDeniedError(messageId);
    }

    // Validate file size
    if (fileSize > MAX_ATTACHMENT_SIZE) {
      throw new AttachmentTooLargeError(MAX_ATTACHMENT_SIZE);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new InvalidAttachmentTypeError(mimeType);
    }

    // Create attachment record
    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId,
        storageKey,
        fileName,
        fileSize,
        mimeType,
      },
    });

    return {
      id: attachment.id,
      messageId: attachment.messageId,
      storageKey: attachment.storageKey,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Get attachment with download URL
   */
  async getAttachment(
    userId: string,
    attachmentId: string
  ): Promise<MessageAttachmentInfo> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            senderId: true,
            recipientId: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new AttachmentNotFoundError(attachmentId);
    }

    // Verify user has access (sender or recipient)
    if (
      attachment.message.senderId !== userId &&
      attachment.message.recipientId !== userId
    ) {
      throw new MessageAccessDeniedError(attachment.messageId);
    }

    // Generate signed download URL (15 minutes)
    const { url } = await storageProvider.getDownloadUrl({
      key: attachment.storageKey,
      expiresIn: 900,
      filename: attachment.fileName,
    });

    return {
      id: attachment.id,
      messageId: attachment.messageId,
      storageKey: attachment.storageKey,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      downloadUrl: url,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Get all attachments for a message with download URLs
   */
  async getMessageAttachments(
    userId: string,
    messageId: string
  ): Promise<MessageAttachmentInfo[]> {
    // Verify user has access to message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        senderId: true,
        recipientId: true,
      },
    });

    if (!message) {
      throw new AttachmentNotFoundError(messageId);
    }

    if (message.senderId !== userId && message.recipientId !== userId) {
      throw new MessageAccessDeniedError(messageId);
    }

    // Get attachments
    const attachments = await this.prisma.messageAttachment.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });

    // Generate download URLs for all attachments
    return await Promise.all(
      attachments.map(async (att) => {
        const { url } = await storageProvider.getDownloadUrl({
          key: att.storageKey,
          expiresIn: 900,
          filename: att.fileName,
        });

        return {
          id: att.id,
          messageId: att.messageId,
          storageKey: att.storageKey,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          downloadUrl: url,
          createdAt: att.createdAt,
        };
      })
    );
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            senderId: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new AttachmentNotFoundError(attachmentId);
    }

    // Only message sender can delete attachments
    if (attachment.message.senderId !== userId) {
      throw new MessageAccessDeniedError(attachment.messageId);
    }

    // Delete from storage
    await storageProvider.delete(attachment.storageKey);

    // Delete from database
    await this.prisma.messageAttachment.delete({
      where: { id: attachmentId },
    });
  }

  /**
   * Generate upload URL for attachment
   */
  async generateUploadUrl(
    userId: string,
    messageId: string,
    fileName: string,
    contentType: string,
    fileSize: number
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    // Verify message exists and user is sender
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new AttachmentNotFoundError(messageId);
    }

    if (message.senderId !== userId) {
      throw new MessageAccessDeniedError(messageId);
    }

    // Validate file size
    if (fileSize > MAX_ATTACHMENT_SIZE) {
      throw new AttachmentTooLargeError(MAX_ATTACHMENT_SIZE);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new InvalidAttachmentTypeError(contentType);
    }

    // Generate storage key
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `messages/${message.threadId}/${messageId}/${timestamp}-${sanitizedFileName}`;

    // Generate upload URL
    const { uploadUrl } = await storageProvider.getUploadUrl({
      key: storageKey,
      contentType,
      expiresIn: 900, // 15 minutes
      maxSizeBytes: fileSize,
    });

    return {
      uploadUrl,
      storageKey,
    };
  }
}
