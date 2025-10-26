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

interface ContractorExpiredProps {
  userName: string;
  expiredAt: string;
  department: string;
}

export const ContractorExpired = ({
  userName = 'Contractor',
  expiredAt = new Date().toISOString(),
  department = 'CONTRACTOR',
}: ContractorExpiredProps) => {
  const previewText = 'Your contractor access has expired';
  const formattedDate = new Date(expiredAt).toLocaleDateString('en-US', {
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
            <Heading style={h1}>🔒 Contractor Access Expired</Heading>
            
            <Text style={text}>Dear {userName},</Text>
            
            <Text style={text}>
              Your contractor access to the YES GODDESS admin platform has expired and has been
              automatically revoked.
            </Text>

            <Section style={infoBox}>
              <Text style={infoLabel}>Expiration Date:</Text>
              <Text style={infoValue}>{formattedDate}</Text>
              
              <Text style={infoLabel}>Department:</Text>
              <Text style={infoValue}>{department}</Text>
            </Section>

            <Section style={noticeBox}>
              <Text style={noticeText}>
                As of the expiration date above, you no longer have access to:
              </Text>
              <Text style={bulletText}>• Admin dashboard and tools</Text>
              <Text style={bulletText}>• Internal systems and data</Text>
              <Text style={bulletText}>• Team communication channels</Text>
              <Text style={bulletText}>• Any contractor-specific permissions</Text>
            </Section>

            <Text style={text}>
              If you need to regain access or extend your contractor role, please contact the
              YES GODDESS team member who originally granted your access.
            </Text>

            <Text style={text}>
              Thank you for your contributions to YES GODDESS during your contractor period.
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

export default ContractorExpired;

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

const noticeBox = {
  backgroundColor: '#fff5f5',
  border: '1px solid #fc8181',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const noticeText = {
  color: '#742a2a',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0 0 12px 0',
};

const bulletText = {
  color: '#742a2a',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '6px 0',
};

const footer = {
  color: '#6c757d',
  fontSize: '14px',
  lineHeight: '22px',
  marginTop: '32px',
};
