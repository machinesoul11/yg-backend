/**
 * Email Template Usage Examples
 * Demonstrates how to use the email templates in the application
 */

import { emailService } from '@/lib/services/email/email.service';

// Example 1: Sending a welcome email
async function sendWelcomeEmail(userId: string, email: string, userName: string) {
  await emailService.sendTransactional({
    userId,
    email,
    subject: 'Welcome to YES GODDESS',
    template: 'welcome-email',
    variables: {
      userName,
      verificationUrl: `https://app.yesgoddess.com/verify-email?token=abc123`,
      role: 'creator',
    },
  });
}

// Example 2: Sending email verification
async function sendEmailVerification(email: string, userName: string, token: string) {
  await emailService.sendTransactional({
    email,
    subject: 'Verify your YES GODDESS account',
    template: 'email-verification',
    variables: {
      userName,
      verificationUrl: `https://app.yesgoddess.com/verify-email?token=${token}`,
    },
  });
}

// Example 3: Sending password reset
async function sendPasswordReset(email: string, userName: string, token: string) {
  await emailService.sendTransactional({
    email,
    subject: 'Reset your YES GODDESS password',
    template: 'password-reset',
    variables: {
      userName,
      resetUrl: `https://app.yesgoddess.com/reset-password?token=${token}`,
    },
  });
}

// Example 4: Sending royalty statement notification
async function sendRoyaltyStatement(
  userId: string,
  email: string,
  userName: string,
  period: string,
  totalAmount: string
) {
  await emailService.sendTransactional({
    userId,
    email,
    subject: `Your royalties: ${period} statement available`,
    template: 'royalty-statement',
    variables: {
      userName,
      period,
      totalAmount,
      currency: 'USD',
      statementUrl: `https://app.yesgoddess.com/royalties/statement/${period}`,
      royalties: [
        { licenseName: 'Moonlight Photography Collection', amount: '1,200.00' },
        { licenseName: 'Urban Landscape Series', amount: '850.00' },
      ],
    },
  });
}

// Example 5: Sending license expiry reminder
async function sendLicenseExpiryReminder(
  userId: string,
  email: string,
  userName: string,
  licenseName: string,
  daysRemaining: number
) {
  await emailService.sendTransactional({
    userId,
    email,
    subject: `License expiring: ${licenseName} — ${daysRemaining} days remaining`,
    template: 'license-expiry',
    variables: {
      userName,
      licenseName,
      brandName: 'Lumina Cosmetics',
      expiryDate: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toLocaleDateString(),
      daysRemaining,
      renewalUrl: `https://app.yesgoddess.com/licenses/123/renew`,
    },
  });
}

// Example 6: Sending project invitation
async function sendProjectInvitation(
  userId: string,
  email: string,
  creatorName: string,
  projectId: string
) {
  await emailService.sendTransactional({
    userId,
    email,
    subject: 'Project invitation: Autumn Collection Campaign 2025',
    template: 'project-invitation',
    variables: {
      creatorName,
      projectName: 'Autumn Collection Campaign 2025',
      brandName: 'Lumina Cosmetics',
      budgetRange: '$8,000 - $12,000',
      timeline: '6-8 weeks',
      briefExcerpt:
        'Seeking a photographer to collaborate on our autumn collection campaign. We are looking for moody, atmospheric imagery.',
      projectUrl: `https://app.yesgoddess.com/projects/${projectId}`,
      responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

// Example 7: Sending monthly newsletter
async function sendMonthlyNewsletter(userId: string, email: string) {
  await emailService.sendTransactional({
    userId,
    email,
    subject: 'YES GODDESS: October 2025 Update',
    template: 'monthly-newsletter',
    variables: {
      month: 'October 2025',
      introduction:
        'The work continues. The platform evolves. The initiated gather strength.',
      updates: [
        {
          title: 'Advanced Royalty Analytics Dashboard',
          description: 'New visualization tools for licensing trends and revenue patterns.',
          url: 'https://app.yesgoddess.com/updates/royalty-analytics',
        },
      ],
      featuredCreator: {
        name: 'Marcus Chen',
        bio: 'Architectural photographer and visual storyteller.',
        quote: 'YES GODDESS transformed how I license my work.',
        profileUrl: 'https://app.yesgoddess.com/creators/marcus-chen',
      },
      unsubscribeUrl: `https://app.yesgoddess.com/preferences/unsubscribe?user=${userId}`,
    },
  });
}

// Example 8: Sending transaction receipt
async function sendTransactionReceipt(
  email: string,
  recipientName: string,
  transactionId: string,
  amount: number
) {
  await emailService.sendTransactional({
    email,
    subject: 'Payment confirmation: License Purchase',
    template: 'transaction-receipt',
    variables: {
      recipientName,
      transactionType: 'License Purchase',
      amount, // in cents
      transactionDate: new Date(),
      transactionId,
      description: 'Moonlight Photography Collection - Commercial License',
      paymentMethod: 'Visa ending in 4242',
      items: [
        { name: 'Moonlight Photography Collection', price: 300000 },
        { name: 'Extended Commercial Rights', price: 50000 },
      ],
      recipientEmail: email,
    },
  });
}

export {
  sendWelcomeEmail,
  sendEmailVerification,
  sendPasswordReset,
  sendRoyaltyStatement,
  sendLicenseExpiryReminder,
  sendProjectInvitation,
  sendMonthlyNewsletter,
  sendTransactionReceipt,
};
