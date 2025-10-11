/**
 * Role Changed Email Template
 * Notifies users when their role has been changed by an admin
 */

import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';

interface RoleChangedProps {
  userName: string;
  userEmail: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
  changedByEmail: string;
  reason?: string;
  timestamp: string;
  supportEmail?: string;
}

export default function RoleChanged({
  userName = 'User',
  userEmail = 'user@example.com',
  oldRole = 'Viewer',
  newRole = 'Creator',
  changedBy = 'Admin',
  changedByEmail = 'admin@yesgoddess.com',
  reason,
  timestamp = new Date().toLocaleString(),
  supportEmail = 'support@yesgoddess.agency',
}: RoleChangedProps) {
  const previewText = `Your YES GODDESS role has been updated to ${newRole}`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>
        Your Role Has Been Updated
      </Heading>

      <Text style={emailStyles.text}>
        Hello {userName},
      </Text>

      <Text style={emailStyles.text}>
        Your role on the YES GODDESS platform has been changed by an administrator.
      </Text>

      <Section
        style={{
          background: EMAIL_COLORS.goldLight,
          borderLeft: `4px solid ${EMAIL_COLORS.gold}`,
          padding: '16px',
          margin: '24px 0',
          borderRadius: '4px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.textMuted,
                }}
              >
                Previous Role:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: EMAIL_COLORS.text,
                  textAlign: 'right',
                }}
              >
                {oldRole}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.textMuted,
                }}
              >
                New Role:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: EMAIL_COLORS.gold,
                  textAlign: 'right',
                }}
              >
                {newRole}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.textMuted,
                }}
              >
                Changed By:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.text,
                  textAlign: 'right',
                }}
              >
                {changedBy} ({changedByEmail})
              </td>
            </tr>
            <tr>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.textMuted,
                }}
              >
                Date & Time:
              </td>
              <td
                style={{
                  padding: '8px 0',
                  fontSize: '14px',
                  color: EMAIL_COLORS.text,
                  textAlign: 'right',
                }}
              >
                {timestamp}
              </td>
            </tr>
          </tbody>
        </table>

        {reason && (
          <>
            <hr
              style={{
                border: 'none',
                borderTop: `1px solid ${EMAIL_COLORS.border}`,
                margin: '16px 0',
              }}
            />
            <Text
              style={{
                fontSize: '14px',
                color: EMAIL_COLORS.textMuted,
                margin: '8px 0',
              }}
            >
              <strong>Reason:</strong>
            </Text>
            <Text
              style={{
                fontSize: '14px',
                color: EMAIL_COLORS.text,
                margin: '8px 0',
                fontStyle: 'italic',
              }}
            >
              {reason}
            </Text>
          </>
        )}
      </Section>

      <Text style={emailStyles.text}>
        Your new role grants you different permissions and access levels on the platform. 
        You may need to log out and log back in for the changes to take full effect.
      </Text>

      <Section
        style={{
          margin: '32px 0',
          textAlign: 'center',
        }}
      >
        <Link
          href={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`}
          style={{
            backgroundColor: EMAIL_COLORS.gold,
            color: '#FFFFFF',
            padding: '12px 32px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '16px',
            display: 'inline-block',
          }}
        >
          Go to Dashboard
        </Link>
      </Section>

      <hr
        style={{
          border: 'none',
          borderTop: `1px solid ${EMAIL_COLORS.border}`,
          margin: '32px 0',
        }}
      />

      <Text
        style={{
          fontSize: '14px',
          lineHeight: '1.6',
          color: EMAIL_COLORS.textMuted,
          margin: '16px 0',
        }}
      >
        <strong>If you did not expect this change:</strong>
        <br />
        If you believe this role change was made in error or without your knowledge, 
        please contact our support team immediately at{' '}
        <Link
          href={`mailto:${supportEmail}`}
          style={{
            color: EMAIL_COLORS.gold,
            textDecoration: 'underline',
          }}
        >
          {supportEmail}
        </Link>
      </Text>

      <Text
        style={{
          fontSize: '12px',
          color: EMAIL_COLORS.textMuted,
          margin: '24px 0 0 0',
          textAlign: 'center',
        }}
      >
        This is an automated notification from YES GODDESS.
        <br />
        For security reasons, role changes are logged and audited.
      </Text>
    </EmailLayout>
  );
}
