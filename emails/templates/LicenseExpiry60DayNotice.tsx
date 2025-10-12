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

interface LicenseExpiry60DayNoticeProps {
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

export const LicenseExpiry60DayNotice = ({
  userName,
  licenseName,
  brandName,
  expiryDate,
  daysRemaining,
  renewalUrl,
  licenseUrl,
  autoRenewEnabled = false,
  recipientRole = 'brand',
}: LicenseExpiry60DayNoticeProps) => {
  const previewText = `License expires in ${daysRemaining} days: ${licenseName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>License Expiring in 60 Days</Heading>

          <Text style={text}>Dear {userName},</Text>

          <Text style={text}>
            Your license for <strong>{licenseName}</strong>
            {recipientRole === 'brand' ? '' : ` with ${brandName}`} will expire in{' '}
            <strong>60 days</strong> on <strong>{expiryDate}</strong>.
          </Text>

          <Section style={alertBox}>
            <Text style={alertValue}>{daysRemaining}</Text>
            <Text style={alertLabel}>Days Until Expiry</Text>
          </Section>

          {recipientRole === 'brand' && (
            <>
              {autoRenewEnabled ? (
                <>
                  <Section style={noteBox}>
                    <Text style={noteText}>
                      <strong>Auto-Renewal Active:</strong> This license will automatically
                      renew unless you choose to modify terms or cancel. Review your renewal
                      settings to confirm your preferences.
                    </Text>
                  </Section>

                  <Text style={text}>
                    If you wish to adjust licensing terms, disable auto-renewal, or discuss
                    modifications, please take action before the renewal date.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={text}>
                    If you intend to maintain access to this asset, renewal arrangements should
                    be initiated soon to ensure continuity of service.
                  </Text>

                  <Text style={text}>
                    Without renewal, access to this asset will conclude on the expiry date, and
                    all associated rights will terminate according to the license terms.
                  </Text>
                </>
              )}

              {renewalUrl && (
                <Section style={buttonContainer}>
                  <Button style={button} href={renewalUrl}>
                    Initiate Renewal Process
                  </Button>
                </Section>
              )}
            </>
          )}

          {recipientRole === 'creator' && (
            <>
              <Text style={text}>
                This license is scheduled to expire in 60 days. If the brand initiates renewal,
                you will be notified and may be asked to review updated terms.
              </Text>

              <Text style={text}>
                Royalty payments will continue through the end of the license term. You will
                receive a final notice at the 30-day mark.
              </Text>
            </>
          )}

          <Section style={buttonContainer}>
            <Button style={buttonSecondary} href={licenseUrl}>
              View License Details
            </Button>
          </Section>

          <Text style={footer}>
            A final notice will be sent 30 days before expiry. For questions regarding this
            license, review the complete details via the link above.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseExpiry60DayNotice;

// Brand-aligned styling following YES GODDESS guidelines
const main = {
  backgroundColor: '#0A0A0A',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container = {
  backgroundColor: '#F8F6F3',
  margin: '0 auto',
  padding: '48px 32px',
  maxWidth: '600px',
};

const h1 = {
  color: '#0A0A0A',
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

const alertBox = {
  backgroundColor: '#C4C0B8',
  borderRadius: '4px',
  padding: '32px 24px',
  margin: '32px 0',
  textAlign: 'center' as const,
  borderTop: '3px solid #0A0A0A',
};

const alertValue = {
  color: '#0A0A0A',
  fontSize: '48px',
  fontWeight: '300',
  letterSpacing: '0.02em',
  margin: '0 0 8px',
  lineHeight: '1',
};

const alertLabel = {
  color: '#0A0A0A',
  fontSize: '12px',
  fontWeight: '400',
  letterSpacing: '0.1em',
  margin: '0',
  textTransform: 'uppercase' as const,
};

const noteBox = {
  backgroundColor: '#B8A888',
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
