/**
 * Project Expired Email
 * Sent to brand admins when a project is auto-archived after its end date
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

interface ProjectExpiredProps {
  brandName: string;
  projectName: string;
  endDate: string;
  projectUrl: string;
}

export default function ProjectExpired({
  brandName = 'ACME Brand',
  projectName = 'Summer Campaign 2025',
  endDate = 'October 10, 2025',
  projectUrl = 'https://app.yesgoddess.com/projects/123',
}: ProjectExpiredProps) {
  return (
    <EmailLayout previewText={`Project archived: ${projectName}`}>
      <Heading style={emailStyles.h1}>Project Archived</Heading>

      <Text style={emailStyles.text}>Hello {brandName},</Text>

      <Text style={emailStyles.text}>
        Your project <strong>{projectName}</strong> has been automatically archived after
        reaching its end date on {endDate}.
      </Text>

      <Section style={emailStyles.card}>
        <Heading style={{ ...emailStyles.h3, margin: '0 0 12px' }}>
          What happens next?
        </Heading>

        <Text style={{ ...emailStyles.textSmall, margin: '0 0 8px' }}>
          • The project is now in <strong>ARCHIVED</strong> status
        </Text>
        <Text style={{ ...emailStyles.textSmall, margin: '0 0 8px' }}>
          • No new submissions or licenses can be created
        </Text>
        <Text style={{ ...emailStyles.textSmall, margin: '0 0 8px' }}>
          • You can still view project details and download assets
        </Text>
        <Text style={{ ...emailStyles.textSmall, margin: '0' }}>
          • Existing licenses remain active according to their terms
        </Text>
      </Section>

      <Text style={emailStyles.text}>
        You can view the project's final summary and export any data you need from the
        project dashboard.
      </Text>

      <Button href={projectUrl} style={emailStyles.buttonPrimary}>
        View Project
      </Button>

      <Hr style={emailStyles.divider} />

      <Text style={emailStyles.textSmall}>
        Need to create a similar project?{' '}
        <a
          href={`${process.env.NEXT_PUBLIC_APP_URL}/projects/new`}
          style={emailStyles.link}
        >
          Start a new project
        </a>
      </Text>
    </EmailLayout>
  );
}
