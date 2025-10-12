/**
 * Project Invitation Email Template
 * Sent when a creator is invited to collaborate on a brand project
 */

import React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { H1, H2, Text, Caption, Declaration } from '../components/Typography';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
import { Section } from '@react-email/components';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';

interface ProjectInvitationProps {
  creatorName: string;
  projectName: string;
  brandName: string;
  budgetRange: string;
  timeline: string;
  briefExcerpt: string;
  projectUrl: string;
  responseDeadline: Date;
}

export default function ProjectInvitation({
  creatorName = 'Creator',
  projectName = 'Brand Campaign 2025',
  brandName = 'YES GODDESS',
  budgetRange = '$5,000 - $10,000',
  timeline = '4-6 weeks',
  briefExcerpt = 'Seeking creative collaboration for an innovative campaign celebrating artistic sovereignty.',
  projectUrl = 'https://app.yesgoddess.com/projects/123',
  responseDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
}: ProjectInvitationProps) {
  const formattedDeadline = responseDeadline.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const daysUntilDeadline = Math.ceil(
    (responseDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <EmailLayout previewText={`Project invitation: ${projectName}`}>
      <H1>Project Invitation</H1>

      <Text>{creatorName},</Text>

      <Text>
        You've been invited to collaborate on a project.
      </Text>

      <Divider variant="gold" />

      <Section style={projectBox}>
        <DetailRow label="Project" value={projectName} />
        <DetailRow label="Brand" value={brandName} />
        <DetailRow label="Budget" value={budgetRange} />
        <DetailRow label="Timeline" value={timeline} />
      </Section>

      <Divider />

      <H2 style={{ fontSize: '18px', letterSpacing: '1px' }}>
        Project Brief
      </H2>

      <Text style={{ color: EMAIL_COLORS.SANCTUM }}>
        {briefExcerpt}
      </Text>

      <Declaration>
        This is not a request for content creation. This is an invitation to license existing work or collaborate on new work under your terms.
      </Declaration>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={projectUrl}>
          Review Project Brief
        </Button>
      </Section>

      <Divider />

      <Text style={{ color: EMAIL_COLORS.SANCTUM, fontSize: '14px' }}>
        <strong>Response Deadline:</strong> If interested, respond within {daysUntilDeadline} days ({formattedDeadline}).
      </Text>
    </EmailLayout>
  );
}

// Helper component for detail rows
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <Section style={detailRow}>
    <Text style={detailLabel}>{label}</Text>
    <Text style={detailValue}>{value}</Text>
  </Section>
);

const projectBox = {
  backgroundColor: EMAIL_COLORS.SHADOW,
  padding: '24px',
  margin: '24px 0',
  borderLeft: `4px solid ${EMAIL_COLORS.ALTAR}`,
};

const detailRow = {
  marginBottom: '12px',
  display: 'flex' as const,
};

const detailLabel = {
  color: EMAIL_COLORS.SANCTUM,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '14px',
  fontWeight: '400',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
  minWidth: '120px',
};

const detailValue = {
  color: EMAIL_COLORS.BONE,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '16px',
  fontWeight: '400',
  letterSpacing: '0.5px',
  margin: '0',
};
