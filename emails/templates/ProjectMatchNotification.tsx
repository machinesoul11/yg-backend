/**
 * Project Match Notification Email
 * Sent to creators when a new project matches their specialties
 */

import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
} from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { emailStyles, EMAIL_COLORS } from '../styles/brand';

interface ProjectMatchNotificationProps {
  creatorName: string;
  projectName: string;
  brandName: string;
  projectDescription: string;
  budgetRange: string;
  projectUrl: string;
}

export default function ProjectMatchNotification({
  creatorName = 'Creator',
  projectName = 'Brand Campaign 2025',
  brandName = 'YES GODDESS',
  projectDescription = 'Looking for talented creators to collaborate on an exciting new campaign.',
  budgetRange = '$5,000 - $10,000',
  projectUrl = 'https://app.yesgoddess.com/projects/123',
}: ProjectMatchNotificationProps) {
  return (
    <EmailLayout previewText={`New project opportunity: ${projectName}`}>
      <Heading style={emailStyles.h1}>New Project Opportunity</Heading>

      <Text style={emailStyles.text}>Hello {creatorName},</Text>

      <Text style={emailStyles.text}>
        Great news! A new project from <strong>{brandName}</strong> matches your creative
        specialties and is looking for talented creators like you.
      </Text>

      <Section style={emailStyles.cardGold}>
        <Heading style={{ ...emailStyles.h2, margin: '0 0 16px' }}>
          {projectName}
        </Heading>

        <Text style={{ ...emailStyles.text, margin: '0 0 12px' }}>
          {projectDescription}
        </Text>

        <Text style={{ ...emailStyles.textSmall, margin: '0' }}>
          <strong>Budget:</strong> {budgetRange}
        </Text>
      </Section>

      <Text style={emailStyles.text}>
        This opportunity was matched to your profile based on your specialties and portfolio.
        Review the project details and submit your pitch if you're interested.
      </Text>

      <Button href={projectUrl} style={{ ...emailStyles.buttonPrimary, marginTop: '24px' }}>
        View Project Details
      </Button>

      <Hr style={emailStyles.divider} />

      <Text style={emailStyles.textSmall}>
        <strong>Why was I matched?</strong>
        <br />
        Our algorithm matches projects with creators based on specialties, portfolio quality,
        and project requirements. You're receiving this because your profile is a strong match
        for what {brandName} is looking for.
      </Text>

      <Text style={emailStyles.textSmall}>
        Not interested in this type of project?{' '}
        <a
          href={`${process.env.NEXT_PUBLIC_APP_URL}/settings/preferences`}
          style={emailStyles.link}
        >
          Update your project preferences
        </a>
      </Text>
    </EmailLayout>
  );
}
