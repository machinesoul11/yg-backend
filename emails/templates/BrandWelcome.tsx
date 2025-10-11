import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { emailStyles } from '../styles/brand';

interface BrandWelcomeProps {
  brandName: string;
  contactName: string;
}

export const BrandWelcome = ({
  brandName,
  contactName,
}: BrandWelcomeProps) => {
  const previewText = `Welcome to YES GODDESS, ${brandName}`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>Welcome to YES GODDESS</Heading>

      <Text style={emailStyles.text}>Hello {contactName},</Text>

      <Text style={emailStyles.text}>
        Thank you for creating a brand profile for <strong>{brandName}</strong> on YES GODDESS.
      </Text>

      <Text style={emailStyles.text}>
        Your brand profile is currently pending verification. Our team will review your submission
        within 24-48 hours. Once verified, you'll be able to:
      </Text>

      <ul>
        <li style={emailStyles.textSmall}>Browse and license IP from verified creators</li>
        <li style={emailStyles.textSmall}>Create project briefs and campaign requests</li>
        <li style={emailStyles.textSmall}>Manage your team members and permissions</li>
        <li style={emailStyles.textSmall}>Access brand analytics and insights</li>
      </ul>

      <Text style={emailStyles.textSmall}>
        While you wait for verification, feel free to explore our creator marketplace and prepare
        your first campaign.
      </Text>

      <Text style={emailStyles.textSmall}>
        If you have any questions, our support team is here to help at support@yesgoddess.com.
      </Text>

      <Text style={emailStyles.text}>
        <strong>The YES GODDESS Team</strong>
      </Text>
    </EmailLayout>
  );
};

export default BrandWelcome;
