import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';

interface BrandVerificationRequestProps {
  brandName: string;
  companyName: string;
  industry: string;
  website: string;
  verificationUrl: string;
}

export const BrandVerificationRequest = ({
  brandName,
  companyName,
  industry,
  website,
  verificationUrl,
}: BrandVerificationRequestProps) => {
  const previewText = `New Brand Verification Request: ${brandName}`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h2}>New Brand Verification Request</Heading>

      <Text style={emailStyles.text}>Hello Admin,</Text>

      <Text style={emailStyles.text}>
        A new brand has registered on YES GODDESS and requires verification:
      </Text>

      <Section style={detailsBox}>
        <Text style={detailItem}>
          <strong>Company Name:</strong> {companyName}
        </Text>
        <Text style={detailItem}>
          <strong>Industry:</strong> {industry}
        </Text>
        <Text style={detailItem}>
          <strong>Website:</strong> {website}
        </Text>
      </Section>

      <Section style={buttonContainer}>
        <Button style={emailStyles.buttonPrimary} href={verificationUrl}>
          Review & Verify Brand
        </Button>
      </Section>

      <Text style={emailStyles.textSmall}>
        Please review the brand profile and verify or reject within 48 hours.
      </Text>
    </EmailLayout>
  );
};

export default BrandVerificationRequest;

const detailsBox = {
  backgroundColor: EMAIL_COLORS.whiteWarm,
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const detailItem = {
  fontSize: '14px',
  lineHeight: '20px',
  color: EMAIL_COLORS.text,
  marginBottom: '12px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '32px',
};
