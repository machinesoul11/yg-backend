# Account Management - API Reference & Examples

## Quick Reference

### Base URL
```
Production: https://ops.yesgoddess.agency/api
Development: http://localhost:3000/api
```

### Authentication
```typescript
headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

---

## API Endpoints Reference

### 1. Start Onboarding

```typescript
POST /payouts/stripe-connect/onboard
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/payouts/stripe-connect/onboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "returnUrl": "https://yesgoddess.com/dashboard/settings/payouts/return",
    "refreshUrl": "https://yesgoddess.com/dashboard/settings/payouts/refresh"
  }'
```

**JavaScript/TypeScript Example:**
```typescript
const onboardStripeAccount = async (returnUrl?: string, refreshUrl?: string) => {
  const response = await fetch('/api/payouts/stripe-connect/onboard', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      returnUrl,
      refreshUrl,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Usage
try {
  const result = await onboardStripeAccount(
    'https://yesgoddess.com/dashboard/settings/payouts/return',
    'https://yesgoddess.com/dashboard/settings/payouts/refresh'
  );
  
  console.log('Onboarding URL:', result.data.url);
  console.log('Account ID:', result.data.accountId);
  console.log('Is New Account:', result.data.isNewAccount);
  
  // Redirect to Stripe onboarding
  window.location.href = result.data.url;
} catch (error) {
  console.error('Onboarding failed:', error);
}
```

**React Hook Example:**
```typescript
import { useMutation } from '@tanstack/react-query';

interface OnboardData {
  returnUrl?: string;
  refreshUrl?: string;
}

function useStripeOnboarding() {
  return useMutation({
    mutationFn: (data: OnboardData) => onboardStripeAccount(data.returnUrl, data.refreshUrl),
    onSuccess: (result) => {
      // Redirect to Stripe
      window.location.href = result.data.url;
    },
    onError: (error) => {
      console.error('Onboarding failed:', error);
      toast.error('Failed to start onboarding. Please try again.');
    },
  });
}

// Usage in component
function OnboardingButton() {
  const { mutate: startOnboarding, isPending } = useStripeOnboarding();
  
  const handleOnboard = () => {
    startOnboarding({
      returnUrl: `${window.location.origin}/dashboard/settings/payouts/return`,
      refreshUrl: `${window.location.origin}/dashboard/settings/payouts/refresh`,
    });
  };
  
  return (
    <button 
      onClick={handleOnboard} 
      disabled={isPending}
      className="btn-primary"
    >
      {isPending ? 'Starting...' : 'Set Up Payouts'}
    </button>
  );
}
```

---

### 2. Check Status

```typescript
GET /payouts/stripe-connect/status
```

**cURL Example:**
```bash
curl -X GET https://ops.yesgoddess.agency/api/payouts/stripe-connect/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript/TypeScript Example:**
```typescript
const getStripeStatus = async () => {
  const response = await fetch('/api/payouts/stripe-connect/status', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Usage with polling
const pollStripeStatus = async () => {
  try {
    const result = await getStripeStatus();
    const status = result.data;
    
    console.log('Account Status:', status);
    
    // Handle different states
    if (status.onboardingStatus === 'completed' && status.payoutsEnabled) {
      console.log('✅ Ready to receive payouts!');
      return 'completed';
    } else if (status.onboardingStatus === 'in_progress') {
      console.log('🔄 Onboarding in progress...');
      return 'in_progress';
    } else if (status.requiresAction) {
      console.log('⚠️ Action required:', status.requirements.currentlyDue);
      return 'requires_action';
    }
    
    return status.onboardingStatus;
  } catch (error) {
    console.error('Status check failed:', error);
    return 'error';
  }
};
```

**React Hook with Polling:**
```typescript
import { useQuery } from '@tanstack/react-query';

function useStripeStatus(pollDuringOnboarding = false) {
  return useQuery({
    queryKey: ['stripe-status'],
    queryFn: getStripeStatus,
    refetchInterval: (data) => {
      // Poll every 10 seconds if onboarding is in progress
      if (pollDuringOnboarding && data?.data?.onboardingStatus === 'in_progress') {
        return 10000;
      }
      // Stop polling if completed or not onboarding
      return false;
    },
    refetchIntervalInBackground: false,
  });
}

// Usage in component
function StripeStatusDisplay() {
  const { data, error, isLoading } = useStripeStatus(true);
  
  if (isLoading) return <div>Loading account status...</div>;
  if (error) return <div>Error loading status</div>;
  
  const status = data?.data;
  if (!status) return null;
  
  return (
    <div className="status-card">
      <h3>Payout Account Status</h3>
      <div className="status-items">
        <StatusItem 
          label="Account" 
          value={status.hasAccount ? '✅ Created' : '❌ Not Created'} 
        />
        <StatusItem 
          label="Onboarding" 
          value={getOnboardingStatusText(status.onboardingStatus)} 
        />
        <StatusItem 
          label="Payouts" 
          value={status.payoutsEnabled ? '✅ Enabled' : '❌ Disabled'} 
        />
        {status.requiresAction && (
          <div className="requirements-alert">
            <p>⚠️ Action required:</p>
            <ul>
              {status.requirements.currentlyDue.map(req => (
                <li key={req}>{req}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function getOnboardingStatusText(status: string) {
  const statusMap = {
    'pending': '🔄 Not Started',
    'in_progress': '🔄 In Progress', 
    'completed': '✅ Completed',
    'failed': '❌ Failed'
  };
  return statusMap[status] || status;
}
```

---

### 3. Refresh Onboarding Link

```typescript
POST /payouts/stripe-connect/refresh
```

**cURL Example:**
```bash
curl -X POST https://ops.yesgoddess.agency/api/payouts/stripe-connect/refresh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "returnUrl": "https://yesgoddess.com/dashboard/settings/payouts/return",
    "refreshUrl": "https://yesgoddess.com/dashboard/settings/payouts/refresh"
  }'
```

**JavaScript/TypeScript Example:**
```typescript
const refreshOnboardingLink = async (returnUrl?: string, refreshUrl?: string) => {
  const response = await fetch('/api/payouts/stripe-connect/refresh', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      returnUrl,
      refreshUrl,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Usage with error handling
const handleRefreshLink = async () => {
  try {
    const result = await refreshOnboardingLink();
    
    if (result.message === "Onboarding is already complete") {
      toast.success('Your payout account is already set up!');
      return;
    }
    
    // Redirect to new onboarding URL
    window.location.href = result.data.url;
  } catch (error) {
    if (error.message.includes('No Stripe account')) {
      // Need to start onboarding first
      toast.error('Please start the onboarding process first.');
      // Redirect to onboarding start
    } else {
      toast.error('Failed to refresh link. Please try again.');
    }
  }
};
```

**React Component Example:**
```typescript
function ExpiredLinkHandler({ onboardingUrl, expiresAt }: { 
  onboardingUrl: string; 
  expiresAt: number; 
}) {
  const [isExpired, setIsExpired] = useState(false);
  const { mutate: refreshLink, isPending } = useMutation({
    mutationFn: refreshOnboardingLink,
    onSuccess: (result) => {
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    },
  });
  
  useEffect(() => {
    const checkExpiry = () => {
      const now = Date.now() / 1000;
      setIsExpired(now > expiresAt);
    };
    
    checkExpiry();
    const interval = setInterval(checkExpiry, 30000); // Check every 30s
    
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  if (isExpired) {
    return (
      <div className="expired-link-notice">
        <h4>⏰ Onboarding Link Expired</h4>
        <p>Your onboarding link has expired. Get a new one to continue.</p>
        <button 
          onClick={() => refreshLink()}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? 'Getting New Link...' : 'Get New Link'}
        </button>
      </div>
    );
  }
  
  return (
    <div className="active-link">
      <p>Continue your onboarding:</p>
      <a href={onboardingUrl} className="btn-primary">
        Continue Setup
      </a>
      <p className="expiry-notice">
        Link expires: {new Date(expiresAt * 1000).toLocaleString()}
      </p>
    </div>
  );
}
```

---

### 4. Get Account Details

```typescript
GET /payouts/stripe-connect/account
```

**cURL Example:**
```bash
curl -X GET https://ops.yesgoddess.agency/api/payouts/stripe-connect/account \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript/TypeScript Example:**
```typescript
const getAccountDetails = async () => {
  const response = await fetch('/api/payouts/stripe-connect/account', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Usage
const displayAccountInfo = async () => {
  try {
    const result = await getAccountDetails();
    
    if (!result.data.hasAccount) {
      console.log('No account found - need to start onboarding');
      return;
    }
    
    const account = result.data;
    console.log('Account Details:', {
      id: account.id,
      country: account.country,
      email: account.email,
      payoutsEnabled: account.payoutsEnabled,
      businessName: account.businessProfile?.name,
      bankAccount: account.externalAccounts?.[0]?.last4,
    });
    
    // Check for requirements
    const allRequirements = [
      ...account.requirements.currentlyDue,
      ...account.requirements.eventuallyDue,
      ...account.requirements.pastDue,
      ...account.requirements.pendingVerification,
    ];
    
    if (allRequirements.length > 0) {
      console.log('Outstanding requirements:', allRequirements);
    }
    
  } catch (error) {
    console.error('Failed to fetch account details:', error);
  }
};
```

**React Component Example:**
```typescript
function AccountDetailsView() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['stripe-account'],
    queryFn: getAccountDetails,
  });
  
  if (isLoading) return <AccountDetailsSkeleton />;
  if (error) return <div>Error loading account details</div>;
  
  const account = data?.data;
  
  if (!account?.hasAccount) {
    return (
      <div className="no-account">
        <h3>No Payout Account</h3>
        <p>Set up your Stripe account to receive payments.</p>
        <OnboardingButton />
      </div>
    );
  }
  
  return (
    <div className="account-details">
      <div className="account-overview">
        <h3>Payout Account Overview</h3>
        <div className="details-grid">
          <DetailItem label="Account ID" value={account.id} />
          <DetailItem label="Country" value={account.country} />
          <DetailItem label="Email" value={account.email} />
          <DetailItem 
            label="Payouts" 
            value={account.payoutsEnabled ? '✅ Enabled' : '❌ Disabled'} 
          />
        </div>
      </div>
      
      {account.businessProfile && (
        <div className="business-profile">
          <h4>Business Profile</h4>
          <div className="profile-grid">
            <DetailItem label="Business Name" value={account.businessProfile.name} />
            <DetailItem label="Website" value={account.businessProfile.url} />
            <DetailItem label="Support Email" value={account.businessProfile.supportEmail} />
            <DetailItem label="Description" value={account.businessProfile.productDescription} />
          </div>
        </div>
      )}
      
      {account.externalAccounts?.length > 0 && (
        <div className="bank-accounts">
          <h4>Connected Bank Accounts</h4>
          {account.externalAccounts.map(bank => (
            <div key={bank.id} className="bank-account-item">
              <span className="bank-name">{bank.bankName}</span>
              <span className="account-number">****{bank.last4}</span>
              {bank.default && <span className="default-badge">Default</span>}
            </div>
          ))}
        </div>
      )}
      
      <RequirementsSection requirements={account.requirements} />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail-item">
      <span className="label">{label}:</span>
      <span className="value">{value || 'Not provided'}</span>
    </div>
  );
}
```

---

### 5. Update Account Information

```typescript
PATCH /payouts/stripe-connect/account
```

**cURL Example:**
```bash
curl -X PATCH https://ops.yesgoddess.agency/api/payouts/stripe-connect/account \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessProfile": {
      "name": "My Creative Studio LLC",
      "url": "https://mycreativestudio.com",
      "supportEmail": "support@mycreativestudio.com",
      "productDescription": "Creative services including photography, design, and content creation"
    }
  }'
```

**JavaScript/TypeScript Example:**
```typescript
interface AccountUpdateData {
  businessProfile?: {
    name?: string;
    url?: string;
    supportEmail?: string;
    supportPhone?: string;
    supportUrl?: string;
    productDescription?: string;
  };
  settings?: {
    payouts?: {
      schedule?: {
        interval: 'daily' | 'weekly' | 'monthly';
      };
    };
  };
  metadata?: Record<string, string>;
}

const updateAccountInfo = async (updateData: AccountUpdateData) => {
  const response = await fetch('/api/payouts/stripe-connect/account', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Usage
const updateBusinessProfile = async (profileData: AccountUpdateData['businessProfile']) => {
  try {
    const result = await updateAccountInfo({
      businessProfile: profileData,
    });
    
    console.log('Account updated:', result.message);
    toast.success('Business profile updated successfully!');
    
    // Refresh account details
    queryClient.invalidateQueries(['stripe-account']);
  } catch (error) {
    console.error('Update failed:', error);
    toast.error('Failed to update account. Please try again.');
  }
};
```

**React Form Example:**
```typescript
function BusinessProfileForm({ currentProfile }: { currentProfile?: BusinessProfile }) {
  const [formData, setFormData] = useState({
    name: currentProfile?.name || '',
    url: currentProfile?.url || '',
    supportEmail: currentProfile?.supportEmail || '',
    supportPhone: currentProfile?.supportPhone || '',
    productDescription: currentProfile?.productDescription || '',
  });
  
  const { mutate: updateAccount, isPending } = useMutation({
    mutationFn: updateAccountInfo,
    onSuccess: () => {
      toast.success('Business profile updated!');
      queryClient.invalidateQueries(['stripe-account']);
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateAccount({
      businessProfile: {
        name: formData.name || undefined,
        url: formData.url || undefined,
        supportEmail: formData.supportEmail || undefined,
        supportPhone: formData.supportPhone || undefined,
        productDescription: formData.productDescription || undefined,
      },
    });
  };
  
  return (
    <form onSubmit={handleSubmit} className="business-profile-form">
      <h3>Update Business Profile</h3>
      
      <div className="form-group">
        <label htmlFor="businessName">Business Name</label>
        <input
          id="businessName"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Your Business Name"
          maxLength={100}
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="website">Website URL</label>
        <input
          id="website"
          type="url"
          value={formData.url}
          onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
          placeholder="https://yourwebsite.com"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="supportEmail">Support Email</label>
        <input
          id="supportEmail"
          type="email"
          value={formData.supportEmail}
          onChange={(e) => setFormData(prev => ({ ...prev, supportEmail: e.target.value }))}
          placeholder="support@yourwebsite.com"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="description">Product Description</label>
        <textarea
          id="description"
          value={formData.productDescription}
          onChange={(e) => setFormData(prev => ({ ...prev, productDescription: e.target.value }))}
          placeholder="Describe your creative services..."
          maxLength={500}
          rows={4}
        />
      </div>
      
      <button 
        type="submit" 
        disabled={isPending}
        className="btn-primary"
      >
        {isPending ? 'Updating...' : 'Update Profile'}
      </button>
    </form>
  );
}
```

---

## Complete Integration Example

Here's a complete React component that demonstrates all the features:

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

function StripeConnectDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'account' | 'settings'>('overview');
  const queryClient = useQueryClient();
  
  // Queries
  const { 
    data: status, 
    error: statusError, 
    isLoading: statusLoading 
  } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: getStripeStatus,
    refetchInterval: (data) => {
      // Poll if onboarding in progress
      return data?.data?.onboardingStatus === 'in_progress' ? 10000 : false;
    },
  });
  
  const { 
    data: account, 
    error: accountError, 
    isLoading: accountLoading 
  } = useQuery({
    queryKey: ['stripe-account'],
    queryFn: getAccountDetails,
    enabled: status?.data?.hasAccount,
  });
  
  // Mutations
  const { mutate: startOnboarding, isPending: onboardingPending } = useMutation({
    mutationFn: onboardStripeAccount,
    onSuccess: (result) => {
      window.location.href = result.data.url;
    },
    onError: (error) => {
      toast.error('Failed to start onboarding');
    },
  });
  
  const { mutate: refreshLink, isPending: refreshPending } = useMutation({
    mutationFn: refreshOnboardingLink,
    onSuccess: (result) => {
      if (result.data?.url) {
        window.location.href = result.data.url;
      } else if (result.message?.includes('already complete')) {
        toast.success('Your account is already set up!');
        queryClient.invalidateQueries(['stripe-status']);
      }
    },
    onError: (error) => {
      toast.error('Failed to refresh link');
    },
  });
  
  // Handlers
  const handleStartOnboarding = () => {
    startOnboarding({
      returnUrl: `${window.location.origin}/dashboard/settings/payouts/return`,
      refreshUrl: `${window.location.origin}/dashboard/settings/payouts/refresh`,
    });
  };
  
  const handleRefreshLink = () => {
    refreshLink({
      returnUrl: `${window.location.origin}/dashboard/settings/payouts/return`, 
      refreshUrl: `${window.location.origin}/dashboard/settings/payouts/refresh`,
    });
  };
  
  // Loading state
  if (statusLoading) {
    return <div className="loading">Loading payout account status...</div>;
  }
  
  // Error state
  if (statusError) {
    return (
      <div className="error">
        <h3>Error Loading Account</h3>
        <p>Failed to load your payout account information.</p>
        <button onClick={() => queryClient.invalidateQueries(['stripe-status'])}>
          Try Again
        </button>
      </div>
    );
  }
  
  const statusData = status?.data;
  
  // No account state
  if (!statusData?.hasAccount) {
    return (
      <div className="no-account-setup">
        <div className="setup-card">
          <h2>Set Up Payout Account</h2>
          <p>
            Connect your Stripe account to receive payments from brands who license your work.
          </p>
          
          <div className="setup-benefits">
            <h4>What you'll get:</h4>
            <ul>
              <li>✅ Secure payment processing</li>
              <li>✅ Direct bank deposits</li>
              <li>✅ Detailed transaction history</li>
              <li>✅ Tax reporting assistance</li>
            </ul>
          </div>
          
          <button 
            onClick={handleStartOnboarding}
            disabled={onboardingPending}
            className="btn-primary btn-large"
          >
            {onboardingPending ? 'Starting Setup...' : 'Set Up Payout Account'}
          </button>
          
          <p className="setup-note">
            You'll be redirected to Stripe to complete the secure onboarding process.
          </p>
        </div>
      </div>
    );
  }
  
  // Main dashboard
  return (
    <div className="stripe-dashboard">
      <div className="dashboard-header">
        <h1>Payout Account</h1>
        <div className="status-indicator">
          <StatusBadge status={statusData.onboardingStatus} />
          {statusData.payoutsEnabled && <span className="payout-enabled">✅ Payouts Enabled</span>}
        </div>
      </div>
      
      <div className="dashboard-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''} 
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'account' ? 'active' : ''} 
          onClick={() => setActiveTab('account')}
          disabled={!statusData.hasAccount}
        >
          Account Details
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''} 
          onClick={() => setActiveTab('settings')}
          disabled={statusData.onboardingStatus !== 'completed'}
        >
          Settings
        </button>
      </div>
      
      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <OverviewTab 
            status={statusData} 
            onRefreshLink={handleRefreshLink}
            refreshPending={refreshPending}
          />
        )}
        
        {activeTab === 'account' && (
          <AccountDetailsTab 
            account={account?.data}
            loading={accountLoading}
            error={accountError}
          />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab account={account?.data} />
        )}
      </div>
    </div>
  );
}

// Sub-components
function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    'pending': { label: 'Not Started', color: 'gray' },
    'in_progress': { label: 'In Progress', color: 'blue' },
    'completed': { label: 'Completed', color: 'green' },
    'failed': { label: 'Failed', color: 'red' },
  };
  
  const config = statusConfig[status] || { label: status, color: 'gray' };
  
  return (
    <span className={`status-badge status-${config.color}`}>
      {config.label}
    </span>
  );
}

function OverviewTab({ 
  status, 
  onRefreshLink, 
  refreshPending 
}: { 
  status: any;
  onRefreshLink: () => void;
  refreshPending: boolean;
}) {
  const hasRequirements = status.requirements?.currentlyDue?.length > 0;
  
  return (
    <div className="overview-tab">
      <div className="status-cards">
        <div className="status-card">
          <h3>Onboarding Status</h3>
          <StatusBadge status={status.onboardingStatus} />
          
          {status.onboardingStatus === 'in_progress' && (
            <div className="in-progress-actions">
              <p>Complete your onboarding to start receiving payments.</p>
              <button 
                onClick={onRefreshLink}
                disabled={refreshPending}
                className="btn-secondary"
              >
                {refreshPending ? 'Getting Link...' : 'Continue Onboarding'}
              </button>
            </div>
          )}
          
          {status.onboardingStatus === 'completed' && (
            <p className="success-message">
              ✅ Your payout account is ready!
            </p>
          )}
        </div>
        
        <div className="status-card">
          <h3>Payout Status</h3>
          <div className="payout-info">
            <div className="payout-item">
              <span>Payouts:</span>
              <span className={status.payoutsEnabled ? 'enabled' : 'disabled'}>
                {status.payoutsEnabled ? '✅ Enabled' : '❌ Disabled'}
              </span>
            </div>
            <div className="payout-item">
              <span>Account ID:</span>
              <span className="account-id">{status.accountId}</span>
            </div>
          </div>
        </div>
      </div>
      
      {hasRequirements && (
        <div className="requirements-alert">
          <h4>⚠️ Action Required</h4>
          <p>Complete these requirements to enable payouts:</p>
          <ul>
            {status.requirements.currentlyDue.map(req => (
              <li key={req}>{req}</li>
            ))}
          </ul>
          <button 
            onClick={onRefreshLink}
            disabled={refreshPending}
            className="btn-primary"
          >
            Complete Requirements
          </button>
        </div>
      )}
    </div>
  );
}

function AccountDetailsTab({ account, loading, error }: any) {
  if (loading) return <div>Loading account details...</div>;
  if (error) return <div>Error loading account details</div>;
  if (!account?.hasAccount) return <div>No account found</div>;
  
  return (
    <div className="account-details-tab">
      {/* Implementation from previous examples */}
      <AccountDetailsView />
    </div>
  );
}

function SettingsTab({ account }: { account?: any }) {
  if (!account?.hasAccount) return <div>Account not available</div>;
  
  return (
    <div className="settings-tab">
      <BusinessProfileForm currentProfile={account.businessProfile} />
    </div>
  );
}

export default StripeConnectDashboard;
```

This comprehensive example demonstrates:
- ✅ **Complete onboarding flow** from start to finish
- ✅ **Real-time status polling** during onboarding
- ✅ **Error handling** for all scenarios
- ✅ **Account management** with editable business profile
- ✅ **Requirements tracking** and resolution
- ✅ **Responsive UI components** with proper loading states
- ✅ **React Query integration** for efficient data fetching

The implementation provides a production-ready foundation that can be customized based on your specific UI design requirements.
