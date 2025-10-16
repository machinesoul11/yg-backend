# 🌐 Stripe Connect Payouts - Frontend Integration Guide (Part 3: Implementation & Error Handling)

> **Classification**: ⚡ HYBRID - Core functionality used by both public website (creators) and admin backend (monitoring)

## Overview

This document provides complete React implementation examples, API client patterns, comprehensive error handling, authorization logic, and frontend integration checklist for the Stripe Connect payout module.

---

## 1. API Client Implementation

### 1.1 Base API Client

```typescript
// File: lib/api/stripe-connect-client.ts
import { ApiResponse } from '@/types/stripe-connect.types';

export class StripeConnectApiError extends Error {
  constructor(
    public statusCode: number,
    public errorType: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'StripeConnectApiError';
  }
}

class StripeConnectApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL || '/api';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for NextAuth
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new StripeConnectApiError(
          response.status,
          data.error || 'Unknown Error',
          data.message || 'Request failed',
          data.details
        );
      }

      return data;
    } catch (error) {
      if (error instanceof StripeConnectApiError) {
        throw error;
      }
      
      // Network or parsing errors
      throw new StripeConnectApiError(
        0,
        'NetworkError',
        error instanceof Error ? error.message : 'Network request failed'
      );
    }
  }

  // Public methods
  async startOnboarding(returnUrl?: string, refreshUrl?: string) {
    return this.request<OnboardResponse>('/payouts/stripe-connect/onboard', {
      method: 'POST',
      body: JSON.stringify({
        returnUrl,
        refreshUrl,
      }),
    });
  }

  async getStatus() {
    return this.request<StatusResponse>('/payouts/stripe-connect/status');
  }

  async refreshOnboardingLink(returnUrl?: string, refreshUrl?: string) {
    return this.request<OnboardResponse>('/payouts/stripe-connect/refresh', {
      method: 'POST',
      body: JSON.stringify({
        returnUrl,
        refreshUrl,
      }),
    });
  }

  async getAccountDetails() {
    return this.request<AccountDetailsResponse>('/payouts/stripe-connect/account');
  }

  async updateAccount(updateData: UpdateAccountRequest) {
    return this.request<AccountUpdateResponse>('/payouts/stripe-connect/account', {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });
  }
}

// Export singleton instance
export const stripeConnectApi = new StripeConnectApiClient();
```

### 1.2 React Query Integration

```typescript
// File: hooks/use-stripe-connect.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stripeConnectApi } from '@/lib/api/stripe-connect-client';
import { toast } from '@/components/ui/use-toast';

const QUERY_KEYS = {
  status: ['stripe-connect', 'status'] as const,
  account: ['stripe-connect', 'account'] as const,
};

/**
 * Hook for managing Stripe Connect onboarding
 */
export function useStripeConnectOnboarding() {
  const queryClient = useQueryClient();

  const startOnboarding = useMutation({
    mutationFn: ({ returnUrl, refreshUrl }: { returnUrl?: string; refreshUrl?: string }) =>
      stripeConnectApi.startOnboarding(returnUrl, refreshUrl),
    onSuccess: (data) => {
      // Redirect to Stripe onboarding
      window.location.href = data.data.url;
    },
    onError: (error: StripeConnectApiError) => {
      toast({
        title: 'Onboarding Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const refreshLink = useMutation({
    mutationFn: ({ returnUrl, refreshUrl }: { returnUrl?: string; refreshUrl?: string }) =>
      stripeConnectApi.refreshOnboardingLink(returnUrl, refreshUrl),
    onSuccess: (data) => {
      if ('onboardingComplete' in data.data) {
        // Already complete, refresh status
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
        toast({
          title: 'Account Ready',
          description: 'Your payout account is already set up!',
        });
      } else {
        // Redirect to new link
        window.location.href = data.data.url;
      }
    },
    onError: (error: StripeConnectApiError) => {
      if (error.statusCode === 400) {
        toast({
          title: 'No Account Found',
          description: 'Please start the onboarding process first.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Refresh Failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
  });

  return {
    startOnboarding: startOnboarding.mutate,
    refreshLink: refreshLink.mutate,
    isStarting: startOnboarding.isPending,
    isRefreshing: refreshLink.isPending,
  };
}

/**
 * Hook for checking Stripe Connect status with polling
 */
export function useStripeConnectStatus(options?: {
  enablePolling?: boolean;
  pollInterval?: number;
}) {
  const { enablePolling = false, pollInterval = 5000 } = options || {};

  return useQuery({
    queryKey: QUERY_KEYS.status,
    queryFn: () => stripeConnectApi.getStatus(),
    refetchInterval: enablePolling ? pollInterval : false,
    refetchIntervalInBackground: false,
    staleTime: enablePolling ? 0 : 30000, // 30 seconds when not polling
  });
}

/**
 * Hook for managing account details and updates
 */
export function useStripeConnectAccount() {
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    queryKey: QUERY_KEYS.account,
    queryFn: () => stripeConnectApi.getAccountDetails(),
    staleTime: 60000, // 1 minute
  });

  const updateAccount = useMutation({
    mutationFn: (updateData: UpdateAccountRequest) =>
      stripeConnectApi.updateAccount(updateData),
    onSuccess: () => {
      // Invalidate both account and status queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.account });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.status });
      
      toast({
        title: 'Account Updated',
        description: 'Your payout account information has been updated.',
      });
    },
    onError: (error: StripeConnectApiError) => {
      if (error.statusCode === 400) {
        toast({
          title: 'Update Failed',
          description: error.details || error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Update Failed',
          description: 'Failed to update account. Please try again.',
          variant: 'destructive',
        });
      }
    },
  });

  return {
    account: accountQuery.data,
    isLoading: accountQuery.isLoading,
    error: accountQuery.error,
    refetch: accountQuery.refetch,
    updateAccount: updateAccount.mutate,
    isUpdating: updateAccount.isPending,
  };
}
```

---

## 2. React Component Examples

### 2.1 Onboarding Flow Component

```typescript
// File: components/payouts/stripe-connect-onboarding.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { 
  useStripeConnectOnboarding, 
  useStripeConnectStatus 
} from '@/hooks/use-stripe-connect';
import { calculateStatusIndicators } from '@/lib/stripe-connect-utils';

interface StripeConnectOnboardingProps {
  onComplete?: () => void;
}

export function StripeConnectOnboarding({ onComplete }: StripeConnectOnboardingProps) {
  const router = useRouter();
  const [isPolling, setIsPolling] = useState(false);
  
  const { startOnboarding, refreshLink, isStarting, isRefreshing } = useStripeConnectOnboarding();
  
  const { data: statusData, isLoading } = useStripeConnectStatus({
    enablePolling: isPolling,
    pollInterval: 5000,
  });

  const status = statusData?.data;
  const indicators = status ? calculateStatusIndicators(status) : null;

  // Stop polling when onboarding is complete
  useEffect(() => {
    if (status?.isFullyOnboarded) {
      setIsPolling(false);
      onComplete?.();
    }
  }, [status?.isFullyOnboarded, onComplete]);

  const handleStartOnboarding = () => {
    const returnUrl = `${window.location.origin}/dashboard/payouts/return`;
    const refreshUrl = `${window.location.origin}/dashboard/payouts/refresh`;
    
    startOnboarding({ returnUrl, refreshUrl });
    setIsPolling(true); // Start polling after redirect back
  };

  const handleRefreshLink = () => {
    const returnUrl = `${window.location.origin}/dashboard/payouts/return`;
    const refreshUrl = `${window.location.origin}/dashboard/payouts/refresh`;
    
    refreshLink({ returnUrl, refreshUrl });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {indicators?.statusColor === 'green' && <CheckCircle className="h-5 w-5 text-green-500" />}
          {indicators?.statusColor === 'yellow' && <Clock className="h-5 w-5 text-yellow-500" />}
          {indicators?.statusColor === 'red' && <AlertCircle className="h-5 w-5 text-red-500" />}
          {indicators?.statusColor === 'gray' && <AlertCircle className="h-5 w-5 text-gray-500" />}
          Payout Account Setup
        </CardTitle>
        <CardDescription>
          Connect your Stripe account to receive payouts for your licensed content.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Display */}
        {indicators && (
          <Alert>
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span className="font-medium">Status: {indicators.statusText}</span>
                <div
                  className={`h-2 w-2 rounded-full bg-${indicators.statusColor}-500`}
                  aria-label={indicators.statusText}
                />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Requirements/Errors */}
        {status?.requirements?.currentlyDue && status.requirements.currentlyDue.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Action required to complete setup:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {status.requirements.currentlyDue.map((requirement, index) => (
                    <li key={index}>{requirement}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Next Steps */}
        {indicators?.nextSteps && indicators.nextSteps.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Next Steps:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {indicators.nextSteps.map((step, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-4 h-4 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium text-primary mt-0.5">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          {!status?.hasAccount && (
            <Button 
              onClick={handleStartOnboarding}
              disabled={isStarting}
              className="flex items-center gap-2"
            >
              {isStarting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Connect Stripe Account
            </Button>
          )}

          {status?.hasAccount && !status.isFullyOnboarded && (
            <Button 
              onClick={handleRefreshLink}
              disabled={isRefreshing}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isRefreshing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Continue Setup
            </Button>
          )}

          {status?.isFullyOnboarded && (
            <Button 
              onClick={() => router.push('/dashboard/payouts/account')}
              variant="outline"
            >
              Manage Account
            </Button>
          )}
        </div>

        {/* Success State */}
        {status?.isFullyOnboarded && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              🎉 Your payout account is ready! You can now receive payments for your licensed content.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

### 2.2 Account Management Component

```typescript
// File: components/payouts/stripe-account-management.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, CreditCard, Pencil, Save, X } from 'lucide-react';
import { useStripeConnectAccount } from '@/hooks/use-stripe-connect';
import { businessProfileFormSchema, type BusinessProfileFormData } from '@/schemas/stripe-connect.schemas';
import { type StripeAccountDetails } from '@/types/stripe-connect.types';

export function StripeAccountManagement() {
  const [isEditing, setIsEditing] = useState(false);
  const { account, isLoading, updateAccount, isUpdating } = useStripeConnectAccount();

  const form = useForm<BusinessProfileFormData>({
    resolver: zodResolver(businessProfileFormSchema),
    defaultValues: {
      name: '',
      url: '',
      supportEmail: '',
      supportPhone: '',
      productDescription: '',
    },
  });

  // Update form when account data loads
  useEffect(() => {
    if (account?.data && 'businessProfile' in account.data) {
      const profile = account.data.businessProfile;
      if (profile) {
        form.reset({
          name: profile.name || '',
          url: profile.url || '',
          supportEmail: profile.supportEmail || '',
          supportPhone: profile.supportPhone || '',
          productDescription: profile.productDescription || '',
        });
      }
    }
  }, [account, form]);

  const onSubmit = async (data: BusinessProfileFormData) => {
    updateAccount({
      businessProfile: {
        name: data.name,
        url: data.url || undefined,
        supportEmail: data.supportEmail || undefined,
        supportPhone: data.supportPhone || undefined,
        productDescription: data.productDescription || undefined,
      },
    });
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="py-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!account?.data || !('businessProfile' in account.data)) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No Stripe account found. Please complete the onboarding process first.
        </AlertDescription>
      </Alert>
    );
  }

  const accountData = account.data as StripeAccountDetails;

  return (
    <div className="space-y-6">
      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
          <CardDescription>Your Stripe Connect account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Account ID</Label>
              <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{accountData.id}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Country</Label>
              <p className="text-sm">{accountData.country}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Payouts Enabled</Label>
              <div className="flex items-center gap-2">
                {accountData.payoutsEnabled ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <Badge variant={accountData.payoutsEnabled ? 'default' : 'destructive'}>
                  {accountData.payoutsEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Account Created</Label>
              <p className="text-sm">{new Date(accountData.created * 1000).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>
                Update your business information displayed to partners
              </CardDescription>
            </div>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    form.reset();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={isUpdating}
                  className="flex items-center gap-2"
                >
                  {isUpdating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="name">Business Name *</Label>
                <Input
                  id="name"
                  {...form.register('name')}
                  placeholder="Your business or stage name"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500 mt-1">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="url">Website URL</Label>
                <Input
                  id="url"
                  {...form.register('url')}
                  placeholder="https://your-website.com"
                />
                {form.formState.errors.url && (
                  <p className="text-sm text-red-500 mt-1">
                    {form.formState.errors.url.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    {...form.register('supportEmail')}
                    placeholder="support@your-business.com"
                  />
                  {form.formState.errors.supportEmail && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.supportEmail.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="supportPhone">Support Phone</Label>
                  <Input
                    id="supportPhone"
                    {...form.register('supportPhone')}
                    placeholder="+1 (555) 123-4567"
                  />
                  {form.formState.errors.supportPhone && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.supportPhone.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="productDescription">Product Description</Label>
                <Textarea
                  id="productDescription"
                  {...form.register('productDescription')}
                  placeholder="Describe what you create and license (music, art, content, etc.)"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.watch('productDescription')?.length || 0}/500 characters
                </p>
                {form.formState.errors.productDescription && (
                  <p className="text-sm text-red-500 mt-1">
                    {form.formState.errors.productDescription.message}
                  </p>
                )}
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {accountData.businessProfile ? (
                <>
                  <div>
                    <Label className="text-sm font-medium">Business Name</Label>
                    <p className="text-sm mt-1">{accountData.businessProfile.name}</p>
                  </div>
                  
                  {accountData.businessProfile.url && (
                    <div>
                      <Label className="text-sm font-medium">Website</Label>
                      <p className="text-sm mt-1">
                        <a 
                          href={accountData.businessProfile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {accountData.businessProfile.url}
                        </a>
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {accountData.businessProfile.supportEmail && (
                      <div>
                        <Label className="text-sm font-medium">Support Email</Label>
                        <p className="text-sm mt-1">{accountData.businessProfile.supportEmail}</p>
                      </div>
                    )}
                    
                    {accountData.businessProfile.supportPhone && (
                      <div>
                        <Label className="text-sm font-medium">Support Phone</Label>
                        <p className="text-sm mt-1">{accountData.businessProfile.supportPhone}</p>
                      </div>
                    )}
                  </div>
                  
                  {accountData.businessProfile.productDescription && (
                    <div>
                      <Label className="text-sm font-medium">Product Description</Label>
                      <p className="text-sm mt-1">{accountData.businessProfile.productDescription}</p>
                    </div>
                  )}
                </>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No business profile information available. Click Edit to add your information.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Account Information */}
      {accountData.externalAccounts && accountData.externalAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Bank Accounts
            </CardTitle>
            <CardDescription>Connected bank accounts for receiving payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {accountData.externalAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">{account.bankName}</p>
                    <p className="text-sm text-muted-foreground">
                      ****{account.last4} • {account.currency.toUpperCase()}
                    </p>
                  </div>
                  {account.default && (
                    <Badge variant="outline">Default</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      {accountData.requirements && (
        accountData.requirements.currentlyDue.length > 0 ||
        accountData.requirements.pastDue.length > 0
      ) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              Action Required
            </CardTitle>
            <CardDescription>
              Complete these requirements to maintain your account status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...accountData.requirements.currentlyDue, ...accountData.requirements.pastDue].map((req, index) => (
                <div key={index} className="flex items-start gap-2 p-2 bg-yellow-50 rounded">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{req.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## 3. Error Handling Strategies

### 3.1 Error Boundary Component

```typescript
// File: components/error-boundary.tsx
'use client';

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class StripeConnectErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Stripe Connect Error:', error, errorInfo);
    
    // Report to error tracking service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm mt-1">
                Failed to load payout account information. Please try refreshing the page.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
```

### 3.2 Error Handling Utilities

```typescript
// File: lib/error-handling.ts
import { StripeConnectApiError } from '@/lib/api/stripe-connect-client';
import { toast } from '@/components/ui/use-toast';

/**
 * Error message mapping for user-friendly display
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Network errors
  'NetworkError': 'Network connection failed. Please check your internet connection and try again.',
  
  // Authentication errors
  'Unauthorized': 'Your session has expired. Please sign in again.',
  
  // Stripe-specific errors
  'StripeInvalidRequestError': 'Invalid request. Some information may be locked after verification.',
  'StripeAuthenticationError': 'Authentication failed with Stripe. Please contact support.',
  'StripePermissionError': 'Permission denied. Please contact support.',
  'StripeRateLimitError': 'Too many requests. Please wait a moment and try again.',
  
  // Business logic errors
  'ACCOUNT_NOT_FOUND': 'No Stripe account found. Please start the onboarding process.',
  'ONBOARDING_INCOMPLETE': 'Onboarding is not complete. Please finish setting up your account.',
  'VERIFICATION_FAILED': 'Account verification failed. Please check the requirements and try again.',
  
  // Generic fallbacks
  'Bad Request': 'Invalid information provided. Please check your input and try again.',
  'Not Found': 'Resource not found. Please refresh the page and try again.',
  'Internal Server Error': 'Server error occurred. Please try again later.',
};

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: StripeConnectApiError | Error): string {
  if (error instanceof StripeConnectApiError) {
    return ERROR_MESSAGES[error.errorType] || error.message;
  }
  
  return error.message || 'An unexpected error occurred';
}

/**
 * Handle API errors with appropriate user feedback
 */
export function handleApiError(error: unknown, context?: string) {
  console.error(`[${context || 'API'}] Error:`, error);

  if (error instanceof StripeConnectApiError) {
    // Handle specific error codes
    switch (error.statusCode) {
      case 401:
        toast({
          title: 'Session Expired',
          description: 'Please sign in again to continue.',
          variant: 'destructive',
        });
        // Redirect to login
        window.location.href = '/auth/signin';
        break;
        
      case 403:
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to perform this action.',
          variant: 'destructive',
        });
        break;
        
      case 404:
        toast({
          title: 'Not Found',
          description: getErrorMessage(error),
          variant: 'destructive',
        });
        break;
        
      case 429:
        toast({
          title: 'Rate Limited',
          description: 'Too many requests. Please wait a moment and try again.',
          variant: 'destructive',
        });
        break;
        
      default:
        toast({
          title: 'Error',
          description: getErrorMessage(error),
          variant: 'destructive',
        });
    }
  } else {
    // Generic error handling
    toast({
      title: 'Unexpected Error',
      description: 'Something went wrong. Please try again.',
      variant: 'destructive',
    });
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryHandler {
  private maxRetries: number;
  private baseDelay: number;

  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.maxRetries) {
          break;
        }

        // Don't retry on certain errors
        if (error instanceof StripeConnectApiError) {
          if ([401, 403, 404, 400].includes(error.statusCode)) {
            break;
          }
        }

        onRetry?.(attempt, lastError);
        
        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

/**
 * Usage example with retry
 */
export const retryHandler = new RetryHandler();

export async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await retryHandler.execute(fetchFn, (attempt, error) => {
      console.log(`[${context}] Retry attempt ${attempt}:`, error.message);
    });
  } catch (error) {
    handleApiError(error, context);
    throw error;
  }
}
```

---

## 4. Authorization & Permissions

### 4.1 Permission Checks

```typescript
// File: lib/auth-utils.ts
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Hook to ensure user is authenticated and has creator profile
 */
export function useRequireAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Still loading
    
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    // Check if user has creator profile
    // This would typically be checked via API or stored in session
    if (session?.user && !session.user.hasCreatorProfile) {
      router.push('/creator/onboarding');
      return;
    }
  }, [session, status, router]);

  return {
    user: session?.user,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
  };
}

/**
 * Higher-order component for protecting routes
 */
export function withAuthRequired<P extends object>(
  Component: React.ComponentType<P>
) {
  return function AuthRequiredComponent(props: P) {
    const { isAuthenticated, isLoading } = useRequireAuth();

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // Will redirect in useRequireAuth
    }

    return <Component {...props} />;
  };
}

/**
 * Check if user can access Stripe Connect features
 */
export function useStripeConnectPermissions() {
  const { user, isAuthenticated } = useRequireAuth();

  return {
    canAccessStripeConnect: isAuthenticated && user?.hasCreatorProfile,
    canUpdateAccount: isAuthenticated && user?.hasCreatorProfile,
    canStartOnboarding: isAuthenticated && user?.hasCreatorProfile,
  };
}
```

### 4.2 Role-Based Access Control

```typescript
// File: components/auth/role-guard.tsx
'use client';

import { useSession } from 'next-auth/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requireCreatorProfile?: boolean;
  fallback?: React.ReactNode;
}

export function RoleGuard({ 
  children, 
  allowedRoles = ['creator'], 
  requireCreatorProfile = true,
  fallback 
}: RoleGuardProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return fallback || (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You must be signed in to access this feature.
        </AlertDescription>
      </Alert>
    );
  }

  // Check role permissions
  const userRole = session.user?.role || 'user';
  if (!allowedRoles.includes(userRole)) {
    return fallback || (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to access this feature.
        </AlertDescription>
      </Alert>
    );
  }

  // Check creator profile requirement
  if (requireCreatorProfile && !session.user?.hasCreatorProfile) {
    return fallback || (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You need a creator profile to access payout features.{' '}
          <a href="/creator/setup" className="underline">
            Create your profile
          </a>
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
```

---

## 5. Frontend Implementation Checklist

### 5.1 Setup Tasks

- [ ] **Install Dependencies**
  ```bash
  npm install @tanstack/react-query react-hook-form @hookform/resolvers/zod
  npm install lucide-react @radix-ui/react-alert-dialog
  ```

- [ ] **Configure API Client**
  - [ ] Set up base API client with error handling
  - [ ] Configure request interceptors for authentication
  - [ ] Add retry logic for failed requests
  - [ ] Set up response type validation

- [ ] **Set up React Query**
  ```typescript
  // app/providers.tsx
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: (failureCount, error) => {
          if (error instanceof StripeConnectApiError) {
            return ![401, 403, 404].includes(error.statusCode) && failureCount < 3;
          }
          return failureCount < 3;
        },
      },
    },
  });
  ```

### 5.2 Component Implementation

- [ ] **Create Base Components**
  - [ ] Error boundary for Stripe Connect features
  - [ ] Loading states and skeletons
  - [ ] Status indicators and badges
  - [ ] Form components with validation

- [ ] **Implement Core Features**
  - [ ] Onboarding flow component
  - [ ] Account status display
  - [ ] Account management form
  - [ ] Bank account display (with masking)
  - [ ] Requirements/errors display

- [ ] **Add Navigation Integration**
  - [ ] Dashboard navigation items
  - [ ] Conditional menu items based on status
  - [ ] Breadcrumb navigation
  - [ ] Progress indicators

### 5.3 State Management

- [ ] **Set up Context Providers**
  ```typescript
  // contexts/stripe-connect-context.tsx
  export function StripeConnectProvider({ children }: { children: ReactNode }) {
    return (
      <StripeConnectErrorBoundary>
        {children}
      </StripeConnectErrorBoundary>
    );
  }
  ```

- [ ] **Implement Global State**
  - [ ] User authentication state
  - [ ] Stripe Connect account status
  - [ ] Onboarding progress tracking
  - [ ] Error state management

### 5.4 Routing & Navigation

- [ ] **Set up Protected Routes**
  ```typescript
  // app/dashboard/payouts/page.tsx
  export default function PayoutsPage() {
    return (
      <RoleGuard requireCreatorProfile>
        <StripeConnectOnboarding />
      </RoleGuard>
    );
  }
  ```

- [ ] **Handle Redirect Flows**
  - [ ] `/dashboard/payouts/return` - Post-onboarding return
  - [ ] `/dashboard/payouts/refresh` - Link refresh handling
  - [ ] `/dashboard/payouts/account` - Account management
  - [ ] Error page for failed onboarding

### 5.5 UX Considerations

- [ ] **Loading States**
  - [ ] Skeleton loaders for account data
  - [ ] Loading spinners for actions
  - [ ] Progress indicators during onboarding
  - [ ] Polling status during verification

- [ ] **Error Handling**
  - [ ] User-friendly error messages
  - [ ] Retry buttons for failed actions
  - [ ] Fallback UI for errors
  - [ ] Toast notifications for feedback

- [ ] **Success States**
  - [ ] Completion celebrations
  - [ ] Clear next steps
  - [ ] Account ready confirmations
  - [ ] Update success feedback

### 5.6 Accessibility

- [ ] **ARIA Labels**
  ```typescript
  <div 
    className={`h-2 w-2 rounded-full bg-${statusColor}-500`}
    role="status"
    aria-label={`Account status: ${statusText}`}
  />
  ```

- [ ] **Keyboard Navigation**
  - [ ] Tab order through forms
  - [ ] Enter/Space for buttons
  - [ ] Escape to close modals
  - [ ] Focus management

- [ ] **Screen Reader Support**
  - [ ] Descriptive headings
  - [ ] Form labels and descriptions
  - [ ] Status announcements
  - [ ] Error message associations

### 5.7 Testing Strategy

- [ ] **Unit Tests**
  - [ ] API client functions
  - [ ] Utility functions (status calculations)
  - [ ] Form validation logic
  - [ ] Error handling utilities

- [ ] **Integration Tests**
  - [ ] Complete onboarding flow
  - [ ] Account update workflow
  - [ ] Error scenarios
  - [ ] Authentication handling

- [ ] **E2E Tests**
  ```typescript
  // tests/e2e/stripe-connect.spec.ts
  test('creator can complete onboarding', async ({ page }) => {
    await page.goto('/dashboard/payouts');
    await page.click('[data-testid="start-onboarding"]');
    // Test Stripe redirect and return flow
  });
  ```

---

## 6. Performance Optimization

### 6.1 Code Splitting

```typescript
// Lazy load Stripe Connect components
const StripeConnectOnboarding = lazy(() => 
  import('@/components/payouts/stripe-connect-onboarding')
);

const StripeAccountManagement = lazy(() => 
  import('@/components/payouts/stripe-account-management')
);
```

### 6.2 Caching Strategy

```typescript
// Configure SWR for optimal caching
const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
};
```

### 6.3 Bundle Optimization

- [ ] Tree shake unused Stripe Connect components
- [ ] Minimize bundle size with dynamic imports
- [ ] Optimize images and icons
- [ ] Use CDN for static assets

---

## Summary

This comprehensive integration guide provides everything needed to implement Stripe Connect payouts in the frontend:

1. **Complete API client** with error handling and retry logic
2. **React components** for onboarding and account management  
3. **TypeScript types** and validation schemas
4. **Error handling** strategies and user feedback
5. **Authentication** and permission checks
6. **Implementation checklist** with specific tasks

The frontend team can now implement the UI without clarification questions, following the patterns and examples provided. All edge cases, error scenarios, and UX considerations have been documented with actionable code examples.

---

## Related Documentation

- [Part 1: API Reference](./STRIPE_CONNECT_INTEGRATION_GUIDE_PART_1_API.md)
- [Part 2: TypeScript Definitions & Business Logic](./STRIPE_CONNECT_INTEGRATION_GUIDE_PART_2_TYPES.md)
- Backend API Documentation: `/docs/api/STRIPE_CONNECT_ENDPOINTS.md`
- Webhook Integration: `/docs/STRIPE_WEBHOOKS_IMPLEMENTATION_COMPLETE.md`
