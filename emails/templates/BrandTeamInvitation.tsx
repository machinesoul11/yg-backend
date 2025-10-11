import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { emailStyles } from '../styles/brand';

interface BrandTeamInvitationProps {
  brandName: string;
  userName: string;
  role: string;
  dashboardUrl: string;
}

export const BrandTeamInvitation = ({
  brandName,
  userName,
  role,
  dashboardUrl,
}: BrandTeamInvitationProps) => {
  const previewText = `You've been added to ${brandName} team`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h2}>You've Been Added to a Brand Team</Heading>

      <Text style={emailStyles.text}>Hello {userName},</Text>

      <Text style={emailStyles.text}>
        You've been added as a <strong>{role}</strong> to <strong>{brandName}</strong>'s team
        on YES GODDESS.
      </Text>

      <Text style={emailStyles.text}>
        You now have access to manage projects, licenses, and other brand activities based on
        your assigned role and permissions.
      </Text>

      <Section style={buttonContainer}>
        <Button style={emailStyles.buttonPrimary} href={dashboardUrl}>
          Access Brand Dashboard
        </Button>
      </Section>

      <Text style={emailStyles.textSmall}>
        If you have questions about your role or permissions, please contact your brand administrator.
      </Text>
    </EmailLayout>
  );
};

export default BrandTeamInvitation;

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '24px',
};
