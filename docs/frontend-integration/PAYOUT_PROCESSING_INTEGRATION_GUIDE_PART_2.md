# Payout Processing Module - Frontend Integration Guide (Part 2 of 2)

## Classification: 🔒 ADMIN ONLY
*Payout Processing is internal operations and admin interface only*

---

## Table of Contents - Part 2
1. **Remaining API Endpoints**
2. **Business Logic & Validation Rules**
3. **Error Handling & HTTP Status Codes**
4. **Rate Limiting & Quotas**
5. **Real-time Updates (Webhooks)**
6. **Frontend Implementation Checklist**

---

## 1. Remaining API Endpoints

### 1.1 GET `payouts.getPendingBalance` - Creator Pending Balance

**Purpose:** Get creator's current pending balance and payout eligibility

**Access:** Creator Only (auto-scoped to authenticated user)

#### Input Schema
```typescript
export interface GetPendingBalanceInput {
  includeBreakdown?: boolean  // Include detailed balance breakdown (default: true)
}
```

#### Response Schema
```typescript
export interface PendingBalanceResponse {
  data: {
    pendingBalanceCents: number         // Available balance for payout
    currency: string                    // Always "USD"
    meetsMinimum: boolean              // True if balance >= minimum threshold
    minimumRequiredCents: number       // Minimum payout amount (default: $50)
    canInitiatePayout: boolean         // True if eligible and meets minimum
    lastPayout?: {
      amountCents: number
      processedAt: Date
    }
    pendingPayouts: Array<{            // Currently processing payouts
      id: string
      amountCents: number
      status: PayoutStatus
      createdAt: Date
    }>
    breakdown?: {                      // Detailed breakdown (if requested)
      totalBalanceCents: number
      resolvedUnpaidCents: number      // Earned but not yet paid
      pendingPayoutsCents: number      // Currently being processed
      disputedCents: number            // Disputed earnings (held)
      reservedBalanceCents: number     // Reserved for safety
    }
  }
}
```

#### Usage Example
```typescript
// Get current balance with full breakdown
const balance = await api.payouts.getPendingBalance.query({
  includeBreakdown: true
})

if (balance.data.canInitiatePayout) {
  console.log(`Available: $${balance.data.pendingBalanceCents / 100}`)
} else {
  console.log(`Need $${balance.data.minimumRequiredCents / 100} minimum`)
}
```

---

### 1.2 POST `payouts.batchInitiate` - Batch Payout Processing (Admin Only)

**Purpose:** Process payouts for multiple creators simultaneously

**Access:** Admin Only

#### Input Schema
```typescript
export interface BatchPayoutInput {
  creatorIds?: string[]          // Specific creators to process
  autoSelectEligible?: boolean   // Auto-select all eligible creators
  minAmountCents?: number       // Minimum balance threshold
}
```

#### Response Schema
```typescript
export interface BatchPayoutResponse {
  success: boolean
  data: {
    totalCreators: number
    successfulPayouts: number
    failedPayouts: number
    skippedCreators: number
    payoutIds: string[]          // IDs of successfully created payouts
    errors: Array<{
      creatorId: string
      error: string
    }>
  }
}
```

#### Usage Example
```typescript
// Process all eligible creators with minimum $100 balance
const batchResult = await api.payouts.batchInitiate.mutate({
  autoSelectEligible: true,
  minAmountCents: 10000  // $100.00
})

console.log(`Processed ${batchResult.data.successfulPayouts}/${batchResult.data.totalCreators} payouts`)
```

---

## 2. Business Logic & Validation Rules

### 2.1 Payout Eligibility Requirements

**Before initiating any payout, the system validates:**

```typescript
// Eligibility checks performed automatically
export interface EligibilityValidation {
  hasStripeAccount: boolean          // Must have connected Stripe Express account
  stripeOnboardingComplete: boolean  // Must complete Stripe onboarding flow  
  payoutsEnabled: boolean           // Stripe transfers capability active
  accountInGoodStanding: boolean    // User account not locked/suspended
  noActiveDDisputes: boolean        // No disputed royalty statements
  meetsMinimumBalance: boolean      // Balance >= $50 (configurable)
  termsAccepted: boolean           // Creator verification completed
}
```

**Frontend should check eligibility before showing "Request Payout" button:**

```typescript
// Example eligibility check UI logic
const checkPayoutEligibility = async () => {
  const balance = await api.payouts.getPendingBalance.query()
  
  if (!balance.data.canInitiatePayout) {
    // Show reasons why payout is not available
    if (!balance.data.meetsMinimum) {
      showError(`Need minimum $${balance.data.minimumRequiredCents / 100} balance`)
    }
    // Handle other eligibility issues...
  }
}
```

### 2.2 Balance Calculation Rules

**Available Balance Formula:**
```typescript
availableBalance = resolvedUnpaidEarnings - pendingPayouts - disputedAmounts - reservedFunds
```

**Business Rules:**
- Only `RESOLVED` royalty statements count toward balance
- `DISPUTED` statements are excluded until resolution
- Pending payouts reduce available balance
- 5% reserve may be held for high-risk accounts
- Minimum payout threshold: $50 USD (configurable)

### 2.3 Payout Processing Flow

**State Machine Progression:**
```typescript
PENDING → PROCESSING → COMPLETED
    ↓         ↓
  FAILED ← FAILED
```

**State Descriptions:**
- `PENDING`: Payout created, awaiting Stripe transfer
- `PROCESSING`: Stripe transfer initiated, funds in transit
- `COMPLETED`: Funds successfully transferred to creator account
- `FAILED`: Transfer failed, available for retry (with exponential backoff)

### 2.4 Retry Logic Rules

**Automatic Retry Conditions:**
- Maximum 5 retry attempts per payout
- Exponential backoff: 1h, 4h, 16h, 64h, 256h
- Only retryable errors are attempted (not permanent failures)

**Retryable Errors:**
- Network timeouts
- Stripe API rate limits  
- Temporary Stripe service issues
- Connection errors

**Non-Retryable Errors:**
- Invalid Stripe account ID
- Insufficient platform funds
- Account closed or restricted
- Invalid currency
- Permission errors

---

## 3. Error Handling & HTTP Status Codes

### 3.1 Custom Error Types

**Frontend should handle these specific error types:**

```typescript
// Custom payout error classes
export class PayoutEligibilityError extends Error {
  name = 'PayoutEligibilityError'
  reasons: string[]
  
  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

export class PayoutBalanceError extends Error {
  name = 'PayoutBalanceError'
  availableBalanceCents: number
  
  constructor(message: string, availableBalanceCents: number) {
    super(message)
    this.availableBalanceCents = availableBalanceCents
  }
}

export class StripeTransferError extends Error {
  name = 'StripeTransferError'
  stripeErrorCode?: string
  retryable: boolean
  
  constructor(message: string, stripeErrorCode?: string, retryable = true) {
    super(message)
    this.stripeErrorCode = stripeErrorCode
    this.retryable = retryable
  }
}

export class PayoutNotFoundError extends Error {
  name = 'PayoutNotFoundError'
  payoutId: string
  
  constructor(payoutId: string) {
    super(`Payout not found: ${payoutId}`)
    this.payoutId = payoutId
  }
}
```

### 3.2 HTTP Status Codes & tRPC Error Mappings

| HTTP Code | tRPC Code | Scenario | Frontend Action |
|-----------|-----------|----------|-----------------|
| `400` | `BAD_REQUEST` | Invalid input, insufficient balance | Show validation errors |
| `401` | `UNAUTHORIZED` | Not authenticated | Redirect to login |
| `403` | `FORBIDDEN` | Not eligible for payout, wrong role | Show eligibility requirements |
| `404` | `NOT_FOUND` | Payout/creator not found | Show "not found" message |
| `429` | `TOO_MANY_REQUESTS` | Rate limit exceeded | Show retry delay |
| `500` | `INTERNAL_SERVER_ERROR` | Stripe transfer failed | Show generic error, allow retry |

### 3.3 Error Response Format

```typescript
export interface ErrorResponse {
  error: {
    code: string                    // tRPC error code
    message: string                 // User-friendly message
    data?: {                       // Additional error context
      zodError?: ZodError          // Validation errors
      httpStatus: number
      path: string
      stack?: string              // Only in development
    }
  }
}
```

### 3.4 Error Handling Best Practices

```typescript
// Example error handler for payout operations
const handlePayoutError = (error: any) => {
  switch (error.data?.code) {
    case 'FORBIDDEN':
      if (error.message.includes('eligible')) {
        return 'Complete Stripe onboarding to enable payouts'
      }
      return 'You do not have permission to perform this action'
      
    case 'BAD_REQUEST':
      if (error.message.includes('balance')) {
        return 'Insufficient balance for payout'
      }
      return 'Invalid payout request'
      
    case 'TOO_MANY_REQUESTS':
      return 'Too many requests. Please try again in a few minutes'
      
    default:
      return 'An error occurred processing your payout. Please try again'
  }
}

// Usage in component
try {
  await api.payouts.transfer.mutate(payoutData)
} catch (error) {
  const errorMessage = handlePayoutError(error)
  showErrorToast(errorMessage)
}
```

---

## 4. Rate Limiting & Quotas

### 4.1 Rate Limits per Endpoint

| Endpoint | Limit | Window | Headers |
|----------|-------|--------|---------|
| `transfer` | 10 requests | per hour | `X-RateLimit-Remaining` |
| `list` | 100 requests | per hour | `X-RateLimit-Reset` |
| `getPendingBalance` | 60 requests | per hour | `X-RateLimit-Limit` |
| `batchInitiate` | 5 requests | per day | |

### 4.2 Rate Limit Headers

**Check these headers in responses:**
```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string      // Total limit for time window
  'X-RateLimit-Remaining': string  // Requests remaining in window  
  'X-RateLimit-Reset': string      // Unix timestamp when limit resets
  'Retry-After'?: string          // Seconds to wait before retry (if limited)
}
```

### 4.3 Frontend Rate Limit Handling

```typescript
// Example rate limit handler
const handleRateLimit = (headers: Headers) => {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '0')
  const reset = parseInt(headers.get('X-RateLimit-Reset') || '0')
  
  if (remaining < 5) {
    const resetTime = new Date(reset * 1000)
    showWarning(`API limit almost reached. Resets at ${resetTime.toLocaleTimeString()}`)
  }
}

// Add to your API client interceptor
apiClient.interceptors.response.use((response) => {
  handleRateLimit(response.headers)
  return response
})
```

### 4.4 Quota Limits

**Daily Quotas:**
- **Creator payouts**: 5 payout requests per day per creator
- **Admin batch processing**: 3 batch operations per day  
- **Payout retries**: 5 retries per payout (lifetime)

**Monthly Quotas:**
- **Total payout volume**: No limit (but monitored for fraud)
- **Failed payout rate**: Alert if >5% failure rate

---

## 5. Real-time Updates (Webhooks)

### 5.1 Webhook Events for Payout Status

**The backend receives these Stripe webhook events:**

```typescript
// Webhook events that update payout status
export interface PayoutWebhookEvents {
  'transfer.created': PayoutStatus.PROCESSING    // Stripe confirms transfer creation
  'transfer.paid': PayoutStatus.COMPLETED        // Funds delivered to creator
  'transfer.failed': PayoutStatus.FAILED         // Transfer failed
  'transfer.reversed': PayoutStatus.FAILED       // Transfer was reversed
}
```

### 5.2 Frontend Real-time Updates

**Option 1: Polling Strategy**
```typescript
// Poll for payout status updates
const pollPayoutStatus = async (payoutId: string) => {
  const pollInterval = 30000 // 30 seconds
  
  const poll = async () => {
    try {
      const payout = await api.payouts.getById.query({ id: payoutId })
      
      if (payout.data.status === 'PROCESSING' || payout.data.status === 'PENDING') {
        // Continue polling
        setTimeout(poll, pollInterval)
      } else {
        // Final state reached
        handlePayoutComplete(payout.data)
      }
    } catch (error) {
      console.error('Polling error:', error)
      setTimeout(poll, pollInterval) // Retry on error
    }
  }
  
  poll()
}
```

**Option 2: Server-Sent Events (If implemented)**
```typescript
// Subscribe to payout updates via SSE
const subscribeToPayoutUpdates = (creatorId: string) => {
  const eventSource = new EventSource(`/api/payouts/events?creatorId=${creatorId}`)
  
  eventSource.onmessage = (event) => {
    const payoutUpdate = JSON.parse(event.data)
    
    // Update UI with new payout status
    updatePayoutStatus(payoutUpdate.id, payoutUpdate.status)
  }
  
  return eventSource
}
```

### 5.3 Notification Integration

**The backend automatically creates notifications for:**
- Payout processing started
- Payout completed successfully  
- Payout failed (with retry info)
- Payout reversed by bank

**Frontend should subscribe to notifications:**
```typescript
// Check for payout notifications
const checkPayoutNotifications = async () => {
  const notifications = await api.notifications.getUnread.query({
    type: 'PAYOUT'
  })
  
  notifications.data.forEach(notification => {
    if (notification.metadata?.status === 'COMPLETED') {
      showSuccessToast(`Payout of $${notification.metadata.amount / 100} completed!`)
    }
  })
}
```

---

## 6. Frontend Implementation Checklist

### 6.1 Required UI Components

**Creator Dashboard:**
- [ ] **Balance Widget**: Shows pending balance with breakdown
- [ ] **Payout Button**: Disabled if not eligible, shows reason
- [ ] **Payout History**: Paginated list with status indicators
- [ ] **Payout Details Modal**: Shows transfer details and timeline
- [ ] **Retry Button**: For failed payouts (with countdown if rate limited)
- [ ] **Eligibility Checker**: Shows onboarding progress

**Admin Dashboard:**
- [ ] **Payout Management**: List all payouts with filters
- [ ] **Batch Payout Tool**: Multi-creator payout processing
- [ ] **Payout Analytics**: Success rates, volumes, failure reasons
- [ ] **Creator Eligibility**: Bulk eligibility checking
- [ ] **Failed Payout Queue**: Retry management interface

### 6.2 Data Fetching Strategy

**Use React Query for optimal caching:**

```typescript
// Query keys for cache management
export const payoutKeys = {
  all: ['payouts'] as const,
  lists: () => [...payoutKeys.all, 'list'] as const,
  list: (filters: ListPayoutsInput) => [...payoutKeys.lists(), filters] as const,
  details: () => [...payoutKeys.all, 'detail'] as const,
  detail: (id: string) => [...payoutKeys.details(), id] as const,
  balance: () => [...payoutKeys.all, 'balance'] as const,
}

// React Query hooks
export const usePayoutBalance = () => {
  return useQuery({
    queryKey: payoutKeys.balance(),
    queryFn: () => api.payouts.getPendingBalance.query(),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,       // Consider stale after 30 seconds
  })
}

export const usePayoutHistory = (params: GetMyPayoutsInput) => {
  return useQuery({
    queryKey: payoutKeys.list(params),
    queryFn: () => api.payouts.getMyPayouts.query(params),
    keepPreviousData: true, // For pagination
  })
}

export const useInitiatePayout = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: api.payouts.transfer.mutate,
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: payoutKeys.balance() })
      queryClient.invalidateQueries({ queryKey: payoutKeys.lists() })
    },
  })
}
```

### 6.3 Form Validation

**Payout Request Form:**
```typescript
// Zod schema for frontend validation
export const payoutFormSchema = z.object({
  amountCents: z.number()
    .int()
    .positive()
    .min(5000, 'Minimum payout is $50')
    .optional(),
  royaltyStatementIds: z.array(z.string().cuid()).optional(),
})

// Form component with validation
const PayoutRequestForm = () => {
  const { data: balance } = usePayoutBalance()
  const initiatePayout = useInitiatePayout()
  
  const form = useForm({
    resolver: zodResolver(payoutFormSchema),
    defaultValues: {
      amountCents: balance?.data.pendingBalanceCents,
    }
  })
  
  const onSubmit = (data: PayoutFormData) => {
    initiatePayout.mutate(data)
  }
  
  return (
    <Form {...form}>
      {/* Amount input with validation */}
      <FormField
        control={form.control}
        name="amountCents"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Payout Amount</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min="50"
                max={balance?.data.pendingBalanceCents / 100}
                placeholder="Enter amount"
                {...field}
                onChange={(e) => field.onChange(parseFloat(e.target.value) * 100)}
                value={field.value ? field.value / 100 : ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  )
}
```

### 6.4 Status Indicators & Theming

**Payout Status Colors:**
```typescript
export const payoutStatusConfig = {
  PENDING: {
    label: 'Pending',
    color: 'yellow',
    icon: 'Clock',
    description: 'Payout is being processed'
  },
  PROCESSING: {
    label: 'Processing', 
    color: 'blue',
    icon: 'Loader',
    description: 'Funds are in transit (1-2 business days)'
  },
  COMPLETED: {
    label: 'Completed',
    color: 'green', 
    icon: 'CheckCircle',
    description: 'Funds delivered successfully'
  },
  FAILED: {
    label: 'Failed',
    color: 'red',
    icon: 'XCircle', 
    description: 'Payout failed - contact support'
  }
} as const

// Status badge component
const PayoutStatusBadge = ({ status }: { status: PayoutStatus }) => {
  const config = payoutStatusConfig[status]
  
  return (
    <Badge variant={config.color} className="flex items-center gap-1">
      <config.icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}
```

### 6.5 Error Boundaries & Loading States

**Payout-specific error boundary:**
```typescript
class PayoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log payout-specific errors
    console.error('Payout component error:', error, errorInfo)
    
    // Send to error tracking service
    trackPayoutError(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-medium">Payout Error</h3>
          <p className="text-red-600 mt-2">
            Unable to load payout information. Please refresh and try again.
          </p>
          <Button 
            onClick={() => this.setState({ hasError: false })}
            variant="outline"
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
```

### 6.6 Testing Strategy

**Critical test cases:**
```typescript
// Test payout eligibility checks
describe('Payout Eligibility', () => {
  it('should disable payout button when balance below minimum', () => {
    // Test with balance < $50
  })
  
  it('should show onboarding prompt when Stripe not connected', () => {
    // Test unconnected state
  })
})

// Test payout status updates  
describe('Payout Status Updates', () => {
  it('should update status from PENDING to COMPLETED', () => {
    // Test webhook status changes
  })
  
  it('should show retry button for FAILED payouts', () => {
    // Test failure scenarios
  })
})

// Test error handling
describe('Payout Error Handling', () => {
  it('should handle network errors gracefully', () => {
    // Test offline scenarios
  })
  
  it('should show user-friendly error messages', () => {
    // Test error message formatting
  })
})
```

---

## 🎯 Key Implementation Tips

### Money Handling
- **Always use integers** for money values (cents)
- **Format for display** by dividing by 100
- **Validate amounts** on both frontend and backend

### User Experience  
- **Show clear eligibility requirements** before allowing payout attempts
- **Provide estimated arrival times** (1-2 business days for ACH)
- **Display progress indicators** for multi-step processes
- **Cache balance data** but refresh frequently (every 30-60 seconds)

### Performance
- **Paginate payout lists** (default 20 items per page)
- **Debounce search inputs** in admin interfaces
- **Cache eligibility checks** for short periods
- **Use optimistic updates** for better perceived performance

### Security
- **Never expose Stripe secrets** in frontend code
- **Validate all inputs** before sending to API
- **Use HTTPS only** for all payout-related requests
- **Implement CSP headers** to prevent XSS attacks

---

## 🚀 Ready to Implement

With this comprehensive guide, your frontend team should be able to implement the complete payout processing UI without requiring clarification from the backend team. The integration is designed to be type-safe, user-friendly, and resilient to edge cases.

**Next Steps:**
1. Set up the TypeScript interfaces in your frontend codebase
2. Implement the React Query hooks for data fetching  
3. Build the UI components following the patterns shown
4. Add comprehensive error handling and loading states
5. Test with both creator and admin user roles

**Questions or Issues:**
If you encounter any integration challenges, refer back to the specific sections in this guide or check the backend API documentation for additional details.
