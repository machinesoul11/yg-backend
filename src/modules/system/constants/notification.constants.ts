/**
 * Notification Constants
 * 
 * Templates and configuration for notification system
 */

import { NotificationType, NotificationPriority } from '../types';

/**
 * Notification bundling configuration
 * Defines which notification types can be bundled and their time windows
 */
export const NOTIFICATION_BUNDLING_CONFIG: Record<NotificationType, {
  canBundle: boolean;
  windowMinutes: number;
}> = {
  LICENSE: { canBundle: true, windowMinutes: 15 },
  PAYOUT: { canBundle: false, windowMinutes: 0 }, // Financial notifications shouldn't bundle
  ROYALTY: { canBundle: true, windowMinutes: 60 },
  PROJECT: { canBundle: true, windowMinutes: 30 },
  SYSTEM: { canBundle: false, windowMinutes: 0 }, // System notifications shouldn't bundle
  MESSAGE: { canBundle: true, windowMinutes: 5 },
};

/**
 * Notification expiry rules in days
 */
export const NOTIFICATION_EXPIRY_RULES = {
  READ_GENERAL: 30,        // Delete read notifications after 30 days
  READ_SYSTEM: 7,          // Delete read system notifications after 7 days
  UNREAD_LOW_PRIORITY: 90, // Delete old unread low priority notifications after 90 days
} as const;

/**
 * Priority-based email delivery settings
 */
export const PRIORITY_EMAIL_SETTINGS: Record<NotificationPriority, {
  sendImmediately: boolean;
  includeInDigest: boolean;
}> = {
  URGENT: { sendImmediately: true, includeInDigest: false },
  HIGH: { sendImmediately: true, includeInDigest: false },
  MEDIUM: { sendImmediately: false, includeInDigest: true },
  LOW: { sendImmediately: false, includeInDigest: true },
};

/**
 * Notification type display metadata
 */
export const NOTIFICATION_TYPE_METADATA: Record<NotificationType, {
  label: string;
  icon: string;
  defaultPriority: NotificationPriority;
  color: string;
}> = {
  LICENSE: {
    label: 'License',
    icon: '📄',
    defaultPriority: 'MEDIUM',
    color: 'blue',
  },
  PAYOUT: {
    label: 'Payout',
    icon: '💰',
    defaultPriority: 'HIGH',
    color: 'green',
  },
  ROYALTY: {
    label: 'Royalty',
    icon: '💎',
    defaultPriority: 'MEDIUM',
    color: 'purple',
  },
  PROJECT: {
    label: 'Project',
    icon: '📋',
    defaultPriority: 'MEDIUM',
    color: 'orange',
  },
  SYSTEM: {
    label: 'System',
    icon: '⚙️',
    defaultPriority: 'HIGH',
    color: 'gray',
  },
  MESSAGE: {
    label: 'Message',
    icon: '💬',
    defaultPriority: 'MEDIUM',
    color: 'blue',
  },
};

/**
 * Notification message templates
 * Use {variable} syntax for dynamic content
 */
export const NOTIFICATION_TEMPLATES = {
  // License notifications
  LICENSE_APPROVED: {
    title: 'License Approved',
    message: 'Your license for {assetName} has been approved.',
    type: 'LICENSE' as NotificationType,
    priority: 'HIGH' as NotificationPriority,
  },
  LICENSE_REJECTED: {
    title: 'License Rejected',
    message: 'Your license request for {assetName} has been rejected. Reason: {reason}',
    type: 'LICENSE' as NotificationType,
    priority: 'HIGH' as NotificationPriority,
  },
  LICENSE_EXPIRING: {
    title: 'License Expiring Soon',
    message: 'Your license for {assetName} expires in {days} days.',
    type: 'LICENSE' as NotificationType,
    priority: 'MEDIUM' as NotificationPriority,
  },
  LICENSE_EXPIRED: {
    title: 'License Expired',
    message: 'Your license for {assetName} has expired.',
    type: 'LICENSE' as NotificationType,
    priority: 'URGENT' as NotificationPriority,
  },
  
  // Payout notifications
  PAYOUT_COMPLETED: {
    title: 'Payout Completed',
    message: 'Your payout of {amount} has been processed successfully.',
    type: 'PAYOUT' as NotificationType,
    priority: 'HIGH' as NotificationPriority,
  },
  PAYOUT_FAILED: {
    title: 'Payout Failed',
    message: 'Your payout of {amount} could not be processed. Please update your payment information.',
    type: 'PAYOUT' as NotificationType,
    priority: 'URGENT' as NotificationPriority,
  },
  
  // Royalty notifications
  ROYALTY_STATEMENT_AVAILABLE: {
    title: 'Royalty Statement Available',
    message: 'Your royalty statement for {period} is now available.',
    type: 'ROYALTY' as NotificationType,
    priority: 'MEDIUM' as NotificationPriority,
  },
  
  // Project notifications
  PROJECT_INVITATION: {
    title: 'Project Invitation',
    message: '{inviterName} invited you to join {projectName}.',
    type: 'PROJECT' as NotificationType,
    priority: 'HIGH' as NotificationPriority,
  },
  PROJECT_STATUS_CHANGE: {
    title: 'Project Status Updated',
    message: '{projectName} status changed to {status}.',
    type: 'PROJECT' as NotificationType,
    priority: 'MEDIUM' as NotificationPriority,
  },
  
  // System notifications
  SYSTEM_MAINTENANCE: {
    title: 'Scheduled Maintenance',
    message: 'System maintenance scheduled for {date}. Expected downtime: {duration}.',
    type: 'SYSTEM' as NotificationType,
    priority: 'HIGH' as NotificationPriority,
  },
  SYSTEM_UPDATE: {
    title: 'New Features Available',
    message: '{featureName} is now available. {description}',
    type: 'SYSTEM' as NotificationType,
    priority: 'LOW' as NotificationPriority,
  },
  
  // Message notifications
  MESSAGE_RECEIVED: {
    title: 'New Message',
    message: '{senderName} sent you a message: {preview}',
    type: 'MESSAGE' as NotificationType,
    priority: 'MEDIUM' as NotificationPriority,
  },
  MESSAGES_RECEIVED_BUNDLED: {
    title: 'New Messages',
    message: 'You have {count} new messages in {threadSubject}',
    type: 'MESSAGE' as NotificationType,
    priority: 'MEDIUM' as NotificationPriority,
  },
} as const;

/**
 * Helper function to format notification template
 */
export function formatNotificationTemplate(
  templateKey: keyof typeof NOTIFICATION_TEMPLATES,
  variables: Record<string, string | number>
): { title: string; message: string; type: NotificationType; priority: NotificationPriority } {
  const template = NOTIFICATION_TEMPLATES[templateKey];
  
  let title = template.title;
  let message = template.message;
  
  // Replace variables in title and message
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    title = title.replace(placeholder, String(value));
    message = message.replace(placeholder, String(value));
  });
  
  return {
    title,
    message,
    type: template.type,
    priority: template.priority,
  };
}
