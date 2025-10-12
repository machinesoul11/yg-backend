/**
 * Data Privacy Service
 * 
 * Handles GDPR compliance, data export, and retention policies
 */

import { PrismaClient } from '@prisma/client';
import { storageProvider } from '@/lib/storage';
import { emailService } from '@/lib/services/email/email.service';

export interface UserMessageExport {
  metadata: {
    userId: string;
    exportedAt: string;
    totalThreads: number;
    totalMessages: number;
  };
  threads: Array<{
    threadId: string;
    subject: string | null;
    participants: Array<{
      userId: string;
      name: string;
    }>;
    createdAt: string;
    messages: Array<{
      messageId: string;
      senderId: string;
      senderName: string;
      recipientId: string;
      body: string;
      sentAt: string;
      readAt: string | null;
      attachments: Array<{
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageKey: string;
      }>;
    }>;
  }>;
}

const MESSAGE_RETENTION_YEARS = 2;
const EXPORT_EXPIRATION_HOURS = 48;
const EXPORT_CLEANUP_DAYS = 7;

export class DataPrivacyService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Export all message data for a user (GDPR compliance)
   * 
   * @param userId - User ID to export data for
   * @returns Export file information
   */
  async exportUserMessageData(userId: string): Promise<{
    exportId: string;
    downloadUrl: string;
    expiresAt: Date;
  }> {
    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Compile all message data
    const exportData = await this.compileUserMessageData(userId, user.name || 'User');

    // Generate export file
    const exportFileName = `message-data-export-${userId}-${Date.now()}.json`;
    const exportContent = JSON.stringify(exportData, null, 2);

    // Upload to private storage
    const uploadResult = await storageProvider.upload({
      key: `exports/messages/${exportFileName}`,
      file: Buffer.from(exportContent),
      contentType: 'application/json',
      metadata: { userId, exportType: 'messages' },
    });

    // Generate signed URL for download (48 hour expiration)
    const downloadUrlResult = await storageProvider.getDownloadUrl({
      key: uploadResult.key,
      expiresIn: EXPORT_EXPIRATION_HOURS * 3600,
    });

    // TODO: Send email notification when data-export template is created
    // For now, we'll log it
    console.log(`[DataExport] Message data export ready for user ${userId}: ${downloadUrlResult.url}`);
    
    // await emailService.sendTransactional({
    //   to: user.email,
    //   subject: 'Your Message Data Export is Ready',
    //   template: 'data-export-ready',
    //   variables: {
    //     userName: user.name || 'User',
    //     downloadUrl: downloadUrlResult.url,
    //     expiresAt: new Date(Date.now() + EXPORT_EXPIRATION_HOURS * 3600 * 1000).toISOString(),
    //     exportType: 'Messages',
    //   },
    // });

    // Schedule cleanup of export file after 7 days
    // TODO: Implement with background job
    // await messageExportCleanupQueue.add(
    //   'cleanup',
    //   { key: uploadResult.key },
    //   { delay: EXPORT_CLEANUP_DAYS * 24 * 3600 * 1000 }
    // );

    return {
      exportId: uploadResult.key,
      downloadUrl: downloadUrlResult.url,
      expiresAt: new Date(Date.now() + EXPORT_EXPIRATION_HOURS * 3600 * 1000),
    };
  }

  /**
   * Compile all message data for a user
   */
  private async compileUserMessageData(
    userId: string,
    userName: string
  ): Promise<UserMessageExport> {
    // Get all threads user participated in
    const allThreads = await this.prisma.messageThread.findMany({
      where: {
        deletedAt: null, // Include deleted messages in export
      },
      include: {
        messages: {
          include: {
            sender: {
              select: { id: true, name: true },
            },
            recipient: {
              select: { id: true, name: true },
            },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Filter threads where user is participant
    const userThreads = allThreads.filter((thread) => {
      const participants = thread.participantsJson as string[];
      return participants.includes(userId);
    });

    // Get participant details for all threads
    const threadsWithDetails = await Promise.all(
      userThreads.map(async (thread) => {
        const participantIds = thread.participantsJson as string[];
        const participants = await this.prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, name: true },
        });

        return {
          threadId: thread.id,
          subject: thread.subject,
          participants: participants.map((p) => ({
            userId: p.id,
            name: p.name || 'Unknown User',
          })),
          createdAt: thread.createdAt.toISOString(),
          messages: thread.messages.map((msg) => ({
            messageId: msg.id,
            senderId: msg.senderId,
            senderName: msg.sender.name || 'Unknown',
            recipientId: msg.recipientId,
            body: msg.body,
            sentAt: msg.createdAt.toISOString(),
            readAt: msg.readAt?.toISOString() || null,
            attachments: msg.attachments.map((att) => ({
              fileName: att.fileName,
              fileSize: att.fileSize,
              mimeType: att.mimeType,
              storageKey: att.storageKey,
            })),
          })),
        };
      })
    );

    const totalMessages = threadsWithDetails.reduce(
      (sum, thread) => sum + thread.messages.length,
      0
    );

    return {
      metadata: {
        userId,
        exportedAt: new Date().toISOString(),
        totalThreads: threadsWithDetails.length,
        totalMessages,
      },
      threads: threadsWithDetails,
    };
  }

  /**
   * Delete user message data on account closure
   * 
   * @param userId - User ID to delete data for
   */
  async deleteUserMessageData(userId: string): Promise<{
    threadsRemoved: number;
    messagesSoftDeleted: number;
    attachmentsDeleted: number;
  }> {
    let threadsRemoved = 0;
    let messagesSoftDeleted = 0;
    let attachmentsDeleted = 0;

    // Find all threads where user is participant
    const allThreads = await this.prisma.messageThread.findMany({
      where: { deletedAt: null },
      select: { id: true, participantsJson: true },
    });

    const userThreadIds = allThreads
      .filter((thread) => {
        const participants = thread.participantsJson as string[];
        return participants.includes(userId);
      })
      .map((thread) => thread.id);

    // Soft delete all messages sent by user
    const messageDeleteResult = await this.prisma.message.updateMany({
      where: {
        OR: [
          { senderId: userId },
          { recipientId: userId },
        ],
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    messagesSoftDeleted = messageDeleteResult.count;

    // Remove user from thread participants
    for (const thread of allThreads) {
      const participants = thread.participantsJson as string[];
      if (participants.includes(userId)) {
        const updatedParticipants = participants.filter((id) => id !== userId);

        if (updatedParticipants.length === 0) {
          // No participants left, delete the thread
          await this.prisma.messageThread.update({
            where: { id: thread.id },
            data: { deletedAt: new Date() },
          });
          threadsRemoved++;
        } else {
          // Update participants list
          await this.prisma.messageThread.update({
            where: { id: thread.id },
            data: { participantsJson: updatedParticipants },
          });
        }
      }
    }

    // Get attachment storage keys before deletion
    const attachmentsToDelete = await this.prisma.messageAttachment.findMany({
      where: {
        message: {
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        },
      },
      select: { id: true, storageKey: true },
    });

    // Delete attachments from storage
    for (const attachment of attachmentsToDelete) {
      try {
        await storageProvider.delete(attachment.storageKey);
      } catch (error) {
        console.error(`Failed to delete attachment ${attachment.id}:`, error);
      }
    }

    // Delete attachment records
    const attachmentDeleteResult = await this.prisma.messageAttachment.deleteMany({
      where: {
        id: { in: attachmentsToDelete.map((a) => a.id) },
      },
    });
    attachmentsDeleted = attachmentDeleteResult.count;

    return {
      threadsRemoved,
      messagesSoftDeleted,
      attachmentsDeleted,
    };
  }

  /**
   * Clean up old deleted messages (retention policy)
   * Should be run as a background job
   * 
   * @returns Number of messages permanently deleted
   */
  async cleanupOldDeletedMessages(): Promise<{
    messagesDeleted: number;
    attachmentsDeleted: number;
  }> {
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() - MESSAGE_RETENTION_YEARS);

    // Find messages deleted more than 2 years ago
    const oldDeletedMessages = await this.prisma.message.findMany({
      where: {
        deletedAt: {
          lt: retentionDate,
        },
      },
      select: { id: true },
      take: 1000, // Process in batches
    });

    if (oldDeletedMessages.length === 0) {
      return { messagesDeleted: 0, attachmentsDeleted: 0 };
    }

    const messageIds = oldDeletedMessages.map((m) => m.id);

    // Get attachments for these messages
    const attachments = await this.prisma.messageAttachment.findMany({
      where: {
        messageId: { in: messageIds },
      },
      select: { id: true, storageKey: true },
    });

    // Delete attachments from storage
    for (const attachment of attachments) {
      try {
        await storageProvider.delete(attachment.storageKey);
      } catch (error) {
        console.error(`Failed to delete attachment ${attachment.id}:`, error);
      }
    }

    // Delete attachment records
    const attachmentDeleteResult = await this.prisma.messageAttachment.deleteMany({
      where: {
        messageId: { in: messageIds },
      },
    });

    // Permanently delete messages
    const messageDeleteResult = await this.prisma.message.deleteMany({
      where: {
        id: { in: messageIds },
      },
    });

    console.log(
      `[MessageRetention] Deleted ${messageDeleteResult.count} messages and ${attachmentDeleteResult.count} attachments older than ${MESSAGE_RETENTION_YEARS} years`
    );

    return {
      messagesDeleted: messageDeleteResult.count,
      attachmentsDeleted: attachmentDeleteResult.count,
    };
  }
}
