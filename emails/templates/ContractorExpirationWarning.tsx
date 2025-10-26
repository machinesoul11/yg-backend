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
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';

interface ContractorExpirationWarningProps {
  userName: string;
  daysUntilExpiration: number;
  expiresAt: string;
  department: string;
  permissions: string;
}

export const ContractorExpirationWarning = ({
  userName = 'Contractor',
  daysUntilExpiration = 7,
  expiresAt = new Date().toISOString(),
  department = 'CONTRACTOR',
  permissions = 'Various permissions',
}: ContractorExpirationWarningProps) => {
  const previewText = `Your contractor access expires in ${daysUntilExpiration} day${daysUntilExpiration > 1 ? 's' : ''}`;
  const formattedDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <EmailLayout>
        <Body style={main}>
          <Container style={container}>
            <Heading style={h1}>⏰ Contractor Access Expiring Soon</Heading>
            
            <Text style={text}>Dear {userName},</Text>
            
            <Text style={text}>
              This is a courtesy reminder that your contractor access to the YES GODDESS admin
              platform is scheduled to expire in <strong>{daysUntilExpiration} day{daysUntilExpiration > 1 ? 's' : ''}</strong>.
            </Text>

            <Section style={infoBox}>
              <Text style={infoLabel}>Expiration Date:</Text>
              <Text style={infoValue}>{formattedDate}</Text>
              
              <Text style={infoLabel}>Department:</Text>
              <Text style={infoValue}>{department}</Text>
              
              <Text style={infoLabel}>Current Permissions:</Text>
              <Text style={infoValue}>{permissions}</Text>
            </Section>

            <Section style={warningBox}>
              <Text style={warningText}>
                ⚠️ After the expiration date, your access will be automatically revoked and
                you will no longer be able to access the admin platform.
              </Text>
            </Section>

            <Text style={text}>
              If you need to extend your contractor access, please contact the admin team member
              who granted your access as soon as possible.
            </Text>

            <Text style={text}>
              If you have any questions or concerns, please reach out to the YES GODDESS team.
            </Text>

            <Text style={footer}>
              With divine grace,
              <br />
              The YES GODDESS Team
            </Text>
          </Container>
        </Body>
      </EmailLayout>
    </Html>
  );
};

export default ContractorExpirationWarning;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0 0 30px',
  textAlign: 'center' as const,
};

const text = {
  color: '#4a4a4a',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
};

const infoBox = {
  backgroundColor: '#f8f9fa',
  border: '1px solid #e9ecef',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const infoLabel = {
  color: '#6c757d',
  fontSize: '14px',
  fontWeight: '600',
  margin: '12px 0 4px 0',
};

const infoValue = {
  color: '#212529',
  fontSize: '16px',
  margin: '0 0 12px 0',
};

const warningBox = {
  backgroundColor: '#fff3cd',
  border: '1px solid #ffc107',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
};

const warningText = {
  color: '#856404',
  fontSize: '15px',
  lineHeight: '22px',
  margin: '0',
};

const footer = {
  color: '#6c757d',
  fontSize: '14px',
  lineHeight: '22px',
  marginTop: '32px',
};
