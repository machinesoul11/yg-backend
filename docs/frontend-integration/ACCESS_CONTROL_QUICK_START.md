# Access Control - Quick Start Guide

**⚡ Get started with authentication & authorization in 5 minutes**

---

## 1. Setup Authentication (2 minutes)

### Install Dependencies
```bash
npm install next-auth @auth/prisma-adapter @tanstack/react-query
```

### Configure Session Provider
```typescript
// app/layout.tsx or app/providers.tsx
'use client';
import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

### Create useAuth Hook
```typescript
// hooks/useAuth.ts
import { useSession } from 'next-auth/react';

export function useAuth() {
  const { data: session, status } = useSession();
  
  return {
    user: session?.user,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    role: session?.user?.role,
    isAdmin: session?.user?.role === 'ADMIN',
    isCreator: session?.user?.role === 'CREATOR',
    isBrand: session?.user?.role === 'BRAND',
  };
}
```

---

## 2. Make Authenticated Requests (1 minute)

### Create API Client
```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // 🔑 Important: Include session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// Helper methods
export const api = {
  get: <T>(url: string) => apiRequest<T>(url, { method: 'GET' }),
  post: <T>(url: string, data: any) => 
    apiRequest<T>(url, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(url: string, data: any) => 
    apiRequest<T>(url, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(url: string) => apiRequest<T>(url, { method: 'DELETE' }),
};
```

### Usage Example
```typescript
// Fetch user's assets
const assets = await api.get('/api/assets');

// Create new asset
const newAsset = await api.post('/api/assets', {
  title: 'My Asset',
  description: 'Description here',
});
```

---

## 3. Protect Routes (1 minute)

### Option A: Middleware (Recommended)
```typescript
// middleware.ts
export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/creator/:path*',
    '/brand/:path*',
  ],
};
```

### Option B: Client Component
```typescript
'use client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/signin');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return null;

  return <div>Protected Content</div>;
}
```

---

## 4. Role-Based Access (1 minute)

### Hide UI Elements by Role
```typescript
function Dashboard() {
  const { user, isAdmin, isCreator, isBrand } = useAuth();

  return (
    <div>
      {/* Show for all authenticated users */}
      <ProfileSection user={user} />

      {/* Creator-only */}
      {isCreator && (
        <div>
          <MyAssetsSection />
          <RoyaltyStatementsSection />
        </div>
      )}

      {/* Brand-only */}
      {isBrand && (
        <div>
          <MyProjectsSection />
          <LicensesSection />
        </div>
      )}

      {/* Admin-only */}
      {isAdmin && (
        <div>
          <AdminPanel />
          <AuditLogsSection />
        </div>
      )}
    </div>
  );
}
```

### Redirect Based on Role
```typescript
function AdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') {
      router.push('/unauthorized');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <div>Loading...</div>;
  if (user?.role !== 'ADMIN') return null;

  return <div>Admin Content</div>;
}
```

---

## 5. Handle Errors (Bonus)

### Error Handler
```typescript
// lib/errors.ts
export async function handleApiError(response: Response) {
  const error = await response.json();

  switch (response.status) {
    case 401:
      // Redirect to sign in
      window.location.href = '/auth/signin';
      break;
    case 403:
      // Show permission error
      alert('You do not have permission to perform this action');
      break;
    case 429:
      // Rate limit
      const retryAfter = response.headers.get('Retry-After');
      alert(`Too many requests. Try again in ${retryAfter} seconds`);
      break;
    default:
      alert(error.message || 'Something went wrong');
  }

  throw error;
}
```

### Use in API Client
```typescript
export async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
  });

  if (!response.ok) {
    await handleApiError(response); // 👈 Add error handling
  }

  return response.json();
}
```

---

## Common Patterns

### Pattern 1: Fetch Data with React Query
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

function AssetsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get('/api/assets'),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.assets.map(asset => (
        <li key={asset.id}>{asset.title}</li>
      ))}
    </ul>
  );
}
```

### Pattern 2: Create Form with Mutation
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreateAssetForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => api.post('/api/assets', data),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      title: e.target.title.value,
      description: e.target.description.value,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <textarea name="description" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Asset'}
      </button>
    </form>
  );
}
```

### Pattern 3: Permission-Based Rendering
```typescript
// Create reusable component
function RequirePermission({ 
  permission, 
  children 
}: { 
  permission: string; 
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  
  // Admin has all permissions
  if (user?.role === 'ADMIN') return <>{children}</>;
  
  // Check user's permissions
  if (!user?.permissions?.includes(permission)) return null;
  
  return <>{children}</>;
}

// Usage
function AssetCard({ asset }) {
  return (
    <div>
      <h3>{asset.title}</h3>
      
      <RequirePermission permission="ip_assets.edit_own">
        <button>Edit</button>
      </RequirePermission>
      
      <RequirePermission permission="ip_assets.delete_own">
        <button>Delete</button>
      </RequirePermission>
    </div>
  );
}
```

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
```

---

## API Response Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Show data |
| 201 | Created | Show success message |
| 401 | Unauthorized | Redirect to sign in |
| 403 | Forbidden | Show permission error |
| 404 | Not Found | Show not found message |
| 429 | Rate Limited | Show retry message |
| 500 | Server Error | Show generic error |

---

## Role Access Summary

| Feature | VIEWER | CREATOR | BRAND | ADMIN |
|---------|--------|---------|-------|-------|
| View own assets | ❌ | ✅ | ❌ | ✅ |
| Create assets | ❌ | ✅ | ❌ | ✅ |
| View projects | ❌ | ✅* | ✅ | ✅ |
| Create projects | ❌ | ❌ | ✅ | ✅ |
| View royalties | ❌ | ✅ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |

*Creators can only view projects containing their assets

---

## Next Steps

1. ✅ Read the [Full Integration Guide](./ACCESS_CONTROL_INTEGRATION_GUIDE.md)
2. ✅ Implement authentication in your app
3. ✅ Add role-based routing
4. ✅ Test error handling
5. ✅ Implement rate limit tracking

---

## Need Help?

- **Full Documentation:** [ACCESS_CONTROL_INTEGRATION_GUIDE.md](./ACCESS_CONTROL_INTEGRATION_GUIDE.md)
- **Auth Implementation:** [../AUTH_IMPLEMENTATION.md](../AUTH_IMPLEMENTATION.md)
- **Backend Middleware:** [../middleware/ACCESS_CONTROL.md](../middleware/ACCESS_CONTROL.md)

---

**Quick Start Version:** 1.0.0  
**Last Updated:** October 12, 2025
