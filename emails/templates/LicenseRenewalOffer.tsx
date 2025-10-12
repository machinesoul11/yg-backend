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

interface LicenseRenewalOfferProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  currentEndDate: string;
  proposedStartDate: string;
  proposedEndDate: string;
  originalFeeDollars: string;
  renewalFeeDollars: string;
  feeChange: string; // e.g., "+5%" or "-10%"
  revSharePercent: string;
  daysUntilExpiration: number;
  renewalUrl: string;
  adjustmentsSummary?: string[];
}

export const LicenseRenewalOffer = ({
  brandName,
  contactName,
  licenseName,
  ipAssetTitle,
  currentEndDate,
  proposedStartDate,
  proposedEndDate,
  originalFeeDollars,
  renewalFeeDollars,
  feeChange,
  revSharePercent,
  daysUntilExpiration,
  renewalUrl,
  adjustmentsSummary = [],
}: LicenseRenewalOfferProps) => {
  const previewText = `Renewal offer for "${licenseName}" - Review and accept`;
  const isIncrease = feeChange.startsWith('+');
  const isDecrease = feeChange.startsWith('-');

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Heading style={h1}>LICENSE RENEWAL OFFER</Heading>

          {/* Greeting */}
          <Text style={text}>
            {contactName},
          </Text>

          <Text style={text}>
            Your license <strong>"{licenseName}"</strong> for <strong>{ipAssetTitle}</strong> expires in{' '}
            <strong>{daysUntilExpiration} days</strong> on {currentEndDate}.
          </Text>

          <Text style={text}>
            We have prepared a renewal offer designed to maintain your licensing agreement
            and continue your partnership with our creators.
          </Text>

          <Hr style={divider} />

          {/* Renewal Terms */}
          <Section style={termsSection}>
            <Text style={sectionHeading}>RENEWAL TERMS</Text>

            <table style={termsTable}>
              <tbody>
                <tr>
                  <td style={termLabel}>License Period:</td>
                  <td style={termValue}>
                    {proposedStartDate} – {proposedEndDate}
                  </td>
                </tr>
                <tr>
                  <td style={termLabel}>Original Fee:</td>
                  <td style={termValue}>{originalFeeDollars}</td>
                </tr>
                <tr>
                  <td style={termLabel}>Renewal Fee:</td>
                  <td style={{ ...termValue, fontWeight: '600' }}>
                    {renewalFeeDollars}
                    {feeChange !== '+0%' && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '14px',
                          color: isIncrease
                            ? EMAIL_COLORS.CAUTION
                            : isDecrease
                            ? EMAIL_COLORS.AFFIRM
                            : EMAIL_COLORS.SANCTUM,
                        }}
                      >
                        {feeChange}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={termLabel}>Revenue Share:</td>
                  <td style={termValue}>{revSharePercent}</td>
                </tr>
              </tbody>
            </table>

            {adjustmentsSummary.length > 0 && (
              <Section style={adjustmentsBox}>
                <Text style={adjustmentsHeading}>Pricing Adjustments:</Text>
                {adjustmentsSummary.map((adjustment, index) => (
                  <Text key={index} style={adjustmentItem}>
                    • {adjustment}
                  </Text>
                ))}
              </Section>
            )}
          </Section>

          <Hr style={divider} />

          {/* Call to Action */}
          <Text style={text}>
            This renewal offer maintains the same scope and terms as your current license.
            All creators and royalty arrangements remain unchanged.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={renewalUrl}>
              REVIEW RENEWAL OFFER
            </Button>
          </Section>

          <Text style={smallText}>
            This offer expires in 30 days. To avoid service interruption,
            please review and accept before {currentEndDate}.
          </Text>

          {/* Footer */}
          <Hr style={divider} />
          <Text style={footer}>
            Questions about this renewal? Contact us at{' '}
            <a href="mailto:licensing@yesgoddess.com" style={link}>
              licensing@yesgoddess.com
            </a>
          </Text>

          <Text style={footer}>
            This is an automated renewal notification from YES GODDESS.
            All licensing terms are subject to platform Terms of Service.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

// Styles aligned with YES GODDESS brand guidelines
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
  marginBottom: '32px',
};

const text = {
  ...emailStyles.text,
  color: EMAIL_COLORS.VOID,
};

const smallText = {
  ...emailStyles.textSmall,
  color: EMAIL_COLORS.SANCTUM,
  textAlign: 'center' as const,
  marginTop: '24px',
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

const termsSection = {
  marginTop: '24px',
};

const termsTable = {
  width: '100%',
  marginTop: '16px',
};

const termLabel = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '14px',
  fontWeight: '400',
  paddingRight: '16px',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
  width: '40%',
};

const termValue = {
  color: EMAIL_COLORS.VOID,
  fontSize: '14px',
  fontWeight: '500',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
};

const adjustmentsBox = {
  backgroundColor: EMAIL_COLORS.WHISPER,
  padding: '16px',
  borderRadius: '4px',
  marginTop: '16px',
};

const adjustmentsHeading = {
  color: EMAIL_COLORS.VOID,
  fontSize: '13px',
  fontWeight: '600',
  marginBottom: '8px',
  letterSpacing: '0.5px',
};

const adjustmentItem = {
  color: EMAIL_COLORS.SANCTUM,
  fontSize: '13px',
  margin: '4px 0',
  lineHeight: '1.5',
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

export default LicenseRenewalOffer;
