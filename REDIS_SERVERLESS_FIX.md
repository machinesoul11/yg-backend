# Redis Serverless Configuration Fix

## Changes Made

Updated Redis client configuration in `src/lib/redis/client.ts` to be serverless-friendly:

### Key Changes:

1. **Disabled persistent connections:**
   - `lazyConnect: false` - Connect immediately
   - `keepAlive: 0` - No keep-alive in serverless
   - `enableOfflineQueue: false` - Don't queue commands

2. **Shorter timeouts:**
   - `connectTimeout: 5000` (5s instead of 10s)
   - `commandTimeout: 3000` (3s instead of 5s)

3. **Reduced reconnection attempts:**
   - Removed `ECONNRESET` from reconnection errors
   - Shorter retry delays (100ms instead of 50ms)

4. **Less verbose logging:**
   - Only log actual errors in production
   - Ignore ECONNRESET errors (expected in serverless)

## Testing

After deploying, you should see:
- ✅ Fewer connection errors
- ✅ Faster response times
- ✅ Cleaner logs

## Alternative: Use Upstash REST API (Recommended)

For even better serverless performance, consider using Upstash's HTTP-based REST API:

```bash
npm install @upstash/redis
```

Then update your Redis client to use REST instead of TCP connections.

### Benefits:
- No connection pooling needed
- No ECONNRESET errors
- Better cold start performance
- Native serverless support

Would you like me to implement the REST API approach?
