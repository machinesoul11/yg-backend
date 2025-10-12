/**
 * New Message Notification Email
 * 
 * Sent when a user receives a new message
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
} from '@react-email/components';
import { Button } from '../components/Button';
import { EmailLayout } from '../components/EmailLayout';
import { EMAIL_COLORS } from '../styles/brand';

export interface NewMessageEmailProps {
  recipientName?: string;
  senderName: string;
  senderAvatar?: string;
  threadSubject?: string;
  messagePreview: string;
  threadUrl: string;
}

export const NewMessageEmail = ({
  recipientName = 'there',
  senderName,
  threadSubject,
  messagePreview,
  threadUrl,
}: NewMessageEmailProps) => {
  const previewText = threadSubject
    ? `New message from ${senderName} in "${threadSubject}"`
    : `New message from ${senderName}`;

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
        New Message
      </Heading>

      <Text
        style={{
          fontSize: '16px',
          lineHeight: '24px',
          color: EMAIL_COLORS.VOID,
          marginBottom: '16px',
        }}
      >
        Hi {recipientName},
      </Text>

      <Text
        style={{
          fontSize: '16px',
          lineHeight: '24px',
          color: EMAIL_COLORS.VOID,
          marginBottom: '8px',
        }}
      >
        <strong>{senderName}</strong> sent you a message
        {threadSubject && (
          <>
            {' '}in <strong>"{threadSubject}"</strong>
          </>
        )}
        :
      </Text>

      <Section
        style={{
          backgroundColor: EMAIL_COLORS.BONE,
          borderLeft: `4px solid ${EMAIL_COLORS.ALTAR}`,
          padding: '16px',
          marginBottom: '24px',
          borderRadius: '4px',
        }}
      >
        <Text
          style={{
            fontSize: '14px',
            lineHeight: '20px',
            color: EMAIL_COLORS.VOID,
            margin: '0',
            fontStyle: 'italic',
          }}
        >
          {messagePreview}
        </Text>
      </Section>

      <Button href={threadUrl}>View Message</Button>

      <Text
        style={{
          fontSize: '14px',
          lineHeight: '20px',
          color: '#666',
          marginTop: '24px',
        }}
      >
        Reply directly from your dashboard to continue the conversation.
      </Text>
    </EmailLayout>
  );
};

NewMessageEmail.PreviewProps = {
  recipientName: 'Alex',
  senderName: 'Jordan Smith',
  threadSubject: 'Project Collaboration Opportunity',
  messagePreview:
    'I love your work and would like to discuss a potential collaboration on an upcoming project. Are you available for a quick call this week?',
  threadUrl: 'https://app.yesgoddess.com/messages/thread-123',
} as NewMessageEmailProps;

export default NewMessageEmail;
