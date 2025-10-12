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

interface LicenseExpiry30DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
  gracePeriodActive?: boolean;
  expired?: boolean;
}

export const LicenseExpiry30DayNotice = ({
  userName,
  licenseName,
  brandName,
  expiryDate,
  daysRemaining,
  renewalUrl,
  licenseUrl,
  autoRenewEnabled = false,
  recipientRole = 'brand',
  gracePeriodActive = false,
  expired = false,
}: LicenseExpiry30DayNoticeProps) => {
  const getPreviewText = () => {
    if (expired) return `License expired: ${licenseName}`;
    if (gracePeriodActive) return `Grace period active: ${licenseName}`;
    return `Action required: License expires in ${daysRemaining} days`;
  };

  const getHeading = () => {
    if (expired) return 'License Expired';
    if (gracePeriodActive) return 'Grace Period Active';
    return 'Action Required: License Expires in 30 Days';
  };

  return (
    <Html>
      <Head />
      <Preview>{getPreviewText()}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{getHeading()}</Heading>

          <Text style={text}>Dear {userName},</Text>

          {expired ? (
            <>
              <Section style={urgentBox}>
                <Text style={urgentText}>License Status: Expired</Text>
              </Section>

              <Text style={text}>
                The license for <strong>{licenseName}</strong>
                {recipientRole === 'brand' ? '' : ` with ${brandName}`} has expired as of{' '}
                <strong>{expiryDate}</strong>.
              </Text>

              {recipientRole === 'brand' && (
                <>
                  <Text style={text}>
                    As of the expiry date, use of this asset is no longer authorized under the
                    previous license terms. Any ongoing usage requires a new licensing
                    arrangement.
                  </Text>

                  <Text style={text}>
                    If you wish to relicense this asset, please contact the creator or initiate
                    a new license request through the platform.
                  </Text>
                </>
              )}

              {recipientRole === 'creator' && (
                <>
                  <Text style={text}>
                    This license has concluded. No further royalty payments will be processed
                    for this arrangement. If {brandName} wishes to relicense, you will be
                    notified accordingly.
                  </Text>
                </>
              )}
            </>
          ) : gracePeriodActive ? (
            <>
              <Section style={urgentBox}>
                <Text style={urgentValue}>{daysRemaining}</Text>
                <Text style={urgentLabel}>Days Remaining in Grace Period</Text>
              </Section>

              <Text style={text}>
                The original license for <strong>{licenseName}</strong>
                {recipientRole === 'brand' ? '' : ` with ${brandName}`} has reached its end
                date. A grace period is currently active, providing continued access until{' '}
                <strong>{expiryDate}</strong>.
              </Text>

              {recipientRole === 'brand' && (
                <>
                  <Text style={text}>
                    To maintain uninterrupted access beyond the grace period, renewal action is
                    required immediately. Without renewal, the license will fully expire at the
                    end of this grace period.
                  </Text>

                  {renewalUrl && (
                    <Section style={buttonContainer}>
                      <Button style={button} href={renewalUrl}>
                        Renew License Now
                      </Button>
                    </Section>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Section style={urgentBox}>
                <Text style={urgentValue}>{daysRemaining}</Text>
                <Text style={urgentLabel}>Days Until Expiry</Text>
              </Section>

              <Text style={text}>
                The license for <strong>{licenseName}</strong>
                {recipientRole === 'brand' ? '' : ` with ${brandName}`} will expire on{' '}
                <strong>{expiryDate}</strong>.
              </Text>

              {recipientRole === 'brand' && (
                <>
                  {autoRenewEnabled ? (
                    <>
                      <Section style={noteBox}>
                        <Text style={noteText}>
                          <strong>Auto-Renewal Confirmed:</strong> This license is scheduled for
                          automatic renewal. Confirm your renewal settings to ensure continuity.
                        </Text>
                      </Section>

                      <Text style={text}>
                        If you need to modify terms or cancel the renewal, take action now
                        before the automatic renewal is processed.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={text}>
                        <strong>Action is required within 30 days</strong> to maintain access to
                        this asset. Without renewal, the license will expire, and all associated
                        rights will terminate.
                      </Text>

                      <Text style={text}>
                        To avoid service interruption, initiate the renewal process immediately.
                      </Text>

                      {renewalUrl && (
                        <Section style={buttonContainer}>
                          <Button style={button} href={renewalUrl}>
                            Renew License Now
                          </Button>
                        </Section>
                      )}
                    </>
                  )}
                </>
              )}

              {recipientRole === 'creator' && (
                <>
                  <Text style={text}>
                    This is the final notice before license expiry. If the brand does not renew
                    within 30 days, this license will conclude, and royalty payments will cease.
                  </Text>

                  <Text style={text}>
                    You will be notified if renewal terms are proposed or if the license
                    expires.
                  </Text>
                </>
              )}
            </>
          )}

          <Section style={buttonContainer}>
            <Button style={buttonSecondary} href={licenseUrl}>
              View License Details
            </Button>
          </Section>

          {!expired && (
            <Text style={footer}>
              This is the final automated notice. For support or questions regarding this
              license, review the complete details via the link above.
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  );
};

export default LicenseExpiry30DayNotice;

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

const urgentBox = {
  backgroundColor: '#0A0A0A',
  borderRadius: '4px',
  padding: '32px 24px',
  margin: '32px 0',
  textAlign: 'center' as const,
};

const urgentValue = {
  color: '#F8F6F3',
  fontSize: '56px',
  fontWeight: '300',
  letterSpacing: '0.02em',
  margin: '0 0 8px',
  lineHeight: '1',
};

const urgentLabel = {
  color: '#B8A888',
  fontSize: '12px',
  fontWeight: '400',
  letterSpacing: '0.1em',
  margin: '0',
  textTransform: 'uppercase' as const,
};

const urgentText = {
  color: '#F8F6F3',
  fontSize: '18px',
  fontWeight: '400',
  letterSpacing: '0.08em',
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
