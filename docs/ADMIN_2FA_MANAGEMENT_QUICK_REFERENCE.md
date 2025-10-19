# Admin 2FA Management - Quick Reference

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users/2fa` | GET | List all users with 2FA status |
| `/api/admin/users/2fa/[userId]` | GET | Get detailed 2FA info for user |
| `/api/admin/users/2fa/[userId]/reset` | POST | Reset user's 2FA configuration |
| `/api/admin/users/2fa/[userId]/emergency-codes` | POST | Generate emergency access codes |
| `/api/admin/users/2fa/logs` | GET | Get security audit logs |
| `/api/admin/users/2fa/logs/export` | GET | Export logs (CSV/JSON) |
| `/api/admin/users/2fa/policies` | GET | Get all 2FA policies |
| `/api/admin/users/2fa/policies` | POST | Create/update 2FA policy |
| `/api/admin/users/2fa/policies/[role]` | GET | Get policy for specific role |
| `/api/admin/users/2fa/non-compliant` | GET | Get users without required 2FA |

---

## Common Use Cases

### View All Users' 2FA Status
```bash
GET /api/admin/users/2fa?page=1&limit=50
```

### Search for Specific User
```bash
GET /api/admin/users/2fa?search=john@example.com
```

### Filter by Role
```bash
GET /api/admin/users/2fa?role=ADMIN&twoFactorEnabled=false
```

### Get Detailed User Information
```bash
GET /api/admin/users/2fa/user123
```

### Reset User's 2FA
```bash
POST /api/admin/users/2fa/user123/reset
Content-Type: application/json

{
  "reason": "User lost access to authenticator app"
}
```

### Generate Emergency Codes
```bash
POST /api/admin/users/2fa/user123/emergency-codes
Content-Type: application/json

{
  "reason": "User unable to access device"
}
```

### View Security Logs (Last 24 Hours)
```bash
GET /api/admin/users/2fa/logs?startDate=2025-10-18T00:00:00Z
```

### Export Logs as CSV
```bash
GET /api/admin/users/2fa/logs/export?format=csv&startDate=2025-10-01T00:00:00Z
```

### Set Mandatory 2FA for Admins
```bash
POST /api/admin/users/2fa/policies
Content-Type: application/json

{
  "role": "ADMIN",
  "enforcementType": "MANDATORY",
  "gracePeriodDays": 7,
  "allowedMethods": ["AUTHENTICATOR", "SMS"]
}
```

### Get Non-Compliant Admins
```bash
GET /api/admin/users/2fa/non-compliant?role=ADMIN
```

---

## Service Usage

```typescript
import { Admin2FAManagementService } from '@/lib/services/admin-2fa-management.service';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';

const auditService = new AuditService(prisma);
const admin2FAService = new Admin2FAManagementService(prisma, auditService);

// Get all users' 2FA status
const users = await admin2FAService.getAllUsers2FAStatus({
  page: 1,
  limit: 50,
  role: 'ADMIN',
  twoFactorEnabled: false,
});

// Get detailed user info
const userDetails = await admin2FAService.getUser2FADetails('user123');

// Reset user 2FA
await admin2FAService.resetUser2FA(
  'user123',
  'admin456',
  'User lost device',
  { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0...' }
);

// Generate emergency codes
const result = await admin2FAService.generateEmergencyCodes(
  'user123',
  'admin456',
  'User locked out',
  { ipAddress: '192.168.1.1' }
);
console.log('Emergency codes:', result.codes);

// Check policy compliance
const compliance = await admin2FAService.checkUserPolicyCompliance('user123');
if (!compliance.compliant) {
  console.log(`User has ${compliance.daysRemaining} days to enable 2FA`);
}

// Set 2FA policy
await admin2FAService.set2FAPolicy(
  {
    role: 'ADMIN',
    enforcementType: 'MANDATORY',
    gracePeriodDays: 7,
  },
  'admin456',
  { ipAddress: '192.168.1.1' }
);
```

---

## Event Types

### Admin Actions
- `ADMIN_2FA_RESET` - Admin reset user's 2FA
- `EMERGENCY_CODES_GENERATED` - Admin generated emergency codes
- `EMERGENCY_CODE_USED` - User used emergency code
- `EMERGENCY_CODE_FAILED` - Invalid emergency code attempt
- `2FA_POLICY_CREATED` - New 2FA policy created
- `2FA_POLICY_UPDATED` - Existing 2FA policy updated

### User Actions
- `TOTP_SETUP_INITIATED` - User started TOTP setup
- `TOTP_SETUP_COMPLETED` - User completed TOTP setup
- `TOTP_VERIFICATION_SUCCESS` - Successful TOTP verification
- `TOTP_VERIFICATION_FAILED` - Failed TOTP verification
- `BACKUP_CODE_USED` - User used backup code
- `BACKUP_CODE_DEPLETED` - User ran out of backup codes

---

## Enforcement Types

### OPTIONAL
- Users can choose whether to enable 2FA
- No enforcement or grace period
- Recommended for non-critical roles

### MANDATORY
- All users of the role must enable 2FA
- Grace period applied before enforcement
- Strict lockout after grace period

### ROLE_BASED
- Enforcement based on specific role configuration
- Allows granular control per role
- Can mix optional and mandatory across roles

---

## Security Best Practices

1. **Always provide reasons** when resetting user 2FA or generating emergency codes
2. **Secure transmission** of emergency codes to users (never via email)
3. **Short expiration** for emergency codes (48 hours)
4. **Monitor admin actions** regularly through security logs
5. **Enforce 2FA for admins** with minimal grace period
6. **Regular audits** of non-compliant users
7. **Export logs** monthly for compliance

---

## Common Admin Tasks

### Onboarding New Admin

1. Create admin user account
2. Set 2FA policy to MANDATORY for ADMIN role
3. New admin will be prompted to enable 2FA on first login
4. Verify admin has enabled 2FA successfully

### Handling Locked Out User

1. Verify user identity through alternative means
2. Generate emergency codes via API
3. Securely provide codes to user (phone call, in-person)
4. User logs in with emergency code
5. User is prompted to reconfigure 2FA
6. Monitor that user completes 2FA setup

### Quarterly Security Audit

1. Export all security logs for the quarter
2. Review 2FA adoption rates by role
3. Identify non-compliant users
4. Check for unusual patterns in admin actions
5. Update policies as needed
6. Generate compliance report

### Emergency Policy Update

1. Review current policies: `GET /api/admin/users/2fa/policies`
2. Update policy for affected role
3. Set appropriate grace period
4. Notify affected users
5. Monitor compliance: `GET /api/admin/users/2fa/non-compliant`
6. Follow up with non-compliant users before grace period ends

---

## Troubleshooting

### User Can't Enable 2FA
- Check if user role requires specific 2FA methods
- Verify user's phone is verified for SMS method
- Check for any account locks or restrictions

### Emergency Codes Not Working
- Verify codes haven't expired (48-hour limit)
- Check if code has already been used
- Ensure user is entering code correctly (case-sensitive)
- Check logs for failed attempts

### Policy Not Enforcing
- Verify policy is set to MANDATORY
- Check grace period hasn't expired yet
- Ensure user role matches policy role
- Review user's `two_factor_required` field

### Admin Can't Reset Own 2FA
- This is by design for security
- Another admin must perform the reset
- Contact platform administrator for assistance

---

## Database Queries

### Find Users with 2FA Enabled
```sql
SELECT id, email, name, role, two_factor_verified_at
FROM users
WHERE two_factor_enabled = true
AND deleted_at IS NULL;
```

### Find Non-Compliant Users
```sql
SELECT id, email, name, role, two_factor_grace_period_ends
FROM users
WHERE two_factor_required = true
AND two_factor_enabled = false
AND deleted_at IS NULL;
```

### Count Emergency Codes by Admin
```sql
SELECT generated_by, COUNT(*) as codes_generated
FROM admin_emergency_codes
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY generated_by
ORDER BY codes_generated DESC;
```

### Recent 2FA Resets
```sql
SELECT u.email, u.two_factor_last_reset_by, u.two_factor_last_reset_at
FROM users u
WHERE two_factor_last_reset_at > NOW() - INTERVAL '7 days'
ORDER BY two_factor_last_reset_at DESC;
```

---

## Support Contact

For technical issues with admin 2FA management:
- Internal Slack: #security-support
- Email: security@yesgoddess.agency
- Emergency: +1-XXX-XXX-XXXX

---

**Last Updated:** October 19, 2025  
**Version:** 1.0.0
