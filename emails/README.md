# YES GODDESS Email Templates

This directory contains all React Email templates for the YES GODDESS platform. Templates follow the brand guidelines documented in `/docs/brand/guidelines.md`.

## Directory Structure

```
emails/
├── components/          # Reusable email components
│   ├── Button.tsx      # Primary & secondary buttons
│   ├── Divider.tsx     # Horizontal rules
│   ├── EmailLayout.tsx # Base layout wrapper
│   ├── Footer.tsx      # Standard footer
│   ├── Header.tsx      # Standard header with logo
│   └── Typography.tsx  # H1, H2, H3, Text, Caption, Declaration
├── styles/
│   └── brand.ts        # Brand colors, fonts, and email styles
└── templates/          # Individual email templates
    ├── WelcomeEmail.tsx
    ├── EmailVerification.tsx
    ├── PasswordReset.tsx
    ├── RoyaltyStatement.tsx
    ├── LicenseExpiry.tsx
    ├── ProjectInvitation.tsx
    ├── MonthlyNewsletter.tsx
    ├── TransactionReceipt.tsx
    └── [other templates...]
```

## Brand Compliance

All templates adhere to the YES GODDESS brand guidelines:

### Colors
- **VOID (#0A0A0A)**: Primary background, obsidian black
- **BONE (#F8F6F3)**: Primary text on dark, alabaster white
- **ALTAR (#B8A888)**: Accent only, CTAs, muted gold
- **SANCTUM (#C4C0B8)**: Secondary text, borders, stone gray

### Typography
- **Font**: Montserrat for body, Playfair Display for declarations
- **Tracking**: Extended letter-spacing per brand guidelines
  - H1: +200 (2px), ALL CAPS
  - H2: +150 (1.5px), Title Case
  - Body: +25 to +50 (0.5px)
  - Captions: +150 (1.5px), ALL CAPS
- **No bold or italic** (except Declaration component uses italic)

### Voice & Tone
- Authoritative yet invitational
- Ceremonial, not casual
- "The work" not "content"
- "Creator" not "user"
- Declarative statements, periods not exclamation points
- Em dashes with spaces: word — word

## Development

### Preview Templates

Run the React Email development server to preview all templates:

```bash
npm run email:dev
```

This opens a browser at `http://localhost:3000` showing all templates with live reload.

### Build Templates

To build static HTML versions:

```bash
npm run email:build
```

### Creating a New Template

1. Create a new file in `emails/templates/YourTemplate.tsx`
2. Import and use shared components from `emails/components/`
3. Import brand styles from `emails/styles/brand.ts`
4. Follow the pattern of existing templates
5. Register in `/src/lib/services/email/templates.ts`

**Example:**

```tsx
import React from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { H1, Text } from '../components/Typography';
import { Button } from '../components/Button';

interface YourTemplateProps {
  userName: string;
  actionUrl: string;
}

export default function YourTemplate({
  userName,
  actionUrl,
}: YourTemplateProps) {
  return (
    <EmailLayout previewText="Preview text here">
      <H1>Welcome</H1>
      <Text>{userName},</Text>
      <Text>Your content here.</Text>
      <Button href={actionUrl}>Take Action</Button>
    </EmailLayout>
  );
}
```

### Testing

1. **Development Preview**: Use `npm run email:dev` to see visual output
2. **Send Test Email**: Use Resend test mode in development
3. **Cross-Client Testing**: Send to Gmail, Outlook, Apple Mail
4. **Mobile Testing**: Check responsive behavior

### Template Registry

To make a template available for sending, register it in:

`/src/lib/services/email/templates.ts`

```typescript
import YourTemplate from '../../../../emails/templates/YourTemplate';

export const EMAIL_TEMPLATES = {
  // ...existing templates
  'your-template': YourTemplate,
} as const;
```

And add to category mapping:

```typescript
export function getCategoryFromTemplate(template: string): string {
  const mapping: Record<string, string> = {
    // ...existing mappings
    'your-template': 'categoryName',
  };
  return mapping[template] || 'other';
}
```

## Available Templates

### Transactional
- **WelcomeEmail**: Sent when creator/brand account is created
- **EmailVerification**: Email address verification link
- **PasswordReset**: Password reset request
- **PasswordChanged**: Confirmation of password change
- **TransactionReceipt**: General payment confirmation

### Notifications
- **RoyaltyStatement**: Monthly royalty statement available
- **LicenseExpiry**: License expiring in 90/60/30 days
- **PayoutConfirmation**: Payout processed confirmation
- **ProjectInvitation**: Invited to collaborate on project

### Marketing
- **MonthlyNewsletter**: Monthly platform updates and insights

### Brand-Specific
- **BrandWelcome**: Brand account welcome
- **BrandVerificationRequest**: Brand verification submitted
- **BrandVerificationComplete**: Brand verified
- **BrandVerificationRejected**: Brand verification declined
- **BrandTeamInvitation**: Invitation to join brand team

### Creator-Specific
- **CreatorWelcome**: Creator account welcome
- **CreatorVerificationApproved**: Creator application approved
- **CreatorVerificationRejected**: Creator application declined

### System
- **RoleChanged**: User role updated notification

## Shared Components

### EmailLayout
Wrapper providing header, footer, and consistent styling.

```tsx
<EmailLayout previewText="Preview text" unsubscribeUrl="optional">
  {children}
</EmailLayout>
```

### Typography

```tsx
<H1>Primary Heading</H1>          // ALL CAPS, +200 tracking
<H2>Secondary Heading</H2>         // Title Case, +150 tracking
<H3>Tertiary Heading</H3>          // +100 tracking
<Text>Body text</Text>             // +25-50 tracking
<Caption>CAPTION TEXT</Caption>    // ALL CAPS, +150 tracking
<Declaration>Italic serif</Declaration> // Playfair Display, italic
```

### Button

```tsx
<Button href="/url">Primary Action</Button>
<Button href="/url" variant="secondary">Secondary Action</Button>
```

### Divider

```tsx
<Divider />                  // Standard gray divider
<Divider variant="gold" />   // Gold divider for emphasis
```

### Header & Footer

Automatically included in `EmailLayout`, but can be used standalone:

```tsx
<Header />
<Footer unsubscribeUrl="/unsubscribe" />
```

## Email Sending Service

Templates are rendered and sent via `/src/lib/services/email/email.service.ts`:

```typescript
await emailService.sendTransactional({
  email: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome-email',
  variables: {
    userName: 'Jane Creator',
    verificationUrl: 'https://...',
  },
});
```

## Email Client Compatibility

### Tested Clients
- Gmail (Desktop & Mobile)
- Apple Mail (macOS, iOS)
- Outlook (Desktop & Web)
- Proton Mail
- Hey

### Known Limitations
- Extended tracking may render inconsistently in older Outlook versions
- Some clients strip custom fonts; fallbacks ensure readability
- Keep HTML under 102KB to avoid Gmail clipping
- Use table-based layouts for complex structures

## Brand Voice Guidelines

When writing email copy, remember:

- **Authority**: We speak from certainty
- **Reverence**: Honor the work and the creator
- **Precision**: Every word chosen with intention
- **Restraint**: Minimal, powerful, not verbose
- **Sacred**: Creation is divine, compensation is offering

**Prohibited:**
- Exclamation points
- "Content" (use "the work")
- "Users" (use "creators", "artists", "brands")
- Casual or familiar tone
- Marketing jargon
- Emojis (except functional: ⚠️ for warnings)

**Encouraged:**
- Em dashes for emphasis
- Short, declarative statements
- "The work is sacred. The creator is sovereign."
- Periods end sentences. Always.

## Environment Variables

Required for email sending:

```env
RESEND_API_KEY=re_xxxxx
RESEND_SENDER_EMAIL=hello@yesgoddess.com
EMAIL_FROM_NAME=YES GODDESS
NEXT_PUBLIC_APP_URL=https://yesgoddess.com
```

## Troubleshooting

### Templates Not Showing in Preview
- Restart the dev server: `npm run email:dev`
- Check for TypeScript errors in template files
- Ensure all imports are correct

### Emails Not Sending
- Verify `RESEND_API_KEY` is set
- Check sender email is verified in Resend
- Review logs for provider errors
- Confirm template is registered in `templates.ts`

### Styling Issues
- Email HTML is limited; use tables for complex layouts
- All styles must be inline or in `<style>` tags
- Test across multiple clients
- Avoid modern CSS (flexbox works in some clients, grid doesn't)

### Colors Look Different
- Email clients may adjust colors
- Ensure sufficient contrast (WCAG AA minimum)
- Test in dark mode (some clients override backgrounds)

## Resources

- [React Email Documentation](https://react.email)
- [Resend Documentation](https://resend.com/docs)
- [YES GODDESS Brand Guidelines](/docs/brand/guidelines.md)
- [Email on Acid](https://www.emailonacid.com/) - Cross-client testing

## Support

For questions or issues:
- Internal: Check `/docs/brand/guidelines.md`
- Technical: Review email service logs
- Design: Refer to brand guidelines
- Integration: See `/src/lib/services/email/email.service.ts`
