import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { emailStyles } from '../styles/brand';

interface BrandVerificationCompleteProps {
  brandName: string;
  contactName: string;
  dashboardUrl: string;
}

export const BrandVerificationComplete = ({
  brandName,
  contactName,
  dashboardUrl,
}: BrandVerificationCompleteProps) => {
  const previewText = `${brandName} - Brand Verified on YES GODDESS`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>Your Brand is Verified! 🎉</Heading>

      <Text style={emailStyles.text}>Hello {contactName},</Text>

      <Text style={emailStyles.text}>
        Great news! <strong>{brandName}</strong> has been verified on YES GODDESS.
      </Text>

      <Text style={emailStyles.text}>
        You now have full access to our platform and can begin licensing IP from our talented creators.
      </Text>

      <Section style={buttonContainer}>
        <Button style={emailStyles.buttonPrimary} href={dashboardUrl}>
          Go to Dashboard
        </Button>
      </Section>

      <Text style={emailStyles.text}>
        <strong>Next Steps:</strong>
      </Text>

      <ul>
        <li style={emailStyles.textSmall}>Complete your brand profile with company guidelines</li>
        <li style={emailStyles.textSmall}>Set up billing information</li>
        <li style={emailStyles.textSmall}>Invite team members</li>
        <li style={emailStyles.textSmall}>Browse creator portfolios</li>
        <li style={emailStyles.textSmall}>Create your first project brief</li>
      </ul>

      <Text style={emailStyles.textSmall}>
        Need help getting started? Visit our Help Center or reach out to support@yesgoddess.com.
      </Text>
    </EmailLayout>
  );
};

export default BrandVerificationComplete;

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '24px',
};
