# Message Notifications - Quick Start Guide

## For Developers

### Running the System

#### 1. Apply Database Migration

```bash
# Run the migration to add MESSAGE notification type
psql $DATABASE_URL < migrations/add_message_notification_type.sql
```

#### 2. Start Message Notification Worker

```bash
# In a separate terminal
npm run worker:message-notifications
```

Or add to your process manager (PM2, systemd, etc.):

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'message-notifications',
      script: 'src/jobs/message-notification.job.ts',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
```

#### 3. Schedule Digest Jobs

Add to your cron scheduler or use a job scheduler:

**Daily Digest (9 AM):**
```bash
0 9 * * * npm run job:message-digest -- --frequency daily
```

**Weekly Digest (Monday 9 AM):**
```bash
0 9 * * 1 npm run job:message-digest -- --frequency weekly
```

### Testing Notifications

#### Test Immediate Notification

```typescript
// Send a message (triggers automatic notification)
const result = await trpc.messages.sendMessage.mutate({
  threadId: 'thread-123',
  recipientId: 'user-456',
  body: 'Hello! This is a test message.',
});

// Check:
// 1. In-app notification created in notifications table
// 2. Email queued in message-notifications queue
// 3. Email sent via Resend
```

#### Test Digest

```bash
# Manually trigger daily digest
npm run job:message-digest -- --frequency daily

# Check email for users with:
# - digestFrequency: 'daily'
# - Unread messages from last 24 hours
```

#### Test Preferences

```typescript
// Update user notification preferences
await trpc.messages.updateNotificationPreferences.mutate({
  emailNotifications: 'digest',
  digestFrequency: 'daily',
  inAppNotifications: true,
});

// Mute a specific thread
await trpc.messages.muteThread.mutate({
  threadId: 'thread-123',
});
```

### Debugging

#### Check Queue Status

```typescript
import { messageNotificationQueue } from '@/modules/messages';

// Get queue stats
const stats = await messageNotificationQueue.getJobCounts();
console.log('Waiting jobs:', stats.waiting);
console.log('Active jobs:', stats.active);
console.log('Failed jobs:', stats.failed);

// Get failed jobs
const failed = await messageNotificationQueue.getFailed();
failed.forEach(job => {
  console.log('Failed job:', job.id, job.failedReason);
});
```

#### Check Email Cooldown

```bash
# In Redis CLI
redis-cli

# Check if cooldown is active for a user/thread
GET message:email_cooldown:{userId}:{threadId}

# TTL shows seconds remaining
TTL message:email_cooldown:{userId}:{threadId}
```

#### Check User Preferences

```sql
-- Check user's message notification preferences
SELECT 
  u.email,
  ep.messages,
  ep.category_preferences
FROM users u
LEFT JOIN email_preferences ep ON ep.user_id = u.id
WHERE u.id = 'user-id-here';
```

### Common Issues

#### Emails Not Sending

**Check:**
1. Worker is running: `ps aux | grep message-notification`
2. Queue connection: Verify Redis is accessible
3. User preferences: Check `messages` is true in email_preferences
4. Suppression list: Verify email not suppressed
5. Worker logs: Check for error messages

**Solution:**
```bash
# Restart worker
pm2 restart message-notifications

# Check worker logs
pm2 logs message-notifications

# Check queue
npm run queue:inspect message-notifications
```

#### Digest Not Sending

**Check:**
1. Cron job is running
2. Users have correct `digestFrequency` in preferences
3. Users have unread messages in time period
4. Users are active and not unsubscribed

**Solution:**
```bash
# Manually trigger to debug
npm run job:message-digest -- --frequency daily --debug

# Check logs
tail -f logs/message-digest.log
```

#### Duplicate Notifications

**Check:**
1. Only one worker instance running
2. Cooldown is working (Redis keys exist)
3. Job deduplication settings

**Solution:**
```bash
# Check running workers
pm2 list | grep message

# Verify Redis cooldown
redis-cli KEYS "message:email_cooldown:*"

# Clear cooldowns if testing
redis-cli DEL $(redis-cli KEYS "message:email_cooldown:*")
```

---

## For Frontend Developers

### Using Message Notifications

#### Send Message with Notification

```typescript
// Send message - notification happens automatically
const { message } = await trpc.messages.sendMessage.mutate({
  threadId: thread.id,
  recipientId: recipient.id,
  body: 'Your message here',
});
// ✅ In-app notification created
// ✅ Email queued (if user has immediate notifications)
```

#### Update Notification Preferences

```typescript
// User settings page
const updatePreferences = async (prefs) => {
  await trpc.messages.updateNotificationPreferences.mutate({
    emailNotifications: prefs.emailType, // 'immediate' | 'digest' | 'off'
    inAppNotifications: prefs.showInApp,
    digestFrequency: prefs.digestFrequency, // 'daily' | 'weekly'
  });
};
```

#### Mute/Unmute Thread

```typescript
// Thread settings/options menu
const muteThread = async (threadId: string) => {
  await trpc.messages.muteThread.mutate({ threadId });
  // User will no longer receive notifications for this thread
};

const unmuteThread = async (threadId: string) => {
  await trpc.messages.unmuteThread.mutate({ threadId });
  // Notifications resume for this thread
};
```

#### Listen for New In-App Notifications

```typescript
// Using Tanstack Query
const { data: unreadCount } = trpc.notifications.getUnreadCount.useQuery(
  undefined,
  {
    refetchInterval: 30000, // Poll every 30 seconds
  }
);

// Or use optimistic updates when sending
const utils = trpc.useContext();
const sendMessage = trpc.messages.sendMessage.useMutation({
  onSuccess: () => {
    // Invalidate recipient's notification count
    utils.notifications.getUnreadCount.invalidate();
  },
});
```

### UI Components

#### Notification Preference Settings

```tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function MessageNotificationSettings() {
  const [prefs, setPrefs] = useState({
    emailNotifications: 'immediate',
    inAppNotifications: true,
    digestFrequency: 'daily',
  });

  const updateMutation = trpc.messages.updateNotificationPreferences.useMutation();

  const handleSave = async () => {
    await updateMutation.mutateAsync(prefs);
  };

  return (
    <div className="space-y-4">
      <h3>Message Notifications</h3>
      
      {/* Email Preference */}
      <div>
        <label>Email Notifications</label>
        <select
          value={prefs.emailNotifications}
          onChange={(e) => setPrefs({ ...prefs, emailNotifications: e.target.value })}
        >
          <option value="immediate">Immediate</option>
          <option value="digest">Daily/Weekly Digest</option>
          <option value="off">Off</option>
        </select>
      </div>

      {/* Digest Frequency */}
      {prefs.emailNotifications === 'digest' && (
        <div>
          <label>Digest Frequency</label>
          <select
            value={prefs.digestFrequency}
            onChange={(e) => setPrefs({ ...prefs, digestFrequency: e.target.value })}
          >
            <option value="daily">Daily (9 AM)</option>
            <option value="weekly">Weekly (Monday 9 AM)</option>
          </select>
        </div>
      )}

      {/* In-App Preference */}
      <div>
        <label>
          <input
            type="checkbox"
            checked={prefs.inAppNotifications}
            onChange={(e) => setPrefs({ ...prefs, inAppNotifications: e.target.checked })}
          />
          Show in-app notifications
        </label>
      </div>

      <button onClick={handleSave} disabled={updateMutation.isLoading}>
        Save Preferences
      </button>
    </div>
  );
}
```

#### Thread Mute Toggle

```tsx
import { trpc } from '@/lib/trpc';

export function ThreadMuteToggle({ threadId, isMuted }: { threadId: string; isMuted: boolean }) {
  const utils = trpc.useContext();
  const muteMutation = trpc.messages.muteThread.useMutation({
    onSuccess: () => utils.messages.getThread.invalidate({ threadId }),
  });
  const unmuteMutation = trpc.messages.unmuteThread.useMutation({
    onSuccess: () => utils.messages.getThread.invalidate({ threadId }),
  });

  const handleToggle = async () => {
    if (isMuted) {
      await unmuteMutation.mutateAsync({ threadId });
    } else {
      await muteMutation.mutateAsync({ threadId });
    }
  };

  return (
    <button onClick={handleToggle}>
      {isMuted ? (
        <>🔔 Unmute Notifications</>
      ) : (
        <>🔕 Mute Notifications</>
      )}
    </button>
  );
}
```

---

## For Admins

### Monitoring

#### Check Queue Health

```bash
# Queue dashboard (if using Bull Board)
open http://localhost:3000/admin/queues

# Or via CLI
npm run queue:stats
```

#### View Email Metrics

1. **Resend Dashboard:** https://resend.com/emails
   - Filter by tag: `type=message_notification`
   - Check delivery rates
   - Review bounces/complaints

2. **Database Queries:**

```sql
-- Count notifications sent today
SELECT COUNT(*) 
FROM notifications 
WHERE type = 'MESSAGE' 
AND created_at >= CURRENT_DATE;

-- Count emails sent via message queue
SELECT COUNT(*) 
FROM email_events 
WHERE tags->>'type' = 'message_notification'
AND created_at >= CURRENT_DATE;

-- Users with digest preferences
SELECT 
  COUNT(*),
  category_preferences->>'messages'->>'digestFrequency' as frequency
FROM email_preferences
WHERE category_preferences->>'messages'->>'emailNotifications' = 'digest'
GROUP BY frequency;
```

### Troubleshooting

#### Reset User Preferences

```sql
-- Reset to defaults
UPDATE email_preferences
SET category_preferences = jsonb_set(
  COALESCE(category_preferences, '{}'::jsonb),
  '{messages}',
  '{"emailNotifications": "immediate", "inAppNotifications": true}'::jsonb
)
WHERE user_id = 'user-id-here';
```

#### Clear Cooldowns

```bash
# Clear all message cooldowns (use with caution)
redis-cli --scan --pattern "message:email_cooldown:*" | xargs redis-cli DEL

# Clear for specific user
redis-cli DEL $(redis-cli KEYS "message:email_cooldown:user-id:*")
```

#### Retry Failed Jobs

```bash
# Via CLI
npm run queue:retry message-notifications

# Or programmatically
import { messageNotificationQueue } from '@/modules/messages';

const failed = await messageNotificationQueue.getFailed();
await Promise.all(failed.map(job => job.retry()));
```

### Performance Tuning

#### Adjust Worker Concurrency

```javascript
// src/jobs/message-notification.job.ts
export const messageNotificationWorker = new Worker(
  'message-notifications',
  async (job) => { /* ... */ },
  {
    connection: redis,
    concurrency: 10, // Increase for higher throughput
    limiter: {
      max: 200, // Increase rate limit
      duration: 60000,
    },
  }
);
```

#### Optimize Digest Query

```sql
-- Add index if digest queries are slow
CREATE INDEX CONCURRENTLY idx_messages_unread_digest 
ON messages (recipient_id, created_at) 
WHERE read_at IS NULL AND deleted_at IS NULL;
```

---

## Environment Configuration

### Required Environment Variables

```bash
# .env
NEXT_PUBLIC_APP_URL=https://app.yesgoddess.com
RESEND_API_KEY=re_xxx
RESEND_SENDER_EMAIL=notifications@yesgoddess.com
EMAIL_FROM_NAME="YES GODDESS"
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

### Optional Configuration

```bash
# Customize cooldown period (seconds)
MESSAGE_EMAIL_COOLDOWN=300

# Customize digest schedule
MESSAGE_DIGEST_DAILY_CRON="0 9 * * *"
MESSAGE_DIGEST_WEEKLY_CRON="0 9 * * 1"

# Worker settings
MESSAGE_WORKER_CONCURRENCY=5
MESSAGE_WORKER_RATE_LIMIT=100
```

---

## Monitoring Dashboards

### Recommended Metrics to Track

1. **Queue Metrics:**
   - Jobs waiting
   - Jobs processing
   - Jobs completed (last hour)
   - Jobs failed (last hour)
   - Average processing time

2. **Email Metrics:**
   - Emails sent (last hour)
   - Email delivery rate
   - Bounce rate
   - Complaint rate

3. **User Engagement:**
   - Active message senders
   - Messages sent (last hour/day)
   - Notification preference breakdown
   - Muted thread count

4. **Performance:**
   - Queue processing latency
   - Email send latency
   - Database query times
   - Redis hit rate

### Sample Grafana Dashboard Query

```promql
# Message notification queue depth
bullmq_queue_waiting{queue="message-notifications"}

# Email send rate
rate(email_sent_total{type="message_notification"}[5m])

# Failed job rate
rate(bullmq_job_failed_total{queue="message-notifications"}[5m])
```

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs: `pm2 logs message-notifications`
3. Consult full documentation: `docs/modules/messages/NOTIFICATIONS.md`
4. Check implementation details: `docs/modules/messages/IMPLEMENTATION_COMPLETE.md`
