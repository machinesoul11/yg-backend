/**
 * Message Digest Email
 * 
 * Sent as a daily or weekly summary of unread messages
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from '@react-email/components';
import { Button } from '../components/Button';
import { EmailLayout } from '../components/EmailLayout';
import { EMAIL_COLORS } from '../styles/brand';

export interface MessageThread {
  threadId: string;
  threadSubject: string | null;
  messageCount: number;
  senders: string[];
  latestMessage: {
    senderName: string;
    body: string;
    createdAt: Date;
  };
}

export interface MessageDigestEmailProps {
  recipientName?: string;
  frequency: 'daily' | 'weekly';
  threads: MessageThread[];
  totalUnreadCount: number;
  inboxUrl: string;
}

export const MessageDigestEmail = ({
  recipientName = 'there',
  frequency,
  threads,
  totalUnreadCount,
  inboxUrl,
}: MessageDigestEmailProps) => {
  const previewText = `You have ${totalUnreadCount} unread message${
    totalUnreadCount === 1 ? '' : 's'
  }`;

  const frequencyText = frequency === 'daily' ? 'today' : 'this week';

  return (
    <EmailLayout previewText={previewText}>
      <Heading
        style={{
          fontSize: '24px',
          fontWeight: '600',
          color: EMAIL_COLORS.VOID,
          marginTop: '0',
          marginBottom: '24px',
        }}
      >
        Message Digest
      </Heading>

      <Text
        style={{
          fontSize: '16px',
          lineHeight: '24px',
          color: EMAIL_COLORS.VOID,
          marginBottom: '24px',
        }}
      >
        Hi {recipientName},
      </Text>

      <Text
        style={{
          fontSize: '16px',
          lineHeight: '24px',
          color: EMAIL_COLORS.VOID,
          marginBottom: '24px',
        }}
      >
        You have <strong>{totalUnreadCount}</strong> unread message
        {totalUnreadCount === 1 ? '' : 's'} {frequencyText}:
      </Text>

      {threads.map((thread, index) => (
        <div key={thread.threadId}>
          <Section
            style={{
              backgroundColor: EMAIL_COLORS.BONE,
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <Text
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: EMAIL_COLORS.VOID,
                marginTop: '0',
                marginBottom: '8px',
              }}
            >
              {thread.threadSubject || 'Conversation'} •{' '}
              <span style={{ fontWeight: '400', color: '#666' }}>
                {thread.messageCount} new message
                {thread.messageCount === 1 ? '' : 's'}
              </span>
            </Text>

            <Text
              style={{
                fontSize: '13px',
                color: '#666',
                marginTop: '0',
                marginBottom: '8px',
              }}
            >
              From: {thread.senders.join(', ')}
            </Text>

            <Text
              style={{
                fontSize: '14px',
                lineHeight: '20px',
                color: EMAIL_COLORS.VOID,
                marginTop: '8px',
                marginBottom: '0',
                fontStyle: 'italic',
              }}
            >
              "{thread.latestMessage.body}"
            </Text>

            <Text
              style={{
                fontSize: '12px',
                color: '#999',
                marginTop: '8px',
                marginBottom: '0',
              }}
            >
              — {thread.latestMessage.senderName}
            </Text>
          </Section>
        </div>
      ))}

      <Button href={inboxUrl}>View All Messages</Button>

      <Hr
        style={{
          borderColor: '#e5e7eb',
          marginTop: '32px',
          marginBottom: '24px',
        }}
      />

      <Text
        style={{
          fontSize: '14px',
          lineHeight: '20px',
          color: '#666',
        }}
      >
        You're receiving this {frequency} digest because you have unread
        messages. You can change your notification preferences in your account
        settings.
      </Text>
    </EmailLayout>
  );
};

MessageDigestEmail.PreviewProps = {
  recipientName: 'Alex',
  frequency: 'daily',
  totalUnreadCount: 5,
  threads: [
    {
      threadId: 'thread-1',
      threadSubject: 'Project Collaboration Opportunity',
      messageCount: 2,
      senders: ['Jordan Smith', 'Taylor Johnson'],
      latestMessage: {
        senderName: 'Jordan Smith',
        body:
          'I love your work and would like to discuss a potential collaboration. Are you available for a quick call this week?',
        createdAt: new Date(),
      },
    },
    {
      threadId: 'thread-2',
      threadSubject: null,
      messageCount: 3,
      senders: ['Morgan Lee'],
      latestMessage: {
        senderName: 'Morgan Lee',
        body: 'Thanks for getting back to me! I have a few follow-up questions about the licensing terms.',
        createdAt: new Date(),
      },
    },
  ],
  inboxUrl: 'https://app.yesgoddess.com/messages',
} as MessageDigestEmailProps;

export default MessageDigestEmail;
