# License Queries API - Frontend Integration Guide (Part 3: Advanced Features)

**Classification:** ⚡ HYBRID  
*License queries are used by both public-facing website (brand ↔ creator) and admin backend (operations management)*

---

## Table of Contents

1. [Pagination & Filtering](#pagination--filtering)
2. [Rate Limiting & Quotas](#rate-limiting--quotas)
3. [Real-time Updates](#real-time-updates)
4. [Advanced Use Cases](#advanced-use-cases)
5. [Performance Optimization](#performance-optimization)
6. [Security Best Practices](#security-best-practices)

---

## 1. Pagination & Filtering

### 1.1 Pagination Format

**YesGoddess uses offset-based pagination:**

```typescript
// Request
{
  page: 2,        // Page number (1-indexed)
  pageSize: 20    // Items per page
}

// Response
{
  data: [...],
  meta: {
    pagination: {
      page: 2,
      pageSize: 20,
      total: 87,       // Total items matching filters
      totalPages: 5    // Math.ceil(total / pageSize)
    }
  }
}
```

**Calculate offset:**
```typescript
const offset = (page - 1) * pageSize;
```

**Why offset over cursor?**
- Simpler implementation for admin dashboards
- Allows jumping to specific pages
- Total count available for UI
- Sufficient for typical license volumes (<10,000 per brand)

---

### 1.2 Available Filter Parameters

| Filter | Type | Description | Example |
|--------|------|-------------|---------|
| `status` | Enum | License status | `"ACTIVE"` |
| `ipAssetId` | CUID | Specific IP asset | `"clx1234..."` |
| `brandId` | CUID | Specific brand | `"clxbrand..."` |
| `projectId` | CUID | Associated project | `"clxproj..."` |
| `licenseType` | Enum | Exclusivity type | `"EXCLUSIVE"` |
| `expiringBefore` | ISO 8601 | End date before | `"2025-12-31T23:59:59Z"` |
| `creatorId` | CUID | IP asset creator | `"clxcreator..."` |

**Combining Filters:**
```typescript
// All filters are ANDed together
const licenses = await trpc.licenses.list.query({
  status: 'ACTIVE',
  licenseType: 'EXCLUSIVE',
  expiringBefore: '2025-06-30T23:59:59Z',
  page: 1,
  pageSize: 50,
});
// Returns: Active exclusive licenses expiring before June 30, 2025
```

---

### 1.3 Sorting Options

**Current Implementation:**
- Licenses are sorted by `createdAt DESC` (newest first)
- Cannot be changed via API (internal business logic)

**Workaround for client-side sorting:**
```typescript
const { data } = useLicenses(filters);

const sortedLicenses = useMemo(() => {
  if (!data?.data) return [];
  
  return [...data.data].sort((a, b) => {
    switch (sortBy) {
      case 'endDate':
        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      case 'status':
        return a.status.localeCompare(b.status);
      case 'feeCents':
        return a.feeCents - b.feeCents;
      default:
        return 0;
    }
  });
}, [data, sortBy]);
```

**Recommendation:** For large datasets, request server-side sorting feature.

---

### 1.4 Filter UI Patterns

**Multi-Select Status Filter:**
```typescript
function StatusFilter({ value, onChange }: FilterProps) {
  const statuses: LicenseStatus[] = [
    'DRAFT',
    'PENDING_APPROVAL',
    'ACTIVE',
    'EXPIRED',
    'TERMINATED',
    'SUSPENDED',
  ];

  return (
    <Select
      multiple
      value={value}
      onChange={(e) => onChange(e.target.value)}
      renderValue={(selected) => selected.join(', ')}
    >
      {statuses.map((status) => (
        <MenuItem key={status} value={status}>
          <Checkbox checked={value.includes(status)} />
          <ListItemText primary={status.replace('_', ' ')} />
        </MenuItem>
      ))}
    </Select>
  );
}
```

**Date Range Picker:**
```typescript
function ExpiryDateFilter({ value, onChange }: FilterProps) {
  return (
    <DatePicker
      label="Expiring Before"
      value={value ? new Date(value) : null}
      onChange={(date) => {
        if (date) {
          onChange(date.toISOString());
        } else {
          onChange(undefined);
        }
      }}
      maxDate={new Date('2030-12-31')}
    />
  );
}
```

**Debounced Search:**
```typescript
function useDebouncedFilters(filters: LicenseFilters, delay = 300) {
  const [debouncedFilters, setDebouncedFilters] = useState(filters);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(filters);
    }, delay);

    return () => clearTimeout(handler);
  }, [filters, delay]);

  return debouncedFilters;
}

// Usage
function LicenseListWithFilters() {
  const [filters, setFilters] = useState<LicenseFilters>({});
  const debouncedFilters = useDebouncedFilters(filters);
  
  const { data } = useLicenses(debouncedFilters);
  // ...
}
```

---

## 2. Rate Limiting & Quotas

### 2.1 Rate Limits

**Current Limits (as of 2025):**
- **General queries:** 100 requests per minute per IP
- **Conflict checks:** 30 requests per minute per IP (more expensive)
- **Revenue queries:** 60 requests per minute per user

**Rate limit headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704067200
```

**How to check limits:**
```typescript
function useLicensesWithRateLimit(filters: LicenseFilters) {
  const { data, error } = useLicenses(filters);
  
  const rateLimit = useRef({
    limit: 100,
    remaining: 100,
    reset: Date.now(),
  });

  useEffect(() => {
    // Update from response headers
    if (data) {
      const headers = data.headers;
      rateLimit.current = {
        limit: parseInt(headers.get('X-RateLimit-Limit') || '100'),
        remaining: parseInt(headers.get('X-RateLimit-Remaining') || '100'),
        reset: parseInt(headers.get('X-RateLimit-Reset') || '0') * 1000,
      };
    }
  }, [data]);

  return { data, error, rateLimit: rateLimit.current };
}
```

---

### 2.2 Handling Rate Limit Errors

**Error Response:**
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "data": {
      "retryAfter": 42,
      "limit": 100,
      "remaining": 0,
      "reset": 1704067200
    }
  }
}
```

**User-Friendly Display:**
```typescript
function RateLimitError({ error }: { error: TRPCError }) {
  const retryAfter = error.data?.retryAfter || 60;
  const [countdown, setCountdown] = useState(retryAfter);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  return (
    <Alert severity="warning">
      Rate limit exceeded. You can try again in {countdown} seconds.
    </Alert>
  );
}
```

---

### 2.3 Best Practices to Avoid Limits

**1. Implement Request Coalescing:**
```typescript
// Bad: Multiple separate requests
const { data: licenses1 } = useLicenses({ ipAssetId: 'asset1' });
const { data: licenses2 } = useLicenses({ ipAssetId: 'asset2' });
const { data: licenses3 } = useLicenses({ ipAssetId: 'asset3' });

// Good: Batch IDs and filter client-side
const { data: allLicenses } = useLicenses({});
const licenses1 = allLicenses?.data.filter(l => l.ipAssetId === 'asset1');
const licenses2 = allLicenses?.data.filter(l => l.ipAssetId === 'asset2');
```

**2. Cache Aggressively:**
```typescript
const { data } = useLicenses(filters, {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});
```

**3. Debounce User Input:**
```typescript
const debouncedFilters = useDebouncedFilters(filters, 500);
```

---

## 3. Real-time Updates

### 3.1 Polling Recommendations

**For dashboards (expiring licenses):**
```typescript
const { data } = useLicenses(
  { status: 'ACTIVE', expiringBefore: getNext30Days() },
  {
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes
    refetchIntervalInBackground: false, // Stop when tab inactive
  }
);
```

**For license detail pages:**
```typescript
const { data } = useLicense(licenseId, {
  refetchInterval: 30 * 1000, // Poll every 30 seconds
  refetchOnWindowFocus: true,  // Refresh when tab regains focus
});
```

**Smart polling (only when needed):**
```typescript
function useLicenseWithSmartPolling(licenseId: string) {
  const isNearExpiry = useRef(false);

  return useLicense(licenseId, {
    refetchInterval: (data) => {
      if (!data) return false; // Don't poll if no data
      
      const daysUntilExpiry = differenceInDays(
        new Date(data.endDate),
        new Date()
      );
      
      // Poll more frequently if near expiry
      if (daysUntilExpiry <= 7) {
        isNearExpiry.current = true;
        return 10 * 1000; // 10 seconds
      } else if (daysUntilExpiry <= 30) {
        return 60 * 1000; // 1 minute
      } else {
        return 5 * 60 * 1000; // 5 minutes
      }
    },
  });
}
```

---

### 3.2 WebSocket Events (Future)

**Planned WebSocket events:**
```typescript
// Not yet implemented - placeholder for future
enum LicenseEvent {
  LICENSE_CREATED = 'license.created',
  LICENSE_SIGNED = 'license.signed',
  LICENSE_APPROVED = 'license.approved',
  LICENSE_EXPIRED = 'license.expired',
  LICENSE_TERMINATED = 'license.terminated',
  CONFLICT_DETECTED = 'conflict.detected',
}

// Future implementation
function useLicenseWebSocket(licenseId: string) {
  useEffect(() => {
    const ws = new WebSocket(`wss://ops.yesgoddess.agency/ws/licenses/${licenseId}`);
    
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      
      switch (type) {
        case LicenseEvent.LICENSE_SIGNED:
          queryClient.invalidateQueries(['licenses', licenseId]);
          toast.success('License has been signed!');
          break;
        // ...
      }
    };
    
    return () => ws.close();
  }, [licenseId]);
}
```

---

### 3.3 Optimistic UI Updates

**Example: Approve license optimistically**
```typescript
const approveMutation = trpc.licenses.approve.useMutation({
  onMutate: async (licenseId) => {
    await queryClient.cancelQueries(['licenses', licenseId]);
    
    const previousLicense = queryClient.getQueryData(['licenses', licenseId]);
    
    // Optimistically update status
    queryClient.setQueryData(['licenses', licenseId], (old: any) => ({
      ...old,
      data: {
        ...old.data,
        status: 'ACTIVE',
        signedAt: new Date().toISOString(),
      },
    }));
    
    return { previousLicense };
  },
  
  onError: (err, variables, context) => {
    queryClient.setQueryData(['licenses', variables], context?.previousLicense);
    toast.error('Failed to approve license');
  },
  
  onSuccess: () => {
    toast.success('License approved successfully!');
  },
});
```

---

## 4. Advanced Use Cases

### 4.1 Expiring Licenses Dashboard

```typescript
function ExpiringLicensesDashboard() {
  const { data: expiring30 } = useLicenses({
    status: 'ACTIVE',
    expiringBefore: add(new Date(), { days: 30 }).toISOString(),
  });

  const { data: expiring60 } = useLicenses({
    status: 'ACTIVE',
    expiringBefore: add(new Date(), { days: 60 }).toISOString(),
  });

  const { data: expiring90 } = useLicenses({
    status: 'ACTIVE',
    expiringBefore: add(new Date(), { days: 90 }).toISOString(),
  });

  return (
    <Grid container spacing={3}>
      <Grid item xs={4}>
        <Card>
          <CardContent>
            <Typography variant="h6">Expiring in 30 Days</Typography>
            <Typography variant="h3" color="error">
              {expiring30?.data.length ?? 0}
            </Typography>
            <Button component={Link} to="/licenses?expiring=30">
              View Details
            </Button>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={4}>
        <Card>
          <CardContent>
            <Typography variant="h6">Expiring in 60 Days</Typography>
            <Typography variant="h3" color="warning">
              {expiring60?.data.length ?? 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={4}>
        <Card>
          <CardContent>
            <Typography variant="h6">Expiring in 90 Days</Typography>
            <Typography variant="h3" color="info">
              {expiring90?.data.length ?? 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
```

---

### 4.2 Revenue Analytics Chart

```typescript
import { Line } from 'react-chartjs-2';

function RevenueChart({ licenseId }: { licenseId: string }) {
  const { data } = useLicenseRevenue(licenseId);

  if (!data?.data) return <Skeleton variant="rectangular" height={300} />;

  const chartData = {
    labels: data.data.revenueByPeriod.map((p) => p.period),
    datasets: [
      {
        label: 'Revenue',
        data: data.data.revenueByPeriod.map((p) => p.revenueCents / 100),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Revenue Over Time',
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `$${context.parsed.y.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `$${value}`,
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
```

---

### 4.3 Conflict Visualizer

```typescript
function ConflictTimeline({ conflicts }: { conflicts: Conflict[] }) {
  const timelineData = conflicts.map((conflict) => ({
    id: conflict.licenseId,
    start: new Date(conflict.conflictingLicense?.startDate || ''),
    end: new Date(conflict.conflictingLicense?.endDate || ''),
    reason: conflict.reason,
    details: conflict.details,
  }));

  return (
    <Timeline>
      {timelineData.map((item) => (
        <TimelineItem key={item.id}>
          <TimelineSeparator>
            <TimelineDot color="error" />
            <TimelineConnector />
          </TimelineSeparator>
          <TimelineContent>
            <Typography variant="h6">
              {item.reason.replace('_', ' ')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.details}
            </Typography>
            <Typography variant="caption">
              {format(item.start, 'MMM d, yyyy')} - {format(item.end, 'MMM d, yyyy')}
            </Typography>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
```

---

### 4.4 License Comparison Tool

```typescript
function LicenseComparison({ licenseIds }: { licenseIds: string[] }) {
  const queries = licenseIds.map((id) => useLicense(id));
  
  const isLoading = queries.some((q) => q.isLoading);
  const licenses = queries.map((q) => q.data?.data).filter(Boolean);

  if (isLoading) return <Skeleton />;

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Attribute</TableCell>
          {licenses.map((l) => (
            <TableCell key={l.id}>{l.id.slice(-8)}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Status</TableCell>
          {licenses.map((l) => (
            <TableCell key={l.id}>
              <LicenseStatusBadge status={l.status} />
            </TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>Type</TableCell>
          {licenses.map((l) => (
            <TableCell key={l.id}>{l.licenseType}</TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>Fee</TableCell>
          {licenses.map((l) => (
            <TableCell key={l.id}>${l.feeDollars}</TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>Rev Share</TableCell>
          {licenses.map((l) => (
            <TableCell key={l.id}>{l.revSharePercent}%</TableCell>
          ))}
        </TableRow>
        {/* Add more comparison rows */}
      </TableBody>
    </Table>
  );
}
```

---

## 5. Performance Optimization

### 5.1 Query Key Management

**Centralized query keys:**
```typescript
export const licenseKeys = {
  all: ['licenses'] as const,
  lists: () => [...licenseKeys.all, 'list'] as const,
  list: (filters: LicenseFilters) => [...licenseKeys.lists(), filters] as const,
  details: () => [...licenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...licenseKeys.details(), id] as const,
  revenue: (id: string) => [...licenseKeys.detail(id), 'revenue'] as const,
  stats: (brandId?: string) => [...licenseKeys.all, 'stats', brandId] as const,
};

// Usage
queryClient.invalidateQueries(licenseKeys.lists());
queryClient.prefetchQuery(licenseKeys.detail(licenseId), fetchLicense);
```

---

### 5.2 Data Normalization

**Normalize nested data:**
```typescript
import { normalize, schema } from 'normalizr';

const licenseSchema = new schema.Entity('licenses');
const licenseListSchema = [licenseSchema];

function useLicensesNormalized(filters: LicenseFilters) {
  const { data, ...rest } = useLicenses(filters);

  const normalized = useMemo(() => {
    if (!data?.data) return null;
    
    return normalize(data.data, licenseListSchema);
  }, [data]);

  return {
    licenses: normalized?.entities.licenses,
    licenseIds: normalized?.result,
    ...rest,
  };
}
```

---

### 5.3 Memoization Patterns

**Expensive calculations:**
```typescript
function LicenseRevenueAnalysis({ licenseId }: { licenseId: string }) {
  const { data } = useLicenseRevenue(licenseId);

  const analytics = useMemo(() => {
    if (!data?.data) return null;

    const totalRevenue = data.data.totalRevenueCents / 100;
    const projectedRevenue = data.data.projectedRevenueCents / 100;
    const growth = ((projectedRevenue - totalRevenue) / totalRevenue) * 100;
    
    const topCreator = data.data.revenueByCreator.reduce((max, creator) =>
      creator.totalRevenueCents > max.totalRevenueCents ? creator : max
    );

    return { totalRevenue, projectedRevenue, growth, topCreator };
  }, [data]);

  // Use memoized analytics
}
```

---

### 5.4 Virtual Scrolling

**For large license lists:**
```typescript
import { FixedSizeList } from 'react-window';

function VirtualizedLicenseList({ licenses }: { licenses: License[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <LicenseListItem license={licenses[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={licenses.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

---

## 6. Security Best Practices

### 6.1 Token Management

**Secure storage:**
```typescript
// ❌ BAD: Don't store in localStorage
localStorage.setItem('token', jwtToken);

// ✅ GOOD: Use httpOnly cookies
// Set by backend on login, automatically included in requests
```

**Token refresh:**
```typescript
// Refresh token before expiry
import { jwtDecode } from 'jwt-decode';

function useTokenRefresh() {
  const { token, refreshToken } = useAuth();

  useEffect(() => {
    if (!token) return;

    const decoded = jwtDecode(token);
    const expiresAt = decoded.exp * 1000;
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    // Refresh 5 minutes before expiry
    const refreshIn = timeUntilExpiry - 5 * 60 * 1000;

    const timer = setTimeout(() => {
      refreshToken();
    }, refreshIn);

    return () => clearTimeout(timer);
  }, [token]);
}
```

---

### 6.2 Input Sanitization

**Sanitize before sending:**
```typescript
import DOMPurify from 'dompurify';

function sanitizeFilters(filters: LicenseFilters): LicenseFilters {
  return {
    ...filters,
    // Remove potentially dangerous characters from string inputs
    ipAssetId: filters.ipAssetId?.replace(/[^a-z0-9]/gi, ''),
    brandId: filters.brandId?.replace(/[^a-z0-9]/gi, ''),
  };
}

// Usage
const sanitized = sanitizeFilters(filters);
const { data } = useLicenses(sanitized);
```

---

### 6.3 XSS Prevention

**Escape user-generated content:**
```typescript
// When displaying license metadata or notes
import DOMPurify from 'dompurify';

function LicenseNotes({ notes }: { notes: string }) {
  const clean = DOMPurify.sanitize(notes);
  
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

---

### 6.4 CSRF Protection

**Include CSRF token:**
```typescript
// Already handled by tRPC if using httpOnly cookies
// If using custom fetch:

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

fetch('/api/licenses', {
  headers: {
    'X-CSRF-Token': csrfToken,
  },
});
```

---

### 6.5 Content Security Policy

**Set CSP headers:**
```html
<!-- In HTML <head> or via server headers -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               connect-src 'self' https://ops.yesgoddess.agency;">
```

---

## Appendix: Complete Example

### Full-Featured License List Component

```typescript
import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Select,
  MenuItem,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useLicenses } from '@/features/licenses/hooks/useLicenses';
import { LicenseStatus, LicenseType, LicenseFilters } from '@/features/licenses/types';
import { format } from 'date-fns';

export function LicenseListPage() {
  const [filters, setFilters] = useState<LicenseFilters>({
    page: 1,
    pageSize: 20,
  });

  const { data, isLoading, error } = useLicenses(filters);

  const handlePageChange = (event: unknown, newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage + 1 }));
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({
      ...prev,
      pageSize: parseInt(event.target.value, 10),
      page: 1,
    }));
  };

  const handleFilterChange = (key: keyof LicenseFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <CircularProgress />
      </div>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {error.message || 'Failed to load licenses'}
      </Alert>
    );
  }

  const licenses = data?.data ?? [];
  const pagination = data?.meta.pagination;

  return (
    <div>
      <h1>Licenses</h1>

      {/* Filters */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 16 }}>
        <Select
          value={filters.status ?? ''}
          onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
          displayEmpty
          style={{ minWidth: 200 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          <MenuItem value="DRAFT">Draft</MenuItem>
          <MenuItem value="PENDING_APPROVAL">Pending Approval</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="EXPIRED">Expired</MenuItem>
          <MenuItem value="TERMINATED">Terminated</MenuItem>
        </Select>

        <Select
          value={filters.licenseType ?? ''}
          onChange={(e) => handleFilterChange('licenseType', e.target.value || undefined)}
          displayEmpty
          style={{ minWidth: 200 }}
        >
          <MenuItem value="">All Types</MenuItem>
          <MenuItem value="EXCLUSIVE">Exclusive</MenuItem>
          <MenuItem value="NON_EXCLUSIVE">Non-Exclusive</MenuItem>
          <MenuItem value="EXCLUSIVE_TERRITORY">Exclusive Territory</MenuItem>
        </Select>

        <TextField
          type="date"
          label="Expiring Before"
          InputLabelProps={{ shrink: true }}
          onChange={(e) => {
            const date = e.target.value
              ? new Date(e.target.value).toISOString()
              : undefined;
            handleFilterChange('expiringBefore', date);
          }}
        />
      </div>

      {/* Table */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>End Date</TableCell>
              <TableCell>Fee</TableCell>
              <TableCell>Rev Share</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {licenses.map((license) => (
              <TableRow key={license.id}>
                <TableCell>{license.id.slice(-8)}</TableCell>
                <TableCell>
                  <Chip
                    label={license.status}
                    color={
                      license.status === 'ACTIVE'
                        ? 'success'
                        : license.status === 'EXPIRED'
                        ? 'error'
                        : 'default'
                    }
                    size="small"
                  />
                </TableCell>
                <TableCell>{license.licenseType}</TableCell>
                <TableCell>{format(new Date(license.startDate), 'MMM d, yyyy')}</TableCell>
                <TableCell>{format(new Date(license.endDate), 'MMM d, yyyy')}</TableCell>
                <TableCell>${license.feeDollars}</TableCell>
                <TableCell>{license.revSharePercent}%</TableCell>
                <TableCell>
                  <Button size="small" href={`/licenses/${license.id}`}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {pagination && (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page - 1}
          onPageChange={handlePageChange}
          rowsPerPage={pagination.pageSize}
          onRowsPerPageChange={handlePageSizeChange}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      )}
    </div>
  );
}
```

---

## Summary

This guide covered:
- ✅ All 6 license query endpoints
- ✅ Complete TypeScript type definitions
- ✅ Request/response examples
- ✅ Authentication and authorization
- ✅ Error handling
- ✅ React Query integration
- ✅ Pagination and filtering
- ✅ Rate limiting
- ✅ Performance optimization
- ✅ Security best practices
- ✅ Advanced use cases
- ✅ Complete implementation examples

**Next Steps:**
1. Copy type definitions to your frontend codebase
2. Set up tRPC client with authentication
3. Implement React Query hooks
4. Build UI components following the examples
5. Test with real data
6. Monitor performance and rate limits

**Need Help?**
- Backend API issues: Contact backend team
- Frontend integration questions: Reference this guide
- Rate limit increases: Contact ops team

---

**End of Guide**
