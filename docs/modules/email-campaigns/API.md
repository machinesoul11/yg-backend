# Email Campaigns API Documentation

Complete API reference for the Email Campaigns system.

## Authentication

All endpoints require authentication. Admin endpoints require `ADMIN` role.

## tRPC Router: `emailCampaigns`

### Campaign Management (Admin Only)

#### `create`

Create a new email campaign in DRAFT status.

**Input:**
```typescript
{
  name: string;                    // Campaign name (1-255 chars)
  description?: string;            // Optional description
  templateId: string;              // React Email template ID
  subject: string;                 // Email subject (1-500 chars)
  previewText?: string;            // Preview text (max 200 chars)
  segmentCriteria?: {              // Audience targeting
    role?: UserRole[];             // Filter by user role
    verificationStatus?: string[]; // Filter by verification
    createdAfter?: Date;           // Users created after
    createdBefore?: Date;          // Users created before
    lastLoginAfter?: Date;         // Active since date
    creatorSpecialties?: string[]; // Creator specialties
    brandIndustries?: string[];    // Brand industries
  };
  scheduledSendTime?: Date;        // When to send (UTC)
  timezone?: string;               // Timezone (default: UTC)
  messagesPerHour?: number;        // Rate limit (default: 1000)
  batchSize?: number;              // Batch size (default: 100)
  tags?: string[];                 // Tags for organization
  metadata?: Record<string, any>;  // Custom metadata
}
```

**Returns:**
```typescript
{
  id: string;
  name: string;
  status: 'DRAFT';
  recipientCount: number;
  // ... full campaign object
}
```

**Example:**
```typescript
const campaign = await trpc.emailCampaigns.create.mutate({
  name: 'Monthly Newsletter - Nov 2025',
  templateId: 'monthly-newsletter',
  subject: 'November Updates from YES GODDESS',
  previewText: 'New features, creator spotlights, and more',
  segmentCriteria: {
    role: ['CREATOR', 'BRAND'],
    lastLoginAfter: new Date('2025-10-01'),
  },
  scheduledSendTime: new Date('2025-11-01T10:00:00Z'),
  tags: ['newsletter', 'monthly'],
});
```

---

#### `update`

Update an existing campaign. Only allowed in DRAFT or SCHEDULED status.

**Input:**
```typescript
{
  id: string;                      // Campaign ID
  data: {
    name?: string;
    description?: string;
    subject?: string;
    previewText?: string;
    segmentCriteria?: { ... };     // If changed, recipients regenerated
    scheduledSendTime?: Date;
    timezone?: string;
    messagesPerHour?: number;
    batchSize?: number;
    tags?: string[];
    metadata?: Record<string, any>;
  };
}
```

**Returns:** Updated campaign object

**Example:**
```typescript
await trpc.emailCampaigns.update.mutate({
  id: 'campaign_xxx',
  data: {
    subject: 'Updated: November Updates',
    scheduledSendTime: new Date('2025-11-01T14:00:00Z'),
  },
});
```

---

#### `schedule`

Schedule a campaign for sending. Validates campaign and queues it.

**Input:**
```typescript
{
  id: string;  // Campaign ID
}
```

**Returns:**
```typescript
{
  success: true;
  scheduledFor: Date;
}
```

**Validations:**
- Campaign must be in DRAFT status
- Must have recipients
- Template must exist
- Scheduled time must be in future (if provided)
- Rate limits must be within platform limits

**Example:**
```typescript
await trpc.emailCampaigns.schedule.mutate({
  id: 'campaign_xxx',
});
```

---

#### `cancel`

Cancel a scheduled or sending campaign.

**Input:**
```typescript
{
  id: string;
  reason?: string;  // Optional cancellation reason
}
```

**Returns:**
```typescript
{
  success: true;
}
```

**Effects:**
- Updates campaign status to CANCELLED
- Removes from send queue
- Marks pending recipients as FAILED
- Records cancellation reason and time

**Example:**
```typescript
await trpc.emailCampaigns.cancel.mutate({
  id: 'campaign_xxx',
  reason: 'Found typo in email content',
});
```

---

#### `sendTest`

Send test emails to specified addresses.

**Input:**
```typescript
{
  id: string;              // Campaign ID
  testEmails: string[];    // Email addresses (1-10)
}
```

**Returns:**
```typescript
{
  success: true;
  sent: number;       // Number of successful sends
  failed: number;     // Number of failures
}
```

**Notes:**
- Test emails are prefixed with `[TEST]` in subject
- Does not affect campaign statistics
- Uses actual campaign template and settings

**Example:**
```typescript
const result = await trpc.emailCampaigns.sendTest.mutate({
  id: 'campaign_xxx',
  testEmails: [
    'admin@yesgoddess.com',
    'test@example.com',
  ],
});

console.log(`Sent ${result.sent}, Failed ${result.failed}`);
```

---

### Campaign Queries (Admin Only)

#### `get`

Get detailed campaign information.

**Input:**
```typescript
{
  id: string;  // Campaign ID
}
```

**Returns:**
```typescript
{
  id: string;
  name: string;
  description: string | null;
  status: EmailCampaignStatus;
  templateId: string;
  subject: string;
  previewText: string | null;
  segmentCriteria: any;
  recipientCount: number;
  scheduledSendTime: Date | null;
  timezone: string;
  sendStartedAt: Date | null;
  sendCompletedAt: Date | null;
  messagesPerHour: number;
  batchSize: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;
  failedCount: number;
  tags: string[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    recipients: number;
  };
}
```

**Example:**
```typescript
const campaign = await trpc.emailCampaigns.get.query({
  id: 'campaign_xxx',
});

console.log(`Status: ${campaign.status}`);
console.log(`Recipients: ${campaign._count.recipients}`);
console.log(`Sent: ${campaign.sentCount}`);
```

---

#### `list`

List campaigns with filtering and pagination.

**Input:**
```typescript
{
  status?: EmailCampaignStatus;  // Filter by status
  limit?: number;                // Results per page (1-100, default: 20)
  cursor?: string;               // Pagination cursor (ISO date string)
}
```

**Returns:**
```typescript
{
  campaigns: Array<Campaign>;
  nextCursor?: string;  // For next page, undefined if no more
}
```

**Example:**
```typescript
// Get scheduled campaigns
const { campaigns, nextCursor } = await trpc.emailCampaigns.list.query({
  status: 'SCHEDULED',
  limit: 20,
});

// Get next page
if (nextCursor) {
  const nextPage = await trpc.emailCampaigns.list.query({
    status: 'SCHEDULED',
    cursor: nextCursor,
  });
}
```

---

#### `analytics`

Get comprehensive campaign analytics.

**Input:**
```typescript
{
  id: string;  // Campaign ID
}
```

**Returns:**
```typescript
{
  campaign: {
    id: string;
    name: string;
    status: EmailCampaignStatus;
    sentCount: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
    failedCount: number;
  };
  rates: {
    deliveryRate: number;     // Percentage
    openRate: number;         // Percentage
    clickRate: number;        // Percentage (of opens)
    bounceRate: number;       // Percentage
    unsubscribeRate: number;  // Percentage
  };
  statusBreakdown: Array<{
    status: CampaignRecipientStatus;
    _count: number;
  }>;
  topLinks: Array<{
    url: string;
    clicks: number;
  }>;
}
```

**Example:**
```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: 'campaign_xxx',
});

console.log('Delivery Rate:', analytics.rates.deliveryRate + '%');
console.log('Open Rate:', analytics.rates.openRate + '%');
console.log('Click Rate:', analytics.rates.clickRate + '%');
console.log('\nTop Links:');
analytics.topLinks.forEach(link => {
  console.log(`  ${link.url}: ${link.clicks} clicks`);
});
```

---

#### `recipients`

List campaign recipients with status filtering.

**Input:**
```typescript
{
  id: string;                         // Campaign ID
  status?: CampaignRecipientStatus;   // Filter by status
  limit?: number;                     // Results per page (1-100, default: 50)
  cursor?: string;                    // Pagination cursor
}
```

**Returns:**
```typescript
{
  recipients: Array<{
    id: string;
    campaignId: string;
    userId: string | null;
    email: string;
    status: CampaignRecipientStatus;
    sentAt: Date | null;
    deliveredAt: Date | null;
    openedAt: Date | null;
    firstClickedAt: Date | null;
    bouncedAt: Date | null;
    unsubscribedAt: Date | null;
    complainedAt: Date | null;
    errorMessage: string | null;
    retryCount: number;
    messageId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  nextCursor?: string;
}
```

**Example:**
```typescript
// Get delivered recipients
const { recipients } = await trpc.emailCampaigns.recipients.query({
  id: 'campaign_xxx',
  status: 'DELIVERED',
  limit: 50,
});

recipients.forEach(r => {
  console.log(`${r.email}: ${r.status}`);
  if (r.openedAt) console.log(`  Opened: ${r.openedAt}`);
  if (r.firstClickedAt) console.log(`  Clicked: ${r.firstClickedAt}`);
});
```

---

### Preference Center (User Endpoints)

#### `getMyPreferences`

Get current user's email preferences.

**No input required**

**Returns:**
```typescript
{
  id: string;
  userId: string;
  royaltyStatements: boolean;
  licenseExpiry: boolean;
  projectInvitations: boolean;
  messages: boolean;
  payouts: boolean;
  digestFrequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  newsletters: boolean;
  announcements: boolean;
  unsubscribedAt: Date | null;
  globalUnsubscribe: boolean;
  categoryPreferences: Record<string, boolean> | null;
  frequencyPreference: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Example:**
```typescript
const prefs = await trpc.emailCampaigns.getMyPreferences.query();

console.log('Newsletters:', prefs.newsletters);
console.log('Digest:', prefs.digestFrequency);
```

---

#### `updateMyPreferences`

Update current user's email preferences.

**Input:**
```typescript
{
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: 'immediate' | 'daily' | 'weekly';
}
```

**Returns:** Updated preferences object

**Effects:**
- Updates specified preferences
- Invalidates cache
- Logs change to audit system

**Example:**
```typescript
await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: false,
  announcements: true,
  digestFrequency: 'WEEKLY',
  categoryPreferences: {
    productUpdates: true,
    promotions: false,
  },
});
```

---

#### `unsubscribe`

Globally unsubscribe from all emails.

**Input:**
```typescript
{
  email: string;
  campaignId?: string;     // If unsubscribing from campaign
  categories?: string[];   // For category unsubscribe
  reason?: string;         // Optional reason
  userAgent?: string;      // Browser info
  ipAddress?: string;      // IP address
}
```

**Returns:**
```typescript
{
  success: true;
}
```

**Effects:**
- Sets `globalUnsubscribe` to true
- Turns off all email categories
- Adds to suppression list
- Logs unsubscribe event

**Example:**
```typescript
await trpc.emailCampaigns.unsubscribe.mutate({
  email: 'user@example.com',
  reason: 'Too many emails',
});
```

---

#### `resubscribe`

Opt back in to emails (removes global unsubscribe).

**No input required**

**Returns:**
```typescript
{
  success: true;
}
```

**Effects:**
- Sets `globalUnsubscribe` to false
- Removes from suppression list
- Does NOT automatically re-enable categories

**Example:**
```typescript
await trpc.emailCampaigns.resubscribe.mutate();

// Then update preferences to enable desired categories
await trpc.emailCampaigns.updateMyPreferences.mutate({
  newsletters: true,
  announcements: true,
});
```

---

### GDPR Compliance (User Endpoints)

#### `exportMyEmailData`

Export all email-related data for current user.

**No input required**

**Returns:**
```typescript
{
  personalInfo: {
    email: string;
    name: string | null;
  };
  preferences: EmailPreferences;
  recentEvents: Array<EmailEvent>;     // Last 100
  unsubscribeHistory: Array<UnsubscribeLog>;
  scheduledEmails: Array<ScheduledEmail>;
}
```

**Example:**
```typescript
const data = await trpc.emailCampaigns.exportMyEmailData.query();

console.log('Email:', data.personalInfo.email);
console.log('Total events:', data.recentEvents.length);
console.log('Preferences:', JSON.stringify(data.preferences, null, 2));

// Save to file
const blob = new Blob([JSON.stringify(data, null, 2)], 
  { type: 'application/json' });
```

---

#### `deleteMyEmailData`

Delete/anonymize all email data (GDPR right to be forgotten).

**No input required**

**Returns:**
```typescript
{
  success: true;
}
```

**Effects:**
- Anonymizes email events (removes PII, keeps stats)
- Deletes email preferences
- Anonymizes unsubscribe logs
- Cancels scheduled emails
- Invalidates caches

**Warning:** This is irreversible!

**Example:**
```typescript
// Confirm with user first!
if (confirm('Are you sure? This cannot be undone.')) {
  await trpc.emailCampaigns.deleteMyEmailData.mutate();
  console.log('Email data deleted');
}
```

---

## Error Handling

All endpoints return standard tRPC errors:

```typescript
try {
  await trpc.emailCampaigns.schedule.mutate({ id: 'xxx' });
} catch (error) {
  if (error.data?.code === 'NOT_FOUND') {
    console.error('Campaign not found');
  } else if (error.data?.code === 'BAD_REQUEST') {
    console.error('Validation error:', error.message);
  } else if (error.data?.code === 'FORBIDDEN') {
    console.error('Permission denied');
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid input or state
- `INTERNAL_SERVER_ERROR` - Server error

---

## Rate Limits

API rate limits:
- General endpoints: 100 requests/minute per user
- Campaign creation: 10/hour per admin
- Test emails: 50/hour per admin

Email sending rate limits (configurable per campaign):
- Default: 1000 messages/hour
- Maximum: 10000 messages/hour

---

## Webhooks

Email provider webhooks automatically update campaign statistics.

**Endpoint:** `POST /api/webhooks/resend`

**Events processed:**
- `email.delivered` → Updates delivered count
- `email.opened` → Updates opened count
- `email.clicked` → Tracks clicks, updates clicked count
- `email.bounced` → Updates bounced count, adds to suppression
- `email.complained` → Updates complained count, adds to suppression

Campaign recipients are automatically updated in real-time.

---

## Testing

### Test Campaign Creation

```typescript
const testCampaign = await trpc.emailCampaigns.create.mutate({
  name: 'Test Campaign',
  templateId: 'welcome-email',
  subject: 'Test',
  segmentCriteria: {
    role: ['ADMIN'],  // Only admins
  },
});
```

### Test Email Sending

```typescript
await trpc.emailCampaigns.sendTest.mutate({
  id: testCampaign.id,
  testEmails: ['your-email@example.com'],
});
```

### Check Results

```typescript
const analytics = await trpc.emailCampaigns.analytics.query({
  id: testCampaign.id,
});

console.log('Sent:', analytics.campaign.sentCount);
console.log('Delivery Rate:', analytics.rates.deliveryRate + '%');
```

---

## Best Practices

1. **Always test first** - Use `sendTest` before scheduling
2. **Start small** - Test with small segments initially
3. **Monitor closely** - Check analytics frequently
4. **Respect preferences** - The system handles this automatically
5. **Handle errors** - Implement proper error handling
6. **Log actions** - All actions are automatically audited
7. **Use tags** - Organize campaigns with tags
8. **Document metadata** - Use metadata field for custom data

---

## Support

For API issues or questions:
- Check error messages carefully
- Review implementation summary
- Check database with Prisma Studio
- Review logs for detailed errors

See [Quick Start Guide](./QUICK_START.md) for usage examples.
See [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) for technical details.
