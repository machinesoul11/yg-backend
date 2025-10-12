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

interface LicenseRenewalCompleteProps {
  recipientName: string;
  recipientType: 'brand' | 'creator';
  licenseName: string;
  ipAssetTitle: string;
  newStartDate: string;
  newEndDate: string;
  renewalFeeDollars: string;
  revSharePercent: string;
  confirmationNumber: string;
  licenseUrl: string;
  brandName?: string; // For creator emails
  creatorNames?: string[]; // For brand emails
}

export const LicenseRenewalComplete = ({
  recipientName,
  recipientType,
  licenseName,
  ipAssetTitle,
  newStartDate,
  newEndDate,
  renewalFeeDollars,
  revSharePercent,
  confirmationNumber,
  licenseUrl,
  brandName,
  creatorNames = [],
}: LicenseRenewalCompleteProps) => {
  const previewText = `License "${licenseName}" successfully renewed`;

  const getBrandMessage = () => (
    <>
      <Text style={text}>
        Your license <strong>"{licenseName}"</strong> for <strong>{ipAssetTitle}</strong> has
        been successfully renewed.
      </Text>

      <Text style={text}>
        Your license is now active and will continue through {newEndDate}. All creators
        have been notified of the renewal and will continue receiving royalty payments
        according to the established terms.
      </Text>
    </>
  );

  const getCreatorMessage = () => (
    <>
      <Text style={text}>
        A license for your IP asset <strong>"{ipAssetTitle}"</strong> has been
        successfully renewed by <strong>{brandName}</strong>.
      </Text>

      <Text style={text}>
        This renewal extends your royalty arrangement through {newEndDate}. You will
        continue to receive revenue share payments according to your ownership stake
        and the agreed terms.
      </Text>
    </>
  );

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Success Badge */}
          <Section style={successBadge}>
            <Text style={successIcon}>✓</Text>
            <Text style={successText}>RENEWAL CONFIRMED</Text>
          </Section>

          {/* Header */}
          <Heading style={h1}>LICENSE RENEWED</Heading>

          {/* Greeting */}
          <Text style={text}>{recipientName},</Text>

          {/* Role-specific message */}
          {recipientType === 'brand' ? getBrandMessage() : getCreatorMessage()}

          <Hr style={divider} />

          {/* Renewal Details */}
          <Section style={detailsSection}>
            <Text style={sectionHeading}>RENEWAL DETAILS</Text>

            <table style={detailsTable}>
              <tbody>
                <tr>
                  <td style={detailLabel}>License Period:</td>
                  <td style={detailValue}>
                    {newStartDate} – {newEndDate}
                  </td>
                </tr>
                <tr>
                  <td style={detailLabel}>
                    {recipientType === 'brand' ? 'License Fee:' : 'Total Fee:'}
                  </td>
                  <td style={detailValue}>{renewalFeeDollars}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Revenue Share:</td>
                  <td style={detailValue}>{revSharePercent}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Confirmation:</td>
                  <td style={detailValue}>#{confirmationNumber}</td>
                </tr>
              </tbody>
            </table>

            {recipientType === 'brand' && creatorNames.length > 0 && (
              <Section style={creatorsBox}>
                <Text style={creatorsHeading}>Licensed Creators:</Text>
                {creatorNames.map((name, index) => (
                  <Text key={index} style={creatorName}>
                    • {name}
                  </Text>
                ))}
              </Section>
            )}
          </Section>

          <Hr style={divider} />

          {/* What's Next */}
          <Section style={nextStepsSection}>
            <Text style={sectionHeading}>WHAT'S NEXT</Text>

            {recipientType === 'brand' ? (
              <>
                <Text style={nextStepItem}>
                  ✓ Your license is immediately active and ready to use
                </Text>
                <Text style={nextStepItem}>
                  ✓ Continue using the IP asset under existing scope and terms
                </Text>
                <Text style={nextStepItem}>
                  ✓ Revenue share payments will automatically continue
                </Text>
                <Text style={nextStepItem}>
                  ✓ You'll receive a renewal reminder 90 days before next expiration
                </Text>
              </>
            ) : (
              <>
                <Text style={nextStepItem}>
                  ✓ Royalty payments will continue based on brand usage
                </Text>
                <Text style={nextStepItem}>
                  ✓ Access your earnings dashboard for real-time tracking
                </Text>
                <Text style={nextStepItem}>
                  ✓ Monthly royalty statements will continue as scheduled
                </Text>
                <Text style={nextStepItem}>
                  ✓ You'll be notified of any amendments or changes
                </Text>
              </>
            )}
          </Section>

          {/* Call to Action */}
          <Section style={buttonContainer}>
            <Button style={button} href={licenseUrl}>
              VIEW LICENSE DETAILS
            </Button>
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Text style={footer}>
            Thank you for being part of the YES GODDESS community.
          </Text>

          <Text style={footer}>
            Questions about this renewal? Contact us at{' '}
            <a href="mailto:licensing@yesgoddess.com" style={link}>
              licensing@yesgoddess.com
            </a>
          </Text>

          <Text style={footer}>
            Confirmation Number: {confirmationNumber}
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

const successBadge = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const successIcon = {
  display: 'inline-block',
  width: '48px',
  height: '48px',
  lineHeight: '48px',
  borderRadius: '50%',
  backgroundColor: EMAIL_COLORS.AFFIRM,
  color: EMAIL_COLORS.BONE,
  fontSize: '24px',
  fontWeight: '600',
  marginBottom: '12px',
};

const successText = {
  color: EMAIL_COLORS.AFFIRM,
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '0',
};

const h1 = {
  ...emailStyles.h1,
  color: EMAIL_COLORS.VOID,
  textAlign: 'center' as const,
  marginBottom: '32px',
};

const text = {
  ...emailStyles.text,
  color: EMAIL_COLORS.VOID,
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

const detailsSection = {
  marginTop: '24px',
};

const detailsTable = {
  width: '100%',
  marginTop: '16px',
};

const detailLabel = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '14px',
  paddingRight: '16px',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
  width: '40%',
};

const detailValue = {
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '500',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
};

const creatorsBox = {
  backgroundColor: EMAIL_COLORS.WHISPER,
  padding: '16px',
  borderRadius: '4px',
  marginTop: '16px',
};

const creatorsHeading = {
  color: EMAIL_COLORS.VOID,
  fontSize: '13px',
  fontWeight: '600',
  marginBottom: '8px',
};

const creatorName = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '13px',
  margin: '4px 0',
};

const nextStepsSection = {
  marginTop: '24px',
};

const nextStepItem = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '14px',
  margin: '8px 0',
  lineHeight: '1.6',
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

export default LicenseRenewalComplete;
