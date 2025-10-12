/**
 * Test Data Fixtures for Email Templates
 * Use these for development, testing, and the React Email preview server
 */

// Welcome Email
export const welcomeEmailData = {
  userName: 'Jane Creator',
  verificationUrl: 'https://app.yesgoddess.com/verify-email?token=abc123',
  role: 'creator' as const,
};

// Email Verification
export const emailVerificationData = {
  userName: 'Jane Creator',
  verificationUrl: 'https://app.yesgoddess.com/verify-email?token=abc123',
};

// Password Reset
export const passwordResetData = {
  userName: 'Jane Creator',
  resetUrl: 'https://app.yesgoddess.com/reset-password?token=xyz789',
};

// Royalty Statement
export const royaltyStatementData = {
  userName: 'Jane Creator',
  period: 'October 2025',
  totalAmount: '2,450.00',
  currency: 'USD',
  statementUrl: 'https://app.yesgoddess.com/royalties/statement/oct-2025',
  royalties: [
    { licenseName: 'Moonlight Photography Collection', amount: '1,200.00' },
    { licenseName: 'Urban Landscape Series', amount: '850.00' },
    { licenseName: 'Portrait Mastery Bundle', amount: '400.00' },
  ],
};

// License Expiry
export const licenseExpiryData = {
  userName: 'Jane Creator',
  licenseName: 'Moonlight Photography Collection',
  brandName: 'Lumina Cosmetics',
  expiryDate: 'December 15, 2025',
  daysRemaining: 30,
  renewalUrl: 'https://app.yesgoddess.com/licenses/12345/renew',
};

// Payout Confirmation
export const payoutConfirmationData = {
  userName: 'Jane Creator',
  amount: '2,450.00',
  currency: 'USD',
  period: 'October 2025',
  transferId: 'po_1234567890',
  estimatedArrival: 'November 5, 2025',
};

// Project Invitation
export const projectInvitationData = {
  creatorName: 'Jane Creator',
  projectName: 'Autumn Collection Campaign 2025',
  brandName: 'Lumina Cosmetics',
  budgetRange: '$8,000 - $12,000',
  timeline: '6-8 weeks',
  briefExcerpt:
    'Seeking a photographer to collaborate on our autumn collection campaign. We are looking for moody, atmospheric imagery that captures the essence of transformation and natural beauty. Your urban landscape work caught our attention.',
  projectUrl: 'https://app.yesgoddess.com/projects/autumn-2025',
  responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

// Monthly Newsletter
export const monthlyNewsletterData = {
  month: 'October 2025',
  introduction:
    'The work continues. The platform evolves. The initiated gather strength. This month brings new tools for sovereignty, expanded collaboration opportunities, and insights from the creator economy leading edge.',
  updates: [
    {
      title: 'Advanced Royalty Analytics Dashboard',
      description:
        'New visualization tools show licensing trends, revenue patterns, and portfolio performance metrics. Understand your work value like never before.',
      url: 'https://app.yesgoddess.com/updates/royalty-analytics',
    },
    {
      title: 'Collaborative Ownership Framework 2.0',
      description:
        'Enhanced tools for multi-creator projects with automatic split calculations, transparent attribution, and immutable ownership records.',
      url: 'https://app.yesgoddess.com/updates/ownership-framework',
    },
    {
      title: 'Brand Verification Streamlining',
      description:
        'Faster verification process for established brands, with priority access to creator portfolios and project matching algorithms.',
    },
  ],
  featuredCreator: {
    name: 'Marcus Chen',
    bio: 'Architectural photographer and visual storyteller specializing in the intersection of built environment and human experience.',
    quote:
      'YES GODDESS transformed how I license my work. Full ownership. Fair compensation. No compromise. The platform treats my photography as the art it is, not content to be commodified.',
    imageUrl: 'https://placeholders.dev/100x100',
    profileUrl: 'https://app.yesgoddess.com/creators/marcus-chen',
  },
  insights: {
    title: 'The Ownership Economy: Why IP Rights Matter More Than Ever',
    excerpt:
      'As AI-generated content floods the market, human creators with provable ownership and authentic attribution become increasingly valuable. We explore why platforms built on creator sovereignty will outlast those built on extraction.',
    url: 'https://yesgoddess.com/blog/ownership-economy-2025',
  },
  unsubscribeUrl: 'https://app.yesgoddess.com/preferences/unsubscribe',
};

// Transaction Receipt
export const transactionReceiptData = {
  recipientName: 'Lumina Cosmetics',
  transactionType: 'License Purchase',
  amount: 350000, // $3,500.00 in cents
  transactionDate: new Date('2025-10-15'),
  transactionId: 'txn_1N2M3K4L5M6N7P8Q9',
  description: 'Moonlight Photography Collection - Commercial License',
  paymentMethod: 'Visa ending in 4242',
  items: [
    { name: 'Moonlight Photography Collection', price: 300000 },
    { name: 'Extended Commercial Rights', price: 50000 },
  ],
  recipientEmail: 'licensing@luminacosmetics.com',
};

// Brand Welcome
export const brandWelcomeData = {
  brandName: 'Lumina Cosmetics',
  contactName: 'Sarah Martinez',
  verificationUrl: 'https://app.yesgoddess.com/brands/verify',
};

// Creator Welcome
export const creatorWelcomeData = {
  creatorName: 'Jane Creator',
  profileUrl: 'https://app.yesgoddess.com/profile/complete',
  ipFrameworkUrl: 'https://app.yesgoddess.com/learn/ip-framework',
  briefsUrl: 'https://app.yesgoddess.com/projects/explore',
};

// Creator Verification Approved
export const creatorVerificationApprovedData = {
  creatorName: 'Jane Creator',
  dashboardUrl: 'https://app.yesgoddess.com/dashboard',
};

// Brand Team Invitation
export const brandTeamInvitationData = {
  inviteeName: 'Alex Johnson',
  inviterName: 'Sarah Martinez',
  brandName: 'Lumina Cosmetics',
  role: 'Project Manager',
  acceptUrl: 'https://app.yesgoddess.com/invites/accept?token=inv_abc123',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

// Role Changed
export const roleChangedData = {
  userName: 'Alex Johnson',
  oldRole: 'Team Member',
  newRole: 'Administrator',
  changedBy: 'Sarah Martinez',
};

// Password Changed
export const passwordChangedData = {
  userName: 'Jane Creator',
  changeDate: new Date(),
  ipAddress: '192.168.1.1',
  supportUrl: 'https://yesgoddess.com/support',
};

// Aggregate all fixtures for easy import
export const emailFixtures = {
  welcomeEmail: welcomeEmailData,
  emailVerification: emailVerificationData,
  passwordReset: passwordResetData,
  royaltyStatement: royaltyStatementData,
  licenseExpiry: licenseExpiryData,
  payoutConfirmation: payoutConfirmationData,
  projectInvitation: projectInvitationData,
  monthlyNewsletter: monthlyNewsletterData,
  transactionReceipt: transactionReceiptData,
  brandWelcome: brandWelcomeData,
  creatorWelcome: creatorWelcomeData,
  creatorVerificationApproved: creatorVerificationApprovedData,
  brandTeamInvitation: brandTeamInvitationData,
  roleChanged: roleChangedData,
  passwordChanged: passwordChangedData,
};

export default emailFixtures;
