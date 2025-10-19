# Authenticator 2FA REST API - Quick Reference

## Quick Start

All endpoints require authentication. Base URL: `/api/auth/2fa/totp`

## Endpoints

### 1. Enable Setup
```
POST /api/auth/2fa/totp/enable
```
**Returns:** QR code, manual entry key, authenticator app links

### 2. Verify & Complete Setup
```
POST /api/auth/2fa/totp/verify
Body: { "code": "123456" }
```
**Returns:** Backup codes (save these!)

### 3. Check Status
```
GET /api/auth/2fa/totp/status
```
**Returns:** Enabled status, backup codes remaining

### 4. Disable 2FA
```
POST /api/auth/2fa/totp/disable
Body: { "password": "yourPassword", "code": "123456" }
```

### 5. Regenerate Backup Codes
```
POST /api/auth/2fa/totp/backup-codes/regenerate
Body: { "password": "yourPassword" }
```
**Returns:** New backup codes (save these!)

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description",
    "statusCode": 400
  }
}
```

---

## Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Not logged in or session expired |
| `TOTP_ALREADY_ENABLED` | 400 | 2FA already active |
| `TOTP_NOT_ENABLED` | 400 | 2FA not active |
| `TOTP_INVALID` | 401 | Wrong TOTP code |
| `INVALID_CURRENT_PASSWORD` | 401 | Wrong password |
| `VALIDATION_ERROR` | 400 | Invalid request data |

---

## Setup Flow

1. **Call Enable:** Get QR code
2. **Scan QR:** Use authenticator app
3. **Call Verify:** Submit code from app
4. **Save Backup Codes:** Store somewhere safe
5. **Done!** 2FA is now enabled

---

## Authenticator Apps

**Recommended:**
- Google Authenticator (simple)
- Microsoft Authenticator (cloud backup)
- Authy (multi-device sync)
- FreeOTP (open-source)

---

## Security Notes

✅ **DO:**
- Save backup codes in password manager
- Use password + TOTP when disabling
- Regenerate backup codes if running low
- Keep authenticator app updated

❌ **DON'T:**
- Share your TOTP secret
- Screenshot QR codes
- Reuse backup codes
- Disable 2FA without reason

---

## Testing with cURL

```bash
# 1. Enable
curl -X POST http://localhost:3000/api/auth/2fa/totp/enable \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"

# 2. Verify
curl -X POST http://localhost:3000/api/auth/2fa/totp/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  -d '{"code":"123456"}'

# 3. Status
curl http://localhost:3000/api/auth/2fa/totp/status \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN"
```

---

## Files Created

```
src/app/api/auth/2fa/totp/
├── enable/route.ts
├── verify/route.ts
├── disable/route.ts
├── status/route.ts
└── backup-codes/regenerate/route.ts
```

---

## Database Tables Used

- `users` - Stores encrypted TOTP secret
- `two_factor_backup_codes` - Stores hashed backup codes
- `audit_events` - Logs all 2FA operations

---

## Integration Notes

### Frontend Example
```typescript
// Enable 2FA
const { data } = await fetch('/api/auth/2fa/totp/enable', {
  method: 'POST'
}).then(r => r.json());

// Show QR code
<img src={data.qrCodeDataUrl} />

// Verify with user input
await fetch('/api/auth/2fa/totp/verify', {
  method: 'POST',
  body: JSON.stringify({ code: userInput })
});
```

---

## Dependencies

- `otplib` - TOTP implementation
- `qrcode` - QR code generation  
- `bcryptjs` - Backup code hashing
- `zod` - Input validation
- `next-auth` - Session management

---

## Rate Limits (Recommended)

| Endpoint | Limit |
|----------|-------|
| Enable | 5/hour |
| Verify | 10/hour |
| Disable | 3/hour |
| Status | 60/hour |
| Regenerate | 3/hour |

---

## Support

**Full Documentation:** `docs/AUTHENTICATOR_2FA_REST_API_IMPLEMENTATION.md`

**Common Issues:**
- Invalid code → Check time sync on device
- Already enabled → Check status first
- Unauthorized → Verify session token

---

**Implementation Date:** October 19, 2025  
**Status:** ✅ Production Ready
