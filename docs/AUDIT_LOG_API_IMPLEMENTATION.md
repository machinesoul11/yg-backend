# Audit Log API Implementation

## Overview

The Audit Log API provides comprehensive access to platform audit logs with department-scoped access control and integrity verification. This implementation ensures that admin staff can review system activities while maintaining appropriate security boundaries.

## Endpoints

### GET /api/admin/audit-logs

Search and filter audit logs with pagination and department-based access control.

**Authentication:** Required  
**Permission:** `system:logs`  
**Department Scoping:** Yes

#### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | - | Page number for pagination |
| `limit` | number | 50 | 100 | Number of logs per page |
| `startDate` | ISO string | - | - | Filter logs from this date |
| `endDate` | ISO string | - | - | Filter logs until this date |
| `userId` | string | - | - | Filter by user who performed action |
| `action` | string | - | - | Filter by action (comma-separated for multiple) |
| `resourceType` | ResourceType | - | - | Filter by resource type (comma-separated) |
| `resourceId` | string | - | - | Filter by specific resource ID |
| `search` | string | - | - | Search in email and action fields |

#### Response

```typescript
{
  logs: Array<{
    id: string;
    timestamp: Date;
    action: string;
    resourceType: ResourceType | null;
    resourceId: string | null;
    entityType: string;
    entityId: string;
    userId: string | null;
    email: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    requestId: string | null;
    permission: string | null;
    beforeState: any;
    afterState: any;
    diff: {
      added: Record<string, any>;
      removed: Record<string, any>;
      modified: Array<{
        field: string;
        oldValue: any;
        newValue: any;
      }>;
      unchanged: Record<string, any>;
    } | null;
    metadata: any;
    user: {
      id: string;
      name: string | null;
      email: string;
      role: UserRole;
    } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}
```

#### Example Request

```bash
GET /api/admin/audit-logs?page=1&limit=50&startDate=2025-10-01T00:00:00Z&action=LICENSE_CREATED,LICENSE_UPDATED
```

#### Department Access Rules

- **Super Admin**: Access to all audit logs
- **Content Manager**: Only content-related logs (assets, media, posts, campaigns)
- **Finance Manager**: Only finance and licensing logs (licenses, royalties, payouts)
- **Creator Applications**: Only creator-related logs
- **Brand Applications**: Only brand-related logs
- **Customer Service**: User and support-related logs
- **Operations**: System and configuration logs
- **Contractor**: No access to audit logs

---

### GET /api/admin/audit-logs/[id]

Retrieve complete details for a specific audit log entry with related logs and integrity verification.

**Authentication:** Required  
**Permission:** `system:logs`  
**Department Scoping:** Yes

#### Response

```typescript
{
  log: {
    id: string;
    timestamp: Date;
    action: string;
    resourceType: ResourceType | null;
    resourceId: string | null;
    entityType: string;
    entityId: string;
    userId: string | null;
    email: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    requestId: string | null;
    permission: string | null;
    beforeState: any;
    afterState: any;
    diff: {
      added: Record<string, any>;
      removed: Record<string, any>;
      modified: Array<{
        field: string;
        oldValue: any;
        newValue: any;
      }>;
      unchanged: Record<string, any>;
    } | null;
    metadata: any;
    user: {
      id: string;
      name: string | null;
      email: string;
      role: UserRole;
    } | null;
    previousLogHash: string | null;
    entryHash: string | null;
    archived: boolean;
    archivedAt: Date | null;
  };
  integrity: {
    verified: boolean;
    storedHash: string | null;
    computedHash: string | null;
    match: boolean;
  };
  relatedLogs: Array<{
    id: string;
    timestamp: Date;
    action: string;
    resourceType: ResourceType | null;
    resourceId: string | null;
    userId: string | null;
    email: string | null;
    user: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    hasChanges: boolean;
  }>;
}
```

#### Example Request

```bash
GET /api/admin/audit-logs/clxxxx123456789
```

#### Related Logs Logic

The endpoint returns up to 20 related logs based on:
1. **Same Resource**: Logs affecting the same resourceType and resourceId
2. **Same Session**: Logs from the same sessionId within ±5 minutes
3. **Same Request**: Logs with the same requestId

All related logs are filtered by department access rules.

---

## Integrity Verification

Each audit log entry includes an `entryHash` field that is computed using:
- Log ID
- Timestamp
- User ID
- Action
- Resource information
- Previous log hash (creating a hash chain)

The integrity verification:
1. Recomputes the hash using the same algorithm
2. Compares it with the stored hash
3. Returns verification status

**Note**: A mismatch indicates potential tampering or data corruption.

---

## Diff Formatting

When audit logs include both `beforeState` and `afterState`, the API generates a structured diff showing:

- **Added fields**: New fields in the after state
- **Removed fields**: Fields present in before but not in after
- **Modified fields**: Fields that changed with old and new values
- **Unchanged fields**: Fields that remained the same

Example diff:
```json
{
  "added": {
    "status": "ACTIVE"
  },
  "removed": {},
  "modified": [
    {
      "field": "amount",
      "oldValue": 1000,
      "newValue": 1500
    }
  ],
  "unchanged": {
    "id": "license_123",
    "createdAt": "2025-10-01T00:00:00Z"
  }
}
```

---

## Security & Access Control

### Permission Requirements

All audit log endpoints require the `system:logs` permission. Users without this permission will receive a 403 Forbidden response.

### Department-Based Filtering

Access to audit logs is automatically scoped based on the user's primary admin role department:

1. The system retrieves all active admin roles for the authenticated user
2. If a Super Admin role exists, full access is granted
3. Otherwise, the first active role's department determines access scope
4. All queries are automatically filtered to include only logs within scope
5. Individual log access is verified against department rules

### Audit Trail

All access to audit logs is itself audited:
- `AUDIT_LOGS_ACCESSED`: When searching logs
- `AUDIT_LOG_VIEWED`: When viewing a specific log
- `AUDIT_LOGS_ACCESS_DENIED`: When access is denied

---

## Performance Considerations

### Indexes

The following database indexes optimize audit log queries:
- `userId, timestamp DESC`
- `resourceType, resourceId, timestamp DESC`
- `action, timestamp DESC`
- `sessionId, timestamp DESC`
- `timestamp DESC`
- `archived, timestamp DESC`

### Pagination

- Default page size: 50 logs
- Maximum page size: 100 logs (hard limit)
- Total count is computed efficiently using Prisma count query

### Caching

Audit logs are not cached (`Cache-Control: no-store`) to ensure real-time accuracy for compliance and security investigations.

---

## Error Handling

### Common Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 401 | Unauthorized | No valid session |
| 403 | Insufficient permissions | Missing `system:logs` permission |
| 403 | No active admin role found | User has no active admin roles |
| 403 | Access denied: Log outside your department scope | Log not accessible to user's department |
| 404 | Audit log not found | Log ID does not exist |
| 400 | Invalid log ID | Malformed log ID parameter |
| 400 | Invalid startDate format | Date parameter cannot be parsed |
| 500 | Internal server error | Unexpected server error |

---

## Usage Examples

### Search Recent Logs

```typescript
const response = await fetch('/api/admin/audit-logs?page=1&limit=20', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(`Found ${data.pagination.total} logs`);
data.logs.forEach(log => {
  console.log(`${log.timestamp}: ${log.action} by ${log.user?.email}`);
});
```

### Filter by Date Range and Action

```typescript
const startDate = new Date('2025-10-01').toISOString();
const endDate = new Date('2025-10-31').toISOString();

const response = await fetch(
  `/api/admin/audit-logs?startDate=${startDate}&endDate=${endDate}&action=LICENSE_CREATED,LICENSE_UPDATED`,
  { method: 'GET' }
);
```

### View Specific Log with Related Logs

```typescript
const logId = 'clxxxx123456789';
const response = await fetch(`/api/admin/audit-logs/${logId}`, {
  method: 'GET',
});

const data = await response.json();

// Check integrity
if (data.integrity.verified) {
  console.log('Log integrity verified ✓');
} else {
  console.warn('Log integrity verification failed!');
}

// View changes
if (data.log.diff) {
  console.log('Modified fields:', data.log.diff.modified);
}

// View related logs
console.log(`Found ${data.relatedLogs.length} related logs`);
```

### Search by User Activity

```typescript
const userId = 'user_123';
const response = await fetch(`/api/admin/audit-logs?userId=${userId}&limit=100`, {
  method: 'GET',
});
```

---

## Implementation Files

- **Endpoints**:
  - `/src/app/api/admin/audit-logs/route.ts` - Search endpoint
  - `/src/app/api/admin/audit-logs/[id]/route.ts` - Get by ID endpoint

- **Utilities**:
  - `/src/lib/utils/audit-diff.ts` - Diff generation and formatting
  - `/src/lib/utils/audit-department-filter.ts` - Department-based filtering

- **Services**:
  - `/src/lib/services/audit.service.ts` - Audit log service (existing)
  - `/src/lib/services/audit-integrity.service.ts` - Integrity verification (existing)
  - `/src/lib/services/admin-role.service.ts` - Admin role management (existing)

---

## Future Enhancements

1. **Export Functionality**: Add CSV/JSON export for audit logs
2. **Advanced Filtering**: Add filtering by IP address, user agent, or custom metadata
3. **Real-time Updates**: WebSocket support for real-time log monitoring
4. **Anomaly Detection**: Automated detection of suspicious patterns
5. **Compliance Reports**: Pre-built reports for regulatory compliance
6. **Log Retention**: Automated archival of old logs based on retention policies
