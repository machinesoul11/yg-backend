import {
  Body,
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

interface ContractorExpirationAdminWarningProps {
  adminName: string;
  contractorName: string;
  contractorEmail: string;
  daysUntilExpiration: number;
  expiresAt: string;
  roleId: string;
}

export const ContractorExpirationAdminWarning = ({
  adminName = 'Admin',
  contractorName = 'Contractor',
  contractorEmail = 'contractor@example.com',
  daysUntilExpiration = 7,
  expiresAt = new Date().toISOString(),
  roleId = 'role_xxx',
}: ContractorExpirationAdminWarningProps) => {
  const previewText = `Contractor role expiring in ${daysUntilExpiration} day${daysUntilExpiration > 1 ? 's' : ''}`;
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
            <Heading style={h1}>⏰ Contractor Access Expiring</Heading>
            
            <Text style={text}>Dear {adminName},</Text>
            
            <Text style={text}>
              This is a notification that a contractor role you assigned is scheduled to expire
              in <strong>{daysUntilExpiration} day{daysUntilExpiration > 1 ? 's' : ''}</strong>.
            </Text>

            <Section style={infoBox}>
              <Text style={infoLabel}>Contractor:</Text>
              <Text style={infoValue}>{contractorName}</Text>
              
              <Text style={infoLabel}>Email:</Text>
              <Text style={infoValue}>{contractorEmail}</Text>
              
              <Text style={infoLabel}>Expiration Date:</Text>
              <Text style={infoValue}>{formattedDate}</Text>
              
              <Text style={infoLabel}>Role ID:</Text>
              <Text style={infoValue}>{roleId}</Text>
            </Section>

            <Section style={actionBox}>
              <Text style={actionTitle}>Action Required:</Text>
              <Text style={actionText}>
                • If the contractor needs continued access, please extend their role before the
                  expiration date
              </Text>
              <Text style={actionText}>
                • If no action is taken, access will be automatically revoked
              </Text>
              <Text style={actionText}>
                • The contractor has been notified of the upcoming expiration
              </Text>
            </Section>

            <Text style={text}>
              You can manage contractor roles through the admin dashboard under Team Management.
            </Text>

            <Text style={footer}>
              With divine grace,
              <br />
              The YES GODDESS System
            </Text>
          </Container>
        </Body>
      </EmailLayout>
    </Html>
  );
};

export default ContractorExpirationAdminWarning;

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

const actionBox = {
  backgroundColor: '#e7f3ff',
  border: '1px solid #0056b3',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const actionTitle = {
  color: '#0056b3',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px 0',
};

const actionText = {
  color: '#004085',
  fontSize: '15px',
  lineHeight: '22px',
  margin: '8px 0',
};

const footer = {
  color: '#6c757d',
  fontSize: '14px',
  lineHeight: '22px',
  marginTop: '32px',
};
