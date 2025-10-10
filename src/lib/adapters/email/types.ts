import type React from 'react';

export interface IEmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;
}

export interface SendEmailParams {
  to: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  react?: React.ReactElement; // React Email component
  html?: string;
  text?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  scheduledAt?: Date;
}

export interface SendEmailResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
}

export interface SendBulkEmailParams {
  recipients: Array<{
    email: string;
    variables?: Record<string, any>;
  }>;
  template: string;
  from?: string;
  subject: string;
  tags?: Record<string, string>;
}

export interface SendBulkResult {
  total: number;
  queued: number;
  failed: number;
  messageIds: string[];
  errors?: Array<{ email: string; error: string }>;
}

export interface DeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
  events: Array<{
    type: string;
    timestamp: Date;
    details?: any;
  }>;
}
