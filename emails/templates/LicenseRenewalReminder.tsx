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
  Hr,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';

interface LicenseRenewalReminderProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  expirationDate: string;
  daysRemaining: number;
  renewalFeeDollars: string;
  renewalUrl: string;
  urgencyLevel: 'final' | 'high' | 'medium'; // final=7days, high=30days, medium=60days
}

export const LicenseRenewalReminder = ({
  brandName,
  contactName,
  licenseName,
  ipAssetTitle,
  expirationDate,
  daysRemaining,
  renewalFeeDollars,
  renewalUrl,
  urgencyLevel = 'medium',
}: LicenseRenewalReminderProps) => {
  const getPreviewText = () => {
    if (urgencyLevel === 'final') {
      return `FINAL NOTICE: License "${licenseName}" expires in ${daysRemaining} days`;
    }
    if (urgencyLevel === 'high') {
      return `URGENT: License "${licenseName}" expires in ${daysRemaining} days`;
    }
    return `Reminder: License "${licenseName}" expires in ${daysRemaining} days`;
  };

  const getHeading = () => {
    if (urgencyLevel === 'final') return 'FINAL RENEWAL NOTICE';
    if (urgencyLevel === 'high') return 'RENEWAL REMINDER';
    return 'LICENSE RENEWAL AVAILABLE';
  };

  const getUrgencyMessage = () => {
    if (urgencyLevel === 'final') {
      return (
        <Section style={{ ...alertBox, ...alertBoxFinal }}>
          <Text style={alertText}>
            ⚠️ FINAL NOTICE: Your license expires in {daysRemaining} days
          </Text>
          <Text style={alertSubtext}>
            Immediate action required to avoid service interruption and potential
            re-negotiation fees.
          </Text>
        </Section>
      );
    }
    if (urgencyLevel === 'high') {
      return (
        <Section style={{ ...alertBox, ...alertBoxHigh }}>
          <Text style={alertText}>
            ⏰ URGENT: License expires in {daysRemaining} days
          </Text>
          <Text style={alertSubtext}>
            Please review and accept your renewal offer to ensure uninterrupted access.
          </Text>
        </Section>
      );
    }
    return null;
  };

  return (
    <Html>
      <Head />
      <Preview>{getPreviewText()}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Heading style={h1}>{getHeading()}</Heading>

          {/* Urgency Alert */}
          {getUrgencyMessage()}

          {/* Greeting */}
          <Text style={text}>
            {contactName},
          </Text>

          <Text style={text}>
            Your license <strong>"{licenseName}"</strong> for <strong>{ipAssetTitle}</strong> will
            expire on <strong>{expirationDate}</strong> ({daysRemaining} days remaining).
          </Text>

          {urgencyLevel === 'final' ? (
            <Text style={{ ...text, fontWeight: '600', color: EMAIL_COLORS.DENY }}>
              This is your final renewal reminder. After expiration, this license will terminate
              and you will lose access to use this IP asset. Re-licensing may require new
              negotiations and updated terms.
            </Text>
          ) : (
            <Text style={text}>
              A renewal offer has been prepared for your review. Accepting now ensures
              continuous access and maintains your current favorable terms.
            </Text>
          )}

          <Hr style={divider} />

          {/* Quick Summary */}
          <Section style={summarySection}>
            <Text style={sectionHeading}>RENEWAL DETAILS</Text>
            <table style={summaryTable}>
              <tbody>
                <tr>
                  <td style={summaryLabel}>Expiration:</td>
                  <td style={summaryValue}>{expirationDate}</td>
                </tr>
                <tr>
                  <td style={summaryLabel}>Days Remaining:</td>
                  <td style={{ ...summaryValue, fontWeight: '600' }}>
                    {daysRemaining} days
                  </td>
                </tr>
                <tr>
                  <td style={summaryLabel}>Renewal Fee:</td>
                  <td style={summaryValue}>{renewalFeeDollars}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={divider} />

          {/* Call to Action */}
          <Text style={text}>
            Review your renewal offer, which maintains your current scope and terms.
            Acceptance can be completed in minutes.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={renewalUrl}>
              {urgencyLevel === 'final' ? 'RENEW NOW' : 'REVIEW RENEWAL'}
            </Button>
          </Section>

          {urgencyLevel === 'final' && (
            <Text style={smallTextWarning}>
              If you do not intend to renew, please notify us immediately to avoid
              automatic renewal processing fees.
            </Text>
          )}

          {/* What Happens if License Expires */}
          {urgencyLevel === 'final' && (
            <>
              <Hr style={divider} />
              <Section style={infoBox}>
                <Text style={infoHeading}>What happens if my license expires?</Text>
                <Text style={infoText}>
                  • You will immediately lose rights to use the licensed IP asset
                </Text>
                <Text style={infoText}>
                  • All existing materials using the asset must be removed
                </Text>
                <Text style={infoText}>
                  • Royalty arrangements will terminate
                </Text>
                <Text style={infoText}>
                  • Re-licensing requires new creator approval and updated terms
                </Text>
              </Section>
            </>
          )}

          {/* Footer */}
          <Hr style={divider} />
          <Text style={footer}>
            Questions? Contact us at{' '}
            <a href="mailto:licensing@yesgoddess.com" style={link}>
              licensing@yesgoddess.com
            </a>
          </Text>

          <Text style={footer}>
            You are receiving this because you have an expiring license with YES GODDESS.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: EMAIL_COLORS.VOID,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: EMAIL_COLORS.BONE,
  margin: '0 auto',
  padding: '48px 32px',
  maxWidth: '600px',
};

const h1 = {
  ...emailStyles.h1,
  color: EMAIL_COLORS.VOID,
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const text = {
  ...emailStyles.text,
  color: EMAIL_COLORS.VOID,
};

const smallTextWarning = {
  ...emailStyles.textSmall,
  color: EMAIL_COLORS.DENY,
  textAlign: 'center' as const,
  fontWeight: '600',
  marginTop: '16px',
};

const sectionHeading = {
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '600',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  marginBottom: '16px',
};

const divider = {
  borderColor: EMAIL_COLORS.SANCTUM,
  margin: '32px 0',
};

const alertBox = {
  padding: '20px',
  borderRadius: '4px',
  marginBottom: '24px',
  border: '2px solid',
};

const alertBoxFinal = {
  backgroundColor: '#FFF5F5',
  borderColor: EMAIL_COLORS.DENY,
};

const alertBoxHigh = {
  backgroundColor: '#FFF9F0',
  borderColor: EMAIL_COLORS.CAUTION,
};

const alertText = {
  color: EMAIL_COLORS.VOID,
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 8px 0',
  textAlign: 'center' as const,
};

const alertSubtext = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '14px',
  margin: '0',
  textAlign: 'center' as const,
};

const summarySection = {
  marginTop: '24px',
};

const summaryTable = {
  width: '100%',
  marginTop: '16px',
};

const summaryLabel = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '14px',
  paddingRight: '16px',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
};

const summaryValue = {
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '500',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: EMAIL_COLORS.ALTAR,
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '600',
  letterSpacing: '2px',
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
  padding: '16px 32px',
  borderRadius: '0px',
  display: 'inline-block',
};

const infoBox = {
  backgroundColor: EMAIL_COLORS.WHISPER,
  padding: '20px',
  borderRadius: '4px',
  marginTop: '24px',
};

const infoHeading = {
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '600',
  marginBottom: '12px',
};

const infoText = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '13px',
  margin: '6px 0',
  lineHeight: '1.6',
};

const footer = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '12px',
  lineHeight: '1.6',
  marginTop: '8px',
};

const link = {
  color: EMAIL_COLORS.ALTAR,
  textDecoration: 'underline',
};

export default LicenseRenewalReminder;
