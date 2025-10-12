import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface LicenseExpiry90DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
}

export const LicenseExpiry90DayNotice = ({
  userName,
  licenseName,
  brandName,
  expiryDate,
  daysRemaining,
  renewalUrl,
  licenseUrl,
  autoRenewEnabled = false,
  recipientRole = 'brand',
}: LicenseExpiry90DayNoticeProps) => {
  const previewText = `License expiry notice: ${licenseName} — ${daysRemaining} days remaining`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>License Expiry Notice</Heading>

          <Text style={text}>Dear {userName},</Text>

          <Text style={text}>
            This notice confirms that the license for <strong>{licenseName}</strong>
            {recipientRole === 'brand' ? '' : ` with ${brandName}`} will expire on{' '}
            <strong>{expiryDate}</strong>.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>Days Remaining</Text>
            <Text style={infoValue}>{daysRemaining}</Text>
          </Section>

          {recipientRole === 'brand' && (
            <>
              <Text style={text}>
                You have 90 days to review your licensing arrangement and determine whether
                renewal is appropriate for your ongoing needs.
              </Text>

              {autoRenewEnabled ? (
                <Section style={noteBox}>
                  <Text style={noteText}>
                    <strong>Auto-Renewal Enabled:</strong> This license is configured for
                    automatic renewal. No action is required unless you wish to modify terms or
                    disable auto-renewal.
                  </Text>
                </Section>
              ) : (
                <Text style={text}>
                  If you wish to maintain access to this asset beyond the expiry date, you may
                  initiate the renewal process at your convenience.
                </Text>
              )}

              {renewalUrl && (
                <Section style={buttonContainer}>
                  <Button style={button} href={renewalUrl}>
                    Review Renewal Options
                  </Button>
                </Section>
              )}
            </>
          )}

          {recipientRole === 'creator' && (
            <>
              <Text style={text}>
                This license is scheduled to conclude on the date specified. You will receive
                additional notices as the expiry date approaches.
              </Text>

              <Text style={text}>
                Royalty payments for this license will continue through the end of the term. If
                the license is renewed, you will be notified accordingly.
              </Text>
            </>
          )}

          <Section style={buttonContainer}>
            <Button style={buttonSecondary} href={licenseUrl}>
              View License Details
            </Button>
          </Section>

          <Text style={footer}>
            This is an automated notice. Further reminders will be sent at 60 days and 30 days
            before expiry.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseExpiry90DayNotice;

// Brand-aligned styling following YES GODDESS guidelines
const main = {
  backgroundColor: '#0A0A0A', // VOID
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container = {
  backgroundColor: '#F8F6F3', // BONE
  margin: '0 auto',
  padding: '48px 32px',
  maxWidth: '600px',
};

const h1 = {
  color: '#0A0A0A', // VOID
  fontSize: '28px',
  fontWeight: '300',
  letterSpacing: '0.02em',
  lineHeight: '1.3',
  margin: '0 0 32px',
  textTransform: 'uppercase' as const,
};

const text = {
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: '400',
  lineHeight: '1.6',
  margin: '0 0 20px',
};

const infoBox = {
  backgroundColor: '#C4C0B8', // SANCTUM
  borderRadius: '4px',
  padding: '24px',
  margin: '32px 0',
  textAlign: 'center' as const,
};

const infoLabel = {
  color: '#0A0A0A',
  fontSize: '12px',
  fontWeight: '400',
  letterSpacing: '0.1em',
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
};

const infoValue = {
  color: '#0A0A0A',
  fontSize: '32px',
  fontWeight: '300',
  letterSpacing: '0.02em',
  margin: '0',
};

const noteBox = {
  backgroundColor: '#B8A888', // ALTAR (used sparingly for emphasis)
  borderLeft: '4px solid #0A0A0A',
  padding: '20px',
  margin: '24px 0',
};

const noteText = {
  color: '#0A0A0A',
  fontSize: '14px',
  fontWeight: '400',
  lineHeight: '1.6',
  margin: '0',
};

const buttonContainer = {
  margin: '32px 0',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#0A0A0A',
  borderRadius: '4px',
  color: '#F8F6F3',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '400',
  letterSpacing: '0.08em',
  padding: '16px 32px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
};

const buttonSecondary = {
  backgroundColor: 'transparent',
  border: '1px solid #0A0A0A',
  borderRadius: '4px',
  color: '#0A0A0A',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '400',
  letterSpacing: '0.08em',
  padding: '16px 32px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
};

const footer = {
  color: '#666666',
  fontSize: '12px',
  fontWeight: '400',
  lineHeight: '1.5',
  margin: '40px 0 0',
  textAlign: 'center' as const,
};
