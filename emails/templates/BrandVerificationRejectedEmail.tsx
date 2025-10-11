import {
  Heading,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { emailStyles } from '../styles/brand';

interface BrandVerificationRejectedEmailProps {
  brandName: string;
  contactName: string;
  reason: string;
  supportEmail: string;
}

export const BrandVerificationRejectedEmail = ({
  brandName,
  contactName,
  reason,
  supportEmail,
}: BrandVerificationRejectedEmailProps) => {
  const previewText = `Update on ${brandName} verification`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h2}>Brand Verification Update</Heading>

      <Text style={emailStyles.text}>Hello {contactName},</Text>

      <Text style={emailStyles.text}>
        Thank you for your interest in YES GODDESS. After reviewing <strong>{brandName}</strong>'s
        profile, we are unable to verify your brand at this time.
      </Text>

      <Text style={emailStyles.text}>
        <strong>Reason:</strong>
      </Text>

      <Text style={emailStyles.textSmall}>
        {reason}
      </Text>

      <Text style={emailStyles.text}>
        <strong>Next Steps:</strong>
      </Text>

      <ul>
        <li style={emailStyles.textSmall}>Review the reason for rejection carefully</li>
        <li style={emailStyles.textSmall}>Update your brand information accordingly</li>
        <li style={emailStyles.textSmall}>Contact our support team if you have questions</li>
        <li style={emailStyles.textSmall}>Resubmit your brand for verification</li>
      </ul>

      <Text style={emailStyles.textSmall}>
        If you believe this decision was made in error or have questions, please contact us
        at <strong>{supportEmail}</strong>.
      </Text>

      <Text style={emailStyles.textSmall}>
        We appreciate your understanding and look forward to potentially working together in the future.
      </Text>
    </EmailLayout>
  );
};

export default BrandVerificationRejectedEmail;
