# Account Management Module - Part 2: Advanced Integration

## 7. File Uploads

**Note:** The Account Management module does not handle direct file uploads. However, it integrates with Stripe's hosted verification document upload flow.

### Document Upload Flow

```typescript
// Stripe handles document uploads through their hosted pages
// No direct file upload endpoints in this module

// Frontend implementation for document requirements
interface DocumentRequirement {
  fieldName: string;
  requirementType: string;
  description: string;
  deadline?: string;
}

function DocumentUploadPrompt({ requirement }: { requirement: DocumentRequirement }) {
  const handleUploadClick = () => {
    // Redirect to Stripe's hosted onboarding to upload documents
    window.location.href = stripeOnboardingUrl;
  };
  
  return (
    <div className="requirement-item">
      <h4>{requirement.description}</h4>
      <p>Required: {requirement.fieldName}</p>
      {requirement.deadline && (
        <p>Deadline: {new Date(requirement.deadline).toLocaleDateString()}</p>
      )}
      <button onClick={handleUploadClick}>
        Upload via Stripe
      </button>
    </div>
  );
}
```

### Document Status Tracking

```typescript
// Check document upload status through requirements endpoint
const { data: requirements } = useQuery({
  queryKey: ['stripe-requirements'],
  queryFn: () => api.stripeConnect.getRequirements(),
});

// Document status indicators
function DocumentStatus({ requirements }: { requirements: CategorizedRequirements }) {
  const documentRequirements = requirements.requirements.filter(r => 
    r.fieldName.includes('document') || r.fieldName.includes('verification')
  );
  
  return (
    <div className="document-status">
      {documentRequirements.map(req => (
        <div key={req.fieldName} className={`status-${req.requirementType}`}>
          <span className="field-name">{req.description}</span>
          <StatusBadge type={req.requirementType} />
          {req.errorReason && (
            <p className="error-message">{req.errorReason}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 8. Real-time Updates

### Webhook Events

The backend receives real-time updates from Stripe via webhooks. Frontend should poll or use WebSocket for updates.

#### Relevant Webhook Events
- `account.updated` - Account status changed
- `account.application.deauthorized` - Account disconnected
- `capability.updated` - Capability status changed

### Polling Strategy

```typescript
// Poll for status updates during onboarding
function useOnboardingPolling(isOnboarding: boolean) {
  const [pollInterval, setPollInterval] = useState(30000); // Start with 30s
  
  const { data: status } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: () => api.stripeConnect.getStatus(),
    enabled: isOnboarding,
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  });
  
  useEffect(() => {
    if (status?.data.onboardingStatus === 'completed') {
      setPollInterval(0); // Stop polling when complete
    } else if (status?.data.onboardingStatus === 'in_progress') {
      setPollInterval(10000); // Poll faster during active onboarding
    }
  }, [status]);
  
  return status;
}
```

### WebSocket Integration (Optional)

```typescript
// WebSocket implementation for real-time updates
function useStripeWebSocket(userId: string) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  useEffect(() => {
    const ws = new WebSocket(`${WEBSOCKET_URL}/stripe/${userId}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'stripe_account_updated') {
        setLastUpdate(new Date());
        // Trigger React Query refetch
        queryClient.invalidateQueries(['stripe-status']);
        queryClient.invalidateQueries(['stripe-account']);
      }
    };
    
    setSocket(ws);
    
    return () => {
      ws.close();
    };
  }, [userId]);
  
  return { lastUpdate };
}
```

### Server-Sent Events (SSE) Alternative

```typescript
// SSE implementation for status updates
function useStripeSSE(userId: string) {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  
  useEffect(() => {
    const source = new EventSource(`/api/stream/stripe/${userId}`);
    
    source.addEventListener('account_updated', (event) => {
      const data = JSON.parse(event.data);
      
      // Update local state
      queryClient.setQueryData(['stripe-status'], data.status);
      
      // Show notification
      toast.success('Account status updated!');
    });
    
    source.addEventListener('requirement_resolved', (event) => {
      const data = JSON.parse(event.data);
      
      toast.success(`Verification requirement completed: ${data.fieldName}`);
      queryClient.invalidateQueries(['stripe-requirements']);
    });
    
    setEventSource(source);
    
    return () => {
      source.close();
    };
  }, [userId]);
  
  return eventSource;
}
```

---

## 9. Pagination & Filtering

### Requirements Filtering

```typescript
// Filter requirements by type and urgency
function useRequirementsFiltering(requirements: StripeAccountRequirement[]) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'type'>('deadline');
  
  const filteredRequirements = useMemo(() => {
    let filtered = [...requirements];
    
    // Apply filters
    switch (filter) {
      case 'urgent':
        filtered = filtered.filter(r => 
          r.requirementType === 'currently_due' || 
          r.requirementType === 'past_due'
        );
        break;
      case 'pending':
        filtered = filtered.filter(r => 
          r.requirementType === 'pending_verification'
        );
        break;
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      } else {
        // Sort by requirement type priority
        const typeOrder = { 'past_due': 0, 'currently_due': 1, 'eventually_due': 2, 'pending_verification': 3 };
        return typeOrder[a.requirementType] - typeOrder[b.requirementType];
      }
    });
    
    return filtered;
  }, [requirements, filter, sortBy]);
  
  return {
    filteredRequirements,
    filter,
    setFilter,
    sortBy,
    setSortBy,
  };
}
```

### Account History Pagination (Future Enhancement)

```typescript
// Placeholder for future account activity history
interface AccountActivity {
  id: string;
  type: 'status_change' | 'requirement_added' | 'requirement_resolved';
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
}

function useAccountHistory(accountId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['account-history', accountId, page, pageSize],
    queryFn: () => api.stripeConnect.getAccountHistory({
      accountId,
      page,
      pageSize,
    }),
    keepPreviousData: true,
  });
}
```

---

## 10. Frontend Implementation Checklist

### ✅ Initial Setup Tasks

#### Authentication & Routing
- [ ] Set up protected routes for Stripe Connect pages
- [ ] Implement JWT token management and refresh
- [ ] Add route guards to check for creator profile
- [ ] Handle authentication errors and redirects

#### API Client Setup
- [ ] Create typed API client for Stripe Connect endpoints
- [ ] Implement request/response interceptors for auth headers
- [ ] Add error handling for common HTTP status codes
- [ ] Set up React Query or SWR for data fetching

### ✅ Core Feature Implementation

#### Onboarding Flow
- [ ] **Start Onboarding Page**
  - Button to initiate onboarding process
  - Handle new vs. existing account scenarios
  - Display loading states during account creation
  - Error handling for failed account creation

- [ ] **Onboarding Status Dashboard**
  - Real-time status polling during onboarding
  - Progress indicator showing onboarding steps
  - Action buttons for continuing/refreshing onboarding
  - Clear messaging for each onboarding state

- [ ] **Link Management**
  - Detect and handle expired onboarding links
  - Automatic refresh button for expired links
  - Deep linking back to specific onboarding steps
  - Handle redirect URLs properly

#### Account Management Interface
- [ ] **Account Status Display**
  - Clear status indicators (pending, in-progress, completed, failed)
  - Capability status display (transfers, payouts)
  - Account verification status
  - Last updated timestamp

- [ ] **Requirements Management**
  - Categorized requirements display (urgent, pending, eventual)
  - Priority sorting by deadline and type
  - Action buttons to fulfill requirements
  - Progress tracking for requirement completion
  - Error message display for failed verifications

- [ ] **Account Details View**
  - Business profile information display
  - Connected bank account information (masked)
  - Payout schedule settings
  - Account metadata display

- [ ] **Account Updates**
  - Forms for updating business profile
  - Validation for editable fields
  - Handle read-only fields post-verification
  - Success/error feedback for updates

### ✅ User Experience Features

#### Status Communication
- [ ] **Loading States**
  - Skeleton loaders for account data
  - Progress spinners for API calls
  - Disabled states for processing actions
  - Timeout handling for long-running operations

- [ ] **Success States**
  - Confirmation messages for successful actions
  - Visual indicators for completed requirements
  - Celebration UI for completed onboarding
  - Clear next steps after success

- [ ] **Error States**
  - User-friendly error messages
  - Actionable error resolution steps
  - Retry buttons for failed operations
  - Help links for complex errors

- [ ] **Empty States**
  - No account state with onboarding prompt
  - No requirements state with completion message
  - No activity state with helpful information

#### Responsive Design
- [ ] **Mobile Optimization**
  - Touch-friendly button sizes
  - Optimized forms for mobile input
  - Responsive tables for requirements
  - Mobile-specific navigation patterns

- [ ] **Desktop Experience**
  - Multi-column layouts for large screens
  - Keyboard navigation support
  - Hover states and tooltips
  - Advanced filtering controls

### ✅ Advanced Features

#### Real-time Updates
- [ ] **Status Polling**
  - Implement polling during active onboarding
  - Progressive polling intervals
  - Stop polling when onboarding complete
  - Background polling with tab visibility API

- [ ] **WebSocket Integration** (Optional)
  - Connect to real-time update stream
  - Handle connection failures gracefully
  - Reconnection logic with exponential backoff
  - Update UI based on real-time events

#### Caching & Performance
- [ ] **Data Caching**
  - Cache account status and details
  - Implement cache invalidation strategies
  - Background data refresh
  - Optimistic updates for quick actions

- [ ] **Performance Optimization**
  - Lazy load non-critical components
  - Memoize expensive calculations
  - Debounce user inputs
  - Minimize API calls with intelligent refetching

### ✅ Error Handling & Edge Cases

#### Error Scenarios
- [ ] **Network Errors**
  - Offline state detection and messaging
  - Retry logic for network failures
  - Queue actions for when back online
  - Graceful degradation of features

- [ ] **API Errors**
  - Rate limiting error handling
  - Server error recovery strategies
  - Validation error display
  - Authorization error redirects

- [ ] **User Errors**
  - Form validation with clear messages
  - Prevent invalid state transitions
  - Confirmation dialogs for destructive actions
  - Help text for complex requirements

#### Edge Cases
- [ ] **Account State Edge Cases**
  - Handle accounts in "failed" state
  - Manage accounts with restrictions
  - Deal with suspended accounts
  - Handle account deletion scenarios

- [ ] **Timing Issues**
  - Handle webhook delays gracefully
  - Manage out-of-sync local state
  - Deal with concurrent modifications
  - Handle expired sessions during long flows

### ✅ Testing Strategy

#### Unit Tests
- [ ] **API Client Tests**
  - Test all endpoint calls with mock responses
  - Test error handling for various HTTP codes
  - Test request/response transformations
  - Test authentication header handling

- [ ] **Component Tests**
  - Test rendering with different account states
  - Test user interactions (buttons, forms, links)
  - Test error state handling
  - Test loading state displays

#### Integration Tests
- [ ] **Flow Tests**
  - Test complete onboarding flow
  - Test account update flow
  - Test error recovery flows
  - Test real-time update handling

#### E2E Tests
- [ ] **Critical Path Tests**
  - Full onboarding process
  - Account status checking
  - Requirement completion flow
  - Account information updates

### ✅ Security Considerations

#### Authentication
- [ ] **Token Management**
  - Secure token storage
  - Automatic token refresh
  - Token expiration handling
  - Logout on security errors

#### Data Protection
- [ ] **Sensitive Data Handling**
  - Mask bank account numbers
  - Secure transmission of all data
  - No sensitive data in logs
  - Proper error message sanitization

#### Input Validation
- [ ] **Client-Side Validation**
  - Validate all form inputs
  - Sanitize user-provided data
  - Prevent XSS attacks
  - Rate limit user actions

---

## 11. Deployment & Monitoring

### Environment Configuration

```typescript
// Environment variables needed for frontend
interface EnvironmentConfig {
  NEXT_PUBLIC_API_URL: string;          // Backend API URL
  NEXT_PUBLIC_APP_URL: string;          // Frontend app URL (for redirects)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string; // Stripe public key
  NEXT_PUBLIC_WS_URL?: string;          // WebSocket URL (optional)
  STRIPE_WEBHOOK_SECRET: string;        // Backend only
}

// Runtime configuration validation
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',
  stripePublicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL,
};

// Validate required config
if (!config.stripePublicKey) {
  throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required');
}
```

### Monitoring & Analytics

```typescript
// Track important user actions
function useStripeAnalytics() {
  const track = useAnalytics();
  
  return {
    trackOnboardingStarted: (accountId: string) => {
      track('stripe_onboarding_started', {
        account_id: accountId,
        timestamp: Date.now(),
      });
    },
    
    trackOnboardingCompleted: (accountId: string, duration: number) => {
      track('stripe_onboarding_completed', {
        account_id: accountId,
        duration_seconds: duration,
        timestamp: Date.now(),
      });
    },
    
    trackErrorOccurred: (error: string, context: string) => {
      track('stripe_error_occurred', {
        error_type: error,
        context,
        timestamp: Date.now(),
      });
    },
    
    trackRequirementCompleted: (fieldName: string) => {
      track('stripe_requirement_completed', {
        field_name: fieldName,
        timestamp: Date.now(),
      });
    },
  };
}
```

### Performance Monitoring

```typescript
// Monitor API performance
function usePerformanceMonitoring() {
  const reportPerformance = (endpoint: string, duration: number, success: boolean) => {
    // Report to your analytics service
    analytics.timing('api_call_duration', duration, {
      endpoint,
      success: success.toString(),
    });
  };
  
  return { reportPerformance };
}

// Usage in API client
const apiCall = async (endpoint: string, options: RequestInit) => {
  const startTime = Date.now();
  const { reportPerformance } = usePerformanceMonitoring();
  
  try {
    const response = await fetch(endpoint, options);
    const duration = Date.now() - startTime;
    
    reportPerformance(endpoint, duration, response.ok);
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    const duration = Date.now() - startTime;
    reportPerformance(endpoint, duration, false);
    throw error;
  }
};
```

---

## Summary

The Account Management module provides a complete Stripe Connect integration for creator onboarding and account management. Key implementation points:

### Core Features Delivered
- ✅ **Automatic Stripe Account Creation** - Express accounts created seamlessly
- ✅ **Secure Onboarding Flow** - Time-limited links with session tracking  
- ✅ **Real-time Status Sync** - Webhook-driven status updates
- ✅ **Comprehensive Requirements** - Detailed verification requirement tracking
- ✅ **Account Management** - Update business profiles and settings
- ✅ **Error Recovery** - Robust error handling and retry mechanisms

### Frontend Integration Priorities
1. **Start with basic onboarding flow** (POST /onboard, GET /status)
2. **Add status polling during onboarding** for real-time feedback
3. **Implement requirements display** for verification guidance
4. **Add account details view** for completed accounts
5. **Enhance with real-time updates** (WebSocket/SSE) for better UX

### Success Metrics
- **Onboarding completion rate** - Track users who complete Stripe onboarding
- **Error rates** - Monitor API failures and user-facing errors
- **Time to completion** - Measure onboarding flow duration
- **Requirement resolution** - Track verification requirement completion

### Next Steps
1. Implement the frontend checklist in priority order
2. Set up monitoring and analytics for key user flows
3. Test thoroughly with Stripe's test accounts
4. Deploy with proper environment configuration
5. Monitor real-world usage and optimize based on data

The module is production-ready and provides all necessary tools for a seamless creator onboarding experience.
