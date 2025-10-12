/**
 * Transaction Receipt Email Template
 * Confirmation of payment transactions (license purchases, royalty payouts, etc.)
 */

import React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { H1, H2, Text, Caption } from '../components/Typography';
import { Divider } from '../components/Divider';
import { Section } from '@react-email/components';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';

interface TransactionItem {
  name: string;
  price: number; // in cents
}

interface TransactionReceiptProps {
  recipientName: string;
  transactionType: string; // "License Purchase", "Royalty Payout", etc.
  amount: number; // in cents
  transactionDate: Date;
  transactionId: string;
  description: string;
  paymentMethod: string;
  items?: TransactionItem[];
  recipientEmail: string;
}

export default function TransactionReceipt({
  recipientName = 'Creator',
  transactionType = 'Transaction',
  amount = 0,
  transactionDate = new Date(),
  transactionId = '',
  description = '',
  paymentMethod = '',
  items = [],
  recipientEmail = '',
}: TransactionReceiptProps) {
  const formattedAmount = (amount / 100).toFixed(2);
  const formattedDate = transactionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <EmailLayout previewText={`Payment confirmation: ${transactionType}`}>
      <H1>Payment Confirmation</H1>

      <Text>{recipientName},</Text>

      <Text>
        Your {transactionType.toLowerCase()} has been processed.
      </Text>

      <Divider variant="gold" />

      <Section style={summaryBox}>
        <Caption style={{ margin: '0 0 8px', textAlign: 'center' }}>
          {transactionType}
        </Caption>
        <Text style={amountStyle}>
          ${formattedAmount}
        </Text>
      </Section>

      <Divider />

      <H2 style={{ fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}>
        Transaction Details
      </H2>

      <Section style={detailsSection}>
        <DetailRow label="Amount" value={`$${formattedAmount}`} />
        <DetailRow label="Date" value={formattedDate} />
        <DetailRow label="Transaction ID" value={transactionId} />
        <DetailRow label="Description" value={description} />
        <DetailRow label="Payment Method" value={paymentMethod} />
      </Section>

      {items && items.length > 0 && (
        <>
          <Divider />
          
          <H2 style={{ fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Itemization
          </H2>
          
          <Section style={itemsSection}>
            {items.map((item, index) => (
              <Section key={index} style={itemRow}>
                <Text style={itemName}>{item.name}</Text>
                <Text style={itemPrice}>${(item.price / 100).toFixed(2)}</Text>
              </Section>
            ))}
            
            <Divider />
            
            <Section style={itemRow}>
              <Text style={{ ...itemName, fontWeight: '600' }}>Total</Text>
              <Text style={{ ...itemPrice, fontWeight: '600', color: EMAIL_COLORS.ALTAR }}>
                ${formattedAmount}
              </Text>
            </Section>
          </Section>
        </>
      )}

      <Divider />

      <Text style={{ color: EMAIL_COLORS.SANCTUM }}>
        A copy of this receipt has been sent to {recipientEmail}.
      </Text>

      <Text style={{ color: EMAIL_COLORS.SANCTUM, fontSize: '14px' }}>
        Questions about this transaction? Contact support at{' '}
        <a href="https://yesgoddess.com/support" style={{ color: EMAIL_COLORS.ALTAR, textDecoration: 'none' }}>
          yesgoddess.com/support
        </a>
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

const summaryBox = {
  backgroundColor: EMAIL_COLORS.SHADOW,
  padding: '32px 24px',
  margin: '24px 0',
  textAlign: 'center' as const,
  borderLeft: `4px solid ${EMAIL_COLORS.ALTAR}`,
};

const amountStyle = {
  color: EMAIL_COLORS.ALTAR,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '48px',
  fontWeight: '600',
  letterSpacing: '-1px',
  lineHeight: '1',
  margin: '0',
  textAlign: 'center' as const,
};

const detailsSection = {
  marginTop: '24px',
};

const detailRow = {
  marginBottom: '16px',
  display: 'flex' as const,
};

const detailLabel = {
  color: EMAIL_COLORS.SANCTUM,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '14px',
  fontWeight: '400',
  letterSpacing: '1px',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const detailValue = {
  color: EMAIL_COLORS.BONE,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '16px',
  fontWeight: '400',
  letterSpacing: '0.5px',
  margin: '0',
};

const itemsSection = {
  marginTop: '24px',
};

const itemRow = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  marginBottom: '12px',
};

const itemName = {
  color: EMAIL_COLORS.BONE,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '16px',
  margin: '0',
};

const itemPrice = {
  color: EMAIL_COLORS.BONE,
  fontFamily: EMAIL_FONTS.mono,
  fontSize: '16px',
  margin: '0',
  textAlign: 'right' as const,
};
