# Email Templates - Quick Reference

## 🚀 Quick Start

### Preview Templates Locally
```bash
npm run email:dev
```
Opens preview server at `http://localhost:3000`

### Send an Email
```typescript
import { emailService } from '@/lib/services/email/email.service';

await emailService.sendTransactional({
  email: 'user@example.com',
  subject: 'Welcome to YES GODDESS',
  template: 'welcome-email',
  variables: {
    userName: 'Jane',
    verificationUrl: 'https://...',
    role: 'creator',
  },
});
```

## 📧 Available Templates

| Template Key | Subject Line Example | Use Case |
|-------------|---------------------|----------|
| `welcome-email` | Welcome to YES GODDESS | New account creation |
| `email-verification` | Verify your email | Email verification |
| `password-reset` | Reset your password | Password reset request |
| `password-changed` | Password changed | Password change confirmation |
| `royalty-statement` | Your royalties: Oct statement | Monthly royalty notification |
| `license-expiry` | License expiring: [Asset] | 90/60/30 day reminders |
| `payout-confirmation` | Payment confirmed | Payout processed |
| `project-invitation` | Project invitation: [Name] | Collaboration invite |
| `monthly-newsletter` | YES GODDESS: [Month] Update | Monthly digest |
| `transaction-receipt` | Payment confirmation | Purchase receipt |

## 🎨 Using Components

### Import Components
```typescript
import { EmailLayout } from '../components/EmailLayout';
import { H1, H2, Text } from '../components/Typography';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
```

### Basic Template Structure
```tsx
export default function YourTemplate({ userName, actionUrl }) {
  return (
    <EmailLayout previewText="Preview text here">
      <H1>HEADING IN ALL CAPS</H1>
      <Text>{userName},</Text>
      <Text>Your message content here.</Text>
      <Button href={actionUrl}>Take Action</Button>
      <Divider />
      <Text style={{ color: EMAIL_COLORS.SANCTUM }}>
        Secondary information.
      </Text>
    </EmailLayout>
  );
}
```

## 🎯 Brand Guidelines Quick Ref

### Colors
```typescript
import { EMAIL_COLORS } from '../styles/brand';

EMAIL_COLORS.VOID      // #0A0A0A - Background
EMAIL_COLORS.BONE      // #F8F6F3 - Primary text
EMAIL_COLORS.ALTAR     // #B8A888 - Accent/CTA
EMAIL_COLORS.SANCTUM   // #C4C0B8 - Secondary text
```

### Typography Rules
- **H1**: ALL CAPS, +200 tracking (2px letter-spacing)
- **H2**: Title Case, +150 tracking (1.5px)
- **Body**: +25-50 tracking (0.5px)
- **Captions**: ALL CAPS, +150 tracking
- **NO bold or italic** (except Declaration component)

### Voice
- ✅ "The work" ❌ "content"
- ✅ "Creator" ❌ "user"
- ✅ Periods. ❌ Exclamation points!
- ✅ Declarative ❌ Questions?
- ✅ "The work is sacred. The creator is sovereign."

## 🧪 Testing

### Test Data
```typescript
import { emailFixtures } from '../fixtures/testData';

// Use in preview or tests
const props = emailFixtures.welcomeEmail;
```

### Preview Individual Template
```bash
npm run email:dev
# Navigate to http://localhost:3000
# Select template from sidebar
```

### Send Test Email (Dev)
```typescript
// Uses Resend test mode in development
await emailService.sendTransactional({
  email: 'test@youremail.com',
  subject: 'Test Email',
  template: 'welcome-email',
  variables: emailFixtures.welcomeEmail,
});
```

## 📝 Common Patterns

### Project Props Interface
```typescript
interface YourTemplateProps {
  userName: string;
  actionUrl: string;
  date?: Date;
}

export default function YourTemplate({
  userName = 'Creator',      // Default values
  actionUrl = '',
  date = new Date(),
}: YourTemplateProps) {
  // Template JSX
}
```

### Conditional Content
```tsx
{expiryDays <= 30 && (
  <Text style={{ color: EMAIL_COLORS.CAUTION }}>
    ⚠️ Urgent: Action required soon
  </Text>
)}
```

### Lists (Em Dash Bullets)
```tsx
<Text>
  — First item<br />
  — Second item<br />
  — Third item
</Text>
```

### Date Formatting
```typescript
const formatted = date.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
```

### Currency Formatting
```typescript
// Amount in cents
const dollars = (amount / 100).toFixed(2);
// Result: "1,234.56"
```

## 🔗 File Locations

```
emails/
├── components/       # Reusable components
├── templates/        # Email templates
├── styles/           # Brand styles
├── fixtures/         # Test data
├── examples/         # Usage examples
└── README.md         # Full documentation
```

## 🆘 Troubleshooting

### Template Not Showing in Preview
```bash
# Restart dev server
npm run email:dev
```

### Email Not Sending
1. Check `RESEND_API_KEY` is set
2. Verify sender email is verified in Resend
3. Check email service logs
4. Confirm template is registered in `templates.ts`

### Styling Issues
- Email HTML is limited
- Use tables for complex layouts
- Test in multiple clients
- Inline styles auto-applied by React Email

## 📚 Documentation

- **Full Guide**: `/emails/README.md`
- **Brand Guidelines**: `/docs/brand/guidelines.md`
- **Email Service**: `/src/lib/services/email/email.service.ts`
- **Usage Examples**: `/emails/examples/usage.ts`
- **Test Data**: `/emails/fixtures/testData.ts`

## 🎓 Resources

- [React Email Docs](https://react.email)
- [Resend Docs](https://resend.com/docs)
- [Email on Acid](https://www.emailonacid.com/) - Testing tool

---

**Remember**: Every email reinforces the YES GODDESS philosophy. The creator is sovereign. The work is sacred.
