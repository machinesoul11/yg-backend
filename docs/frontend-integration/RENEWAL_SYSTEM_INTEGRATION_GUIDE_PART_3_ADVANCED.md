# Frontend Integration Guide: License Renewal System - Part 3: Advanced Features

**Classification:** ⚡ HYBRID  
**Target Audience:** Frontend developers building UI for YesGoddess  
**Last Updated:** October 14, 2025

---

## Table of Contents

1. [Error Handling](#error-handling)
2. [Authorization & Permissions](#authorization--permissions)
3. [Rate Limiting & Quotas](#rate-limiting--quotas)
4. [Real-time Updates](#real-time-updates)
5. [Analytics & Reporting](#analytics--reporting)
6. [Frontend Implementation Checklist](#frontend-implementation-checklist)
7. [Testing Scenarios](#testing-scenarios)
8. [Performance Optimization](#performance-optimization)

---

## Error Handling

### Error Response Format

All tRPC errors follow this structure:

```typescript
interface TRPCError {
  message: string;
  code: 
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'TIMEOUT'
    | 'CONFLICT'
    | 'PRECONDITION_FAILED'
    | 'PAYLOAD_TOO_LARGE'
    | 'METHOD_NOT_SUPPORTED'
    | 'UNPROCESSABLE_CONTENT'
    | 'TOO_MANY_REQUESTS'
    | 'CLIENT_CLOSED_REQUEST'
    | 'INTERNAL_SERVER_ERROR';
  data?: {
    httpStatus: number;
    path: string;
    zodError?: any; // If validation error
  };
}
```

### Common Error Scenarios

#### 1. License Not Found
**Error Code:** `NOT_FOUND`  
**HTTP Status:** 404  
**When:** Invalid license ID or deleted license

```typescript
try {
  await checkEligibility.mutateAsync({ licenseId: 'invalid-id' });
} catch (error: any) {
  if (error.data?.code === 'NOT_FOUND') {
    toast.error('License not found. It may have been deleted.');
    router.push('/licenses');
  }
}
```

#### 2. Permission Denied
**Error Code:** `FORBIDDEN`  
**HTTP Status:** 403  
**When:** User doesn't own the license or lacks required role

```typescript
try {
  await generateOffer.mutateAsync({ licenseId });
} catch (error: any) {
  if (error.data?.code === 'FORBIDDEN') {
    toast.error('You do not have permission to renew this license.');
    // For brands: Check if they own the license
    // For admins: Should not occur
  }
}
```

#### 3. Eligibility Failure
**Error Code:** `UNPROCESSABLE_CONTENT`  
**HTTP Status:** 422  
**When:** License doesn't meet renewal criteria

```typescript
try {
  await generateOffer.mutateAsync({ licenseId });
} catch (error: any) {
  if (error.data?.code === 'UNPROCESSABLE_CONTENT') {
    // Parse the error message for specific reasons
    if (error.message.includes('not eligible for renewal')) {
      toast.error('This license cannot be renewed at this time.');
      // Display eligibility check results
      showEligibilityModal(licenseId);
    }
  }
}
```

#### 4. Offer Expired
**Error Code:** `BAD_REQUEST`  
**HTTP Status:** 400  
**When:** Trying to accept an expired offer

```typescript
try {
  await acceptOffer.mutateAsync({ licenseId, offerId });
} catch (error: any) {
  if (error.message.includes('expired')) {
    toast.error('This renewal offer has expired. Please generate a new offer.');
    // Clear cached offer
    setCurrentOffer(null);
    // Redirect to renewal page
    router.push(`/licenses/${licenseId}/renew`);
  }
}
```

#### 5. Validation Errors
**Error Code:** `BAD_REQUEST`  
**HTTP Status:** 400  
**When:** Invalid input data

```typescript
try {
  await generateOffer.mutateAsync({
    licenseId,
    pricingStrategy: 'NEGOTIATED',
    customAdjustmentPercent: 150 // Invalid: exceeds 100
  });
} catch (error: any) {
  if (error.data?.zodError) {
    // Parse Zod validation errors
    const issues = error.data.zodError.issues;
    issues.forEach((issue: any) => {
      toast.error(`${issue.path.join('.')}: ${issue.message}`);
    });
  }
}
```

### Error Handler Utility

```typescript
// utils/renewal-errors.ts

export const handleRenewalError = (error: any, context: string) => {
  // Log to monitoring service
  console.error(`[Renewal Error - ${context}]:`, error);

  // User-friendly messages
  const messages: Record<string, string> = {
    NOT_FOUND: 'License not found or has been deleted.',
    FORBIDDEN: 'You do not have permission to perform this action.',
    UNAUTHORIZED: 'Please sign in to continue.',
    TOO_MANY_REQUESTS: 'Too many requests. Please wait a moment.',
    INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again.',
    CONFLICT: 'This license already has an active renewal.',
    UNPROCESSABLE_CONTENT: 'License is not eligible for renewal at this time.',
  };

  const code = error.data?.code || error.code;
  const message = messages[code] || error.message || 'An unexpected error occurred.';

  toast.error(message);

  // Special handling
  if (code === 'UNAUTHORIZED') {
    router.push('/auth/signin?callbackUrl=' + window.location.pathname);
  }

  return { code, message, handled: true };
};
```

### Usage Example

```typescript
const RenewalFlow = ({ licenseId }) => {
  const generateOffer = trpc.licenses.generateRenewalOffer.useMutation({
    onError: (error) => handleRenewalError(error, 'generate-offer'),
    onSuccess: (data) => {
      toast.success('Renewal offer generated successfully!');
      setOffer(data.data);
    }
  });

  const acceptOffer = trpc.licenses.acceptRenewalOffer.useMutation({
    onError: (error) => handleRenewalError(error, 'accept-offer'),
    onSuccess: (data) => {
      toast.success('Renewal accepted! Awaiting creator approval.');
      router.push(`/licenses/${data.data.id}`);
    }
  });

  return (
    // ... UI components
  );
};
```

---

## Authorization & Permissions

### User Roles

```typescript
enum UserRole {
  ADMIN = 'ADMIN',      // Full system access
  CREATOR = 'CREATOR',  // Approve renewals for their IP
  BRAND = 'BRAND',      // Renew their own licenses
  VIEWER = 'VIEWER'     // Read-only access (no renewal actions)
}
```

### Permission Matrix

| Action | Brand (Own License) | Brand (Other License) | Creator | Admin | Viewer |
|--------|--------------------|-----------------------|---------|-------|--------|
| Check Eligibility | ✅ | ❌ | ❌ | ✅ | ❌ |
| Generate Offer | ✅ | ❌ | ❌ | ✅ | ❌ |
| Accept Offer | ✅ | ❌ | ❌ | ✅ | ❌ |
| Approve Renewal | ❌ | ❌ | ✅ (Own IP) | ✅ | ❌ |
| View Analytics | ❌ | ❌ | ❌ | ✅ | ❌ |
| View Pipeline | ❌ | ❌ | ❌ | ✅ | ❌ |

### Frontend Permission Checks

```typescript
import { useSession } from 'next-auth/react';

const useRenewalPermissions = (license: License) => {
  const { data: session } = useSession();
  
  if (!session?.user) {
    return {
      canCheckEligibility: false,
      canGenerateOffer: false,
      canAcceptOffer: false,
      canApproveRenewal: false,
      canViewAnalytics: false,
      reason: 'Not authenticated'
    };
  }

  const isAdmin = session.user.role === 'ADMIN';
  const isBrand = session.user.role === 'BRAND';
  const isCreator = session.user.role === 'CREATOR';
  
  // Brand owns this license
  const ownsBrand = isBrand && session.user.brandId === license.brandId;
  
  // Creator owns IP
  const ownsIP = isCreator && license.ipAsset.ownerships.some(
    o => o.creatorId === session.user.creatorId
  );

  return {
    canCheckEligibility: isAdmin || ownsBrand,
    canGenerateOffer: isAdmin || ownsBrand,
    canAcceptOffer: isAdmin || ownsBrand,
    canApproveRenewal: isAdmin || ownsIP,
    canViewAnalytics: isAdmin,
    canViewPipeline: isAdmin,
    reason: null
  };
};
```

### UI Component Examples

```tsx
const RenewalActions = ({ license }) => {
  const permissions = useRenewalPermissions(license);

  if (!permissions.canGenerateOffer) {
    return (
      <Alert variant="warning">
        <Icon>🔒</Icon>
        <Text>
          {permissions.reason === 'Not authenticated' 
            ? 'Please sign in to renew this license.'
            : 'You do not have permission to renew this license.'}
        </Text>
      </Alert>
    );
  }

  return (
    <ButtonGroup>
      <Button onClick={handleGenerateOffer}>
        Generate Renewal Offer
      </Button>
    </ButtonGroup>
  );
};
```

### Role-Based Navigation

```tsx
const RenewalDashboard = () => {
  const { data: session } = useSession();
  
  if (session?.user.role === 'ADMIN') {
    return <AdminRenewalDashboard />;
  }
  
  if (session?.user.role === 'BRAND') {
    return <BrandRenewalDashboard />;
  }
  
  if (session?.user.role === 'CREATOR') {
    return <CreatorRenewalApprovals />;
  }
  
  return <AccessDenied />;
};
```

---

## Rate Limiting & Quotas

### Current Rate Limits

The renewal system inherits from the platform's general rate limiting:

| Endpoint | Rate Limit | Window | Notes |
|----------|-----------|--------|-------|
| Check Eligibility | 60 requests | 1 minute | Per user |
| Generate Offer | 10 requests | 1 minute | Per user |
| Accept Offer | 5 requests | 1 minute | Per user |
| Analytics | 30 requests | 1 minute | Admin only |

### Rate Limit Headers

While tRPC doesn't expose headers directly, the backend tracks rate limits. Monitor for `TOO_MANY_REQUESTS` errors:

```typescript
const generateOffer = trpc.licenses.generateRenewalOffer.useMutation({
  onError: (error) => {
    if (error.data?.code === 'TOO_MANY_REQUESTS') {
      const retryAfter = 60; // seconds
      toast.error(`Too many requests. Please wait ${retryAfter} seconds.`);
      
      // Disable button temporarily
      setRateLimited(true);
      setTimeout(() => setRateLimited(false), retryAfter * 1000);
    }
  }
});
```

### Client-Side Rate Limiting

Implement optimistic rate limiting to prevent hitting server limits:

```typescript
import { useState, useEffect } from 'react';

const useClientRateLimit = (maxRequests: number, windowMs: number) => {
  const [requests, setRequests] = useState<number[]>([]);
  
  const canMakeRequest = () => {
    const now = Date.now();
    const recentRequests = requests.filter(time => now - time < windowMs);
    return recentRequests.length < maxRequests;
  };
  
  const recordRequest = () => {
    setRequests(prev => [...prev, Date.now()]);
  };
  
  const getRemainingRequests = () => {
    const now = Date.now();
    const recentRequests = requests.filter(time => now - time < windowMs);
    return Math.max(0, maxRequests - recentRequests.length);
  };
  
  // Cleanup old requests
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRequests(prev => prev.filter(time => now - time < windowMs));
    }, windowMs);
    
    return () => clearInterval(interval);
  }, [windowMs]);
  
  return { canMakeRequest, recordRequest, getRemainingRequests };
};

// Usage
const RenewalButton = ({ licenseId }) => {
  const rateLimit = useClientRateLimit(10, 60000); // 10 requests per minute
  
  const generateOffer = trpc.licenses.generateRenewalOffer.useMutation();
  
  const handleClick = async () => {
    if (!rateLimit.canMakeRequest()) {
      toast.warning('Please wait before generating another offer.');
      return;
    }
    
    rateLimit.recordRequest();
    await generateOffer.mutateAsync({ licenseId });
  };
  
  return (
    <Button onClick={handleClick}>
      Generate Offer ({rateLimit.getRemainingRequests()} remaining)
    </Button>
  );
};
```

---

## Real-time Updates

### Polling for Renewal Status

Since the renewal system uses background jobs, poll for status updates:

```typescript
import { useQuery } from '@tanstack/react-query';

const useRenewalStatus = (licenseId: string) => {
  // Poll every 30 seconds for status updates
  return trpc.licenses.checkRenewalEligibility.useQuery(
    { licenseId },
    {
      refetchInterval: 30000, // 30 seconds
      refetchIntervalInBackground: false,
      enabled: !!licenseId
    }
  );
};

// Usage
const RenewalStatusWidget = ({ licenseId }) => {
  const { data, isLoading } = useRenewalStatus(licenseId);
  
  return (
    <Card>
      <StatusIndicator status={data?.data.eligible ? 'ready' : 'not-ready'} />
      <Text>
        {isLoading ? 'Checking...' : 
         data?.data.eligible ? 'Ready to renew' : 'Not eligible'}
      </Text>
    </Card>
  );
};
```

### WebSocket Alternative (Future Enhancement)

Currently not implemented, but the system is designed to support WebSocket notifications:

```typescript
// Future implementation example
const useRenewalNotifications = (licenseId: string) => {
  const [notifications, setNotifications] = useState<RenewalEvent[]>([]);
  
  useEffect(() => {
    const ws = new WebSocket(`wss://ops.yesgoddess.agency/renewals/${licenseId}`);
    
    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      setNotifications(prev => [...prev, notification]);
      
      // Handle different event types
      if (notification.type === 'offer_generated') {
        toast.success('Renewal offer is ready!');
      } else if (notification.type === 'offer_accepted') {
        toast.success('Renewal accepted! Awaiting creator approval.');
      } else if (notification.type === 'renewal_complete') {
        toast.success('Renewal complete! License is now active.');
      }
    };
    
    return () => ws.close();
  }, [licenseId]);
  
  return notifications;
};
```

### Notification Preferences

Check user's email notification preferences:

```typescript
const RenewalNotificationSettings = () => {
  const { data: preferences } = trpc.user.getEmailPreferences.useQuery();
  const updatePreferences = trpc.user.updateEmailPreferences.useMutation();
  
  return (
    <Settings>
      <Toggle
        label="Renewal Reminders"
        checked={preferences?.renewalReminders ?? true}
        onChange={(enabled) => 
          updatePreferences.mutate({ renewalReminders: enabled })
        }
      />
      <Description>
        Receive email notifications when your licenses are eligible for renewal
      </Description>
    </Settings>
  );
};
```

---

## Analytics & Reporting

### Admin Dashboard Components

```tsx
const RenewalAnalyticsDashboard = () => {
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date()
  });
  
  const { data: metrics, isLoading } = trpc.licenses.getRenewalAnalytics.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString()
  });
  
  const { data: pipeline } = trpc.licenses.getRenewalPipeline.useQuery();
  
  if (isLoading) return <Skeleton />;
  
  return (
    <DashboardLayout>
      <DateRangePicker value={dateRange} onChange={setDateRange} />
      
      <MetricsGrid>
        <MetricCard
          title="Renewal Rate"
          value={`${metrics?.data.renewalRate.toFixed(1)}%`}
          trend={calculateTrend(metrics?.data.renewalRate)}
          icon={<TrendUpIcon />}
        />
        
        <MetricCard
          title="Revenue Retention"
          value={`${metrics?.data.revenueRetentionRate.toFixed(1)}%`}
          trend={calculateTrend(metrics?.data.revenueRetentionRate)}
          icon={<DollarIcon />}
        />
        
        <MetricCard
          title="Avg. Time to Renew"
          value={`${metrics?.data.averageTimeToRenewal.toFixed(0)} days`}
          icon={<ClockIcon />}
        />
        
        <MetricCard
          title="Pipeline Revenue"
          value={formatCurrency(pipeline?.data.forecastedRevenueCents || 0)}
          icon={<PipelineIcon />}
        />
      </MetricsGrid>
      
      <ChartsSection>
        <RenewalRateChart data={metrics?.data} />
        <PricingStrategyChart data={metrics?.data.byPricingStrategy} />
        <NotificationEffectivenessChart data={metrics?.data.byNotificationStage} />
      </ChartsSection>
      
      <TablesSection>
        <TopPerformingAssets data={metrics?.data.topPerformingAssets} />
        <AtRiskLicenses data={metrics?.data.atRiskLicenses} />
      </TablesSection>
    </DashboardLayout>
  );
};
```

### Pipeline Funnel Visualization

```tsx
const RenewalPipelineFunnel = ({ data }) => {
  const stages = [
    { name: 'Eligible', count: data.stages.eligible, color: '#3b82f6' },
    { name: 'Offer Generated', count: data.stages.offerGenerated, color: '#8b5cf6' },
    { name: 'Under Review', count: data.stages.underReview, color: '#ec4899' },
    { name: 'Approved', count: data.stages.approved, color: '#10b981' }
  ];
  
  const maxCount = data.stages.eligible;
  
  return (
    <FunnelContainer>
      {stages.map((stage, index) => {
        const percentage = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
        const conversionRate = index > 0 
          ? (stage.count / stages[index - 1].count) * 100 
          : 100;
        
        return (
          <FunnelStage key={stage.name}>
            <Bar 
              width={`${percentage}%`}
              color={stage.color}
            >
              <Label>{stage.name}</Label>
              <Count>{stage.count.toLocaleString()}</Count>
            </Bar>
            
            {index > 0 && (
              <ConversionRate>
                {conversionRate.toFixed(1)}% conversion
              </ConversionRate>
            )}
          </FunnelStage>
        );
      })}
      
      <RevenueForecasts>
        <Forecast>
          <Label>Forecasted Revenue</Label>
          <Value>{formatCurrency(data.forecastedRevenueCents)}</Value>
        </Forecast>
        
        <Forecast warning>
          <Label>At-Risk Revenue</Label>
          <Value>{formatCurrency(data.atRiskRevenueCents)}</Value>
        </Forecast>
      </RevenueForecasts>
    </FunnelContainer>
  );
};
```

### Export Analytics

```typescript
const ExportAnalyticsButton = ({ dateRange }) => {
  const [isExporting, setIsExporting] = useState(false);
  
  const exportAnalytics = async () => {
    setIsExporting(true);
    
    try {
      const metrics = await trpc.licenses.getRenewalAnalytics.query({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });
      
      // Convert to CSV
      const csv = convertToCSV(metrics.data);
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `renewal-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      
      toast.success('Analytics exported successfully');
    } catch (error) {
      toast.error('Failed to export analytics');
    } finally {
      setIsExporting(false);
    }
  };
  
  return (
    <Button 
      onClick={exportAnalytics} 
      loading={isExporting}
      icon={<DownloadIcon />}
    >
      Export CSV
    </Button>
  );
};
```

---

## Frontend Implementation Checklist

### Phase 1: Core Functionality (Week 1)

#### Brand-Facing UI
- [ ] **License Detail Page - Renewal Section**
  - [ ] Display renewal eligibility status
  - [ ] Show days until expiration with urgency indicators
  - [ ] "Check Eligibility" button
  - [ ] Display blocking issues and warnings
  
- [ ] **Renewal Offer Generation**
  - [ ] Pricing strategy selector (6 strategies)
  - [ ] Custom adjustment input (for NEGOTIATED)
  - [ ] "Generate Offer" button with loading state
  - [ ] Pricing breakdown display
  - [ ] Comparison view (current vs. renewal price)
  
- [ ] **Offer Acceptance Flow**
  - [ ] Review offer modal with full breakdown
  - [ ] Terms & conditions checkbox
  - [ ] "Accept Offer" button
  - [ ] Expiry countdown timer
  - [ ] Success confirmation screen

#### Error Handling
- [ ] Implement error handler utility
- [ ] Display user-friendly error messages
- [ ] Handle permission errors gracefully
- [ ] Show validation errors inline
- [ ] Add retry mechanisms for failed requests

### Phase 2: Enhanced Features (Week 2)

#### Auto-Renewal
- [ ] **Auto-Renewal Toggle**
  - [ ] Switch component on license detail page
  - [ ] Confirmation modal for enabling/disabling
  - [ ] Display next auto-renewal date
  - [ ] Warning about automatic processing
  
- [ ] **Auto-Renewal Status**
  - [ ] Badge showing auto-renewal enabled
  - [ ] Countdown to next auto-renewal
  - [ ] Notification history display

#### License List Enhancements
- [ ] Filter by renewal status (eligible, expiring soon, urgent)
- [ ] Sort by days until expiration
- [ ] Bulk renewal actions (admin only)
- [ ] Renewal status badges
- [ ] Quick renewal buttons

#### Notifications
- [ ] In-app notification center for renewal updates
- [ ] Email notification preferences page
- [ ] Notification timeline on license page
- [ ] Real-time notification badges

### Phase 3: Admin Dashboard (Week 3)

#### Analytics Dashboard
- [ ] **Metrics Cards**
  - [ ] Renewal rate
  - [ ] Revenue retention rate
  - [ ] Average time to renewal
  - [ ] Pipeline revenue forecast
  
- [ ] **Charts & Visualizations**
  - [ ] Renewal rate trend chart
  - [ ] Pricing strategy breakdown pie chart
  - [ ] Notification effectiveness funnel
  - [ ] Revenue retention over time
  
- [ ] **Data Tables**
  - [ ] Top performing assets
  - [ ] At-risk licenses
  - [ ] Recent renewals
  - [ ] Failed renewals with reasons

#### Pipeline Management
- [ ] Pipeline funnel visualization
- [ ] Stage-by-stage breakdown
- [ ] Conversion rate calculations
- [ ] At-risk revenue alerts
- [ ] Forecasted revenue display

#### Reports & Exports
- [ ] Date range selector
- [ ] Export to CSV
- [ ] Print-friendly report view
- [ ] Scheduled report emails (future)

### Phase 4: Polish & Optimization (Week 4)

#### Performance
- [ ] Implement client-side caching
- [ ] Add optimistic updates
- [ ] Lazy load pricing calculations
- [ ] Debounce eligibility checks
- [ ] Prefetch renewal data for eligible licenses

#### UX Improvements
- [ ] Add loading skeletons
- [ ] Implement toast notifications
- [ ] Add confirmation dialogs
- [ ] Progressive disclosure for complex data
- [ ] Mobile-responsive design
- [ ] Keyboard shortcuts for common actions

#### Accessibility
- [ ] ARIA labels for all interactive elements
- [ ] Keyboard navigation support
- [ ] Screen reader compatibility
- [ ] Color contrast compliance (WCAG AA)
- [ ] Focus management in modals

#### Testing
- [ ] Unit tests for components
- [ ] Integration tests for workflows
- [ ] E2E tests for critical paths
- [ ] Error state testing
- [ ] Performance testing

---

## Testing Scenarios

### Manual Testing Checklist

#### Scenario 1: Happy Path - Brand Renews License
**Steps:**
1. Sign in as BRAND user
2. Navigate to license detail page (license expires in 60 days)
3. Click "Check Eligibility"
4. Verify eligible status with green checkmark
5. Click "Generate Renewal Offer"
6. Select "AUTOMATIC" pricing strategy
7. Review pricing breakdown showing:
   - 5% inflation adjustment
   - 5% loyalty discount
   - 5% early renewal discount
8. Click "Accept Offer"
9. Confirm acceptance in modal
10. Verify redirect to new renewal license
11. Verify status is "PENDING_APPROVAL"
12. Check email for confirmation

**Expected Results:**
- ✅ All steps complete without errors
- ✅ Pricing calculations are accurate
- ✅ New license created with correct dates
- ✅ Email sent to brand and creators
- ✅ Audit log entry created

#### Scenario 2: Blocked Renewal - Too Early
**Steps:**
1. Sign in as BRAND user
2. Navigate to license detail page (license expires in 120 days)
3. Click "Check Eligibility"

**Expected Results:**
- ❌ Ineligible status shown
- ❌ Blocking issue: "License is outside renewal window (120 days remaining, window opens at 90 days)"
- ❌ "Generate Offer" button disabled
- ✅ Suggested action: Wait until renewal window opens

#### Scenario 3: Expired Offer
**Steps:**
1. Generate renewal offer
2. Wait for offer to expire (or manually set expiry date in past via admin)
3. Attempt to accept expired offer

**Expected Results:**
- ❌ Error message: "This renewal offer has expired"
- ✅ Prompt to generate new offer
- ❌ Offer acceptance fails

#### Scenario 4: Permission Denied
**Steps:**
1. Sign in as BRAND user A
2. Attempt to renew license owned by BRAND user B

**Expected Results:**
- ❌ 403 Forbidden error
- ❌ Error message: "You do not have permission to renew this license"
- ❌ Renewal buttons hidden or disabled

#### Scenario 5: Auto-Renewal
**Steps:**
1. Sign in as BRAND user
2. Enable auto-renewal on license (expires in 65 days)
3. Wait for daily job to run (or trigger manually via admin)
4. Check license list

**Expected Results:**
- ✅ Renewal license created automatically
- ✅ Status is "ACTIVE" (no approval needed)
- ✅ Email confirmation sent
- ✅ Original license metadata updated with renewal link

#### Scenario 6: Creator Approval Flow
**Steps:**
1. Brand accepts renewal offer (creates PENDING_APPROVAL license)
2. Sign in as CREATOR user
3. Navigate to approval queue
4. Review renewal details
5. Click "Approve"
6. Verify status changes to "ACTIVE"

**Expected Results:**
- ✅ Approval recorded in database
- ✅ Status updated when all creators approve
- ✅ Confirmation emails sent
- ✅ Audit log entry created

#### Scenario 7: Admin Analytics
**Steps:**
1. Sign in as ADMIN user
2. Navigate to renewal analytics dashboard
3. Select date range (last 30 days)
4. View metrics and charts
5. Export to CSV

**Expected Results:**
- ✅ Metrics displayed accurately
- ✅ Charts render correctly
- ✅ CSV file downloads with complete data
- ✅ No permission errors

### Automated Test Examples

```typescript
// Example: Eligibility Check Test
describe('Renewal Eligibility', () => {
  it('should show eligible status for license in renewal window', async () => {
    const license = createTestLicense({ daysUntilExpiration: 60 });
    
    render(<RenewalSection license={license} />);
    
    await userEvent.click(screen.getByText('Check Eligibility'));
    
    await waitFor(() => {
      expect(screen.getByText('Ready to renew')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generate offer/i })).toBeEnabled();
    });
  });
  
  it('should show blocked status for license outside window', async () => {
    const license = createTestLicense({ daysUntilExpiration: 120 });
    
    render(<RenewalSection license={license} />);
    
    await userEvent.click(screen.getByText('Check Eligibility'));
    
    await waitFor(() => {
      expect(screen.getByText(/outside renewal window/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generate offer/i })).toBeDisabled();
    });
  });
});

// Example: Pricing Calculation Test
describe('Renewal Pricing', () => {
  it('should calculate AUTOMATIC pricing correctly', async () => {
    const license = createTestLicense({
      feeCents: 500000,
      daysUntilExpiration: 75,
      renewalCount: 2
    });
    
    const { result } = renderHook(() => 
      trpc.licenses.generateRenewalOffer.useMutation()
    );
    
    await act(async () => {
      await result.current.mutateAsync({
        licenseId: license.id,
        pricingStrategy: 'AUTOMATIC'
      });
    });
    
    const pricing = result.current.data?.data.pricing;
    
    expect(pricing?.strategy).toBe('AUTOMATIC');
    expect(pricing?.adjustments).toContainEqual(
      expect.objectContaining({ type: 'INFLATION', percentChange: 5 })
    );
    expect(pricing?.adjustments).toContainEqual(
      expect.objectContaining({ type: 'LOYALTY', percentChange: -5 })
    );
    expect(pricing?.comparison.percentChange).toBeCloseTo(-5.24, 2);
  });
});
```

---

## Performance Optimization

### Caching Strategies

```typescript
// Cache eligibility checks for 5 minutes
const { data: eligibility } = trpc.licenses.checkRenewalEligibility.useQuery(
  { licenseId },
  {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  }
);

// Prefetch renewal data for eligible licenses
const prefetchRenewalData = async (licenseIds: string[]) => {
  const queryClient = useQueryClient();
  
  licenseIds.forEach(licenseId => {
    queryClient.prefetchQuery(
      trpc.licenses.checkRenewalEligibility.getQueryKey({ licenseId }),
      () => trpc.licenses.checkRenewalEligibility.query({ licenseId })
    );
  });
};

// Use in license list component
useEffect(() => {
  const eligibleLicenses = licenses.filter(l => 
    getRenewalStatus(l).canRenew
  );
  
  prefetchRenewalData(eligibleLicenses.map(l => l.id));
}, [licenses]);
```

### Optimistic Updates

```typescript
const acceptOffer = trpc.licenses.acceptRenewalOffer.useMutation({
  onMutate: async ({ licenseId, offerId }) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['licenses', licenseId] });
    
    // Snapshot previous value
    const previousLicense = queryClient.getQueryData(['licenses', licenseId]);
    
    // Optimistically update
    queryClient.setQueryData(['licenses', licenseId], (old: any) => ({
      ...old,
      status: 'PENDING_APPROVAL'
    }));
    
    // Return context with snapshot
    return { previousLicense };
  },
  
  onError: (err, variables, context) => {
    // Rollback on error
    if (context?.previousLicense) {
      queryClient.setQueryData(
        ['licenses', variables.licenseId],
        context.previousLicense
      );
    }
  },
  
  onSettled: (data, error, variables) => {
    // Refetch after mutation
    queryClient.invalidateQueries({ 
      queryKey: ['licenses', variables.licenseId] 
    });
  }
});
```

### Code Splitting

```typescript
// Lazy load heavy components
const RenewalAnalyticsDashboard = lazy(() => 
  import('./components/RenewalAnalyticsDashboard')
);

const PricingCalculator = lazy(() => 
  import('./components/PricingCalculator')
);

// Use with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <RenewalAnalyticsDashboard />
</Suspense>
```

---

## Summary

You now have comprehensive documentation covering:

✅ **Part 1:** API endpoints, request/response schemas, TypeScript types  
✅ **Part 2:** Business logic, validation rules, workflows, pricing strategies  
✅ **Part 3:** Error handling, authorization, rate limiting, analytics, implementation checklist

### Quick Start Guide

1. **Read Part 1** for API endpoint reference
2. **Read Part 2** for business logic and UI patterns
3. **Follow the checklist** in Part 3 for implementation
4. **Test scenarios** to verify functionality
5. **Optimize** using performance tips

### Support & Resources

- **Backend Docs:** `/docs/modules/licensing/RENEWAL_AUTOMATION_IMPLEMENTATION_SUMMARY.md`
- **Quick Reference:** `/docs/modules/licensing/RENEWAL_AUTOMATION_QUICK_REFERENCE.md`
- **Email Templates:** `/emails/templates/LicenseRenewal*.tsx`

### Questions?

Contact the backend team if you need:
- Additional endpoints
- Custom business logic
- Performance optimization help
- Testing data/fixtures
