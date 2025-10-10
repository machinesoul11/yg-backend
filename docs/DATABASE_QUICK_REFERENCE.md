# YesGoddess Database - Quick Reference

## 🚀 Quick Start

```bash
# 1. Setup database (first time only)
cp .env.example .env.local
# Update .env.local with Supabase credentials
./scripts/setup-database.sh

# 2. Development commands
npm run db:generate      # Generate Prisma Client
npm run db:migrate       # Create & apply migration
npm run db:studio        # Open database GUI
npm run db:seed          # Seed sample data

# 3. Health & monitoring
npm run db:health        # Check database health
npm run db:backup:verify # Verify backup config
```

## 📊 Common Tasks

### Check Database Health
```bash
npm run db:health
```

### Create a Migration
```bash
# 1. Edit prisma/schema.prisma
# 2. Run migration
npm run db:migrate
# 3. Review generated SQL
# 4. Test locally
# 5. Commit migration files
```

### Deploy to Production
```bash
npm run db:migrate:deploy  # Apply pending migrations
npm run db:migrate:status  # Verify status
```

### View Database
```bash
npm run db:studio  # Opens Prisma Studio at http://localhost:5555
```

## 🔌 Using the Database Client

### Basic Usage
```typescript
import { prisma, prismaRead } from '@/lib/db';

// Write operations (primary)
const user = await prisma.user.create({
  data: { email: 'user@example.com', name: 'User' }
});

// Read operations (replica)
const users = await prismaRead.user.findMany();
```

### Automatic Routing
```typescript
import { executeQuery } from '@/lib/db';

// Automatically routes to replica
const users = await executeQuery('read', (client) =>
  client.user.findMany()
);

// Automatically routes to primary
const user = await executeQuery('write', (client) =>
  client.user.create({ data: { ... } })
);
```

### Transactions
```typescript
import { prisma } from '@/lib/db';

await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { ... } });
  await tx.talent.create({ data: { userId: user.id, ... } });
});
```

## 🔍 Monitoring APIs

### Health Check
```bash
curl http://localhost:3000/api/health/database
```

### Metrics (Admin Only)
```bash
curl http://localhost:3000/api/admin/database/metrics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 Performance Tips

### Optimize Queries
```typescript
// ❌ Bad - N+1 queries
const talents = await prisma.talent.findMany();
for (const talent of talents) {
  const ips = await prisma.intellectualProperty.findMany({
    where: { talentId: talent.id }
  });
}

// ✅ Good - Single query with include
const talents = await prisma.talent.findMany({
  include: {
    ips: true
  }
});
```

### Use Select for Large Objects
```typescript
// ❌ Bad - Returns all fields
const user = await prisma.user.findUnique({ 
  where: { id } 
});

// ✅ Good - Returns only needed fields
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true }
});
```

### Implement Pagination
```typescript
const pageSize = 25;
const page = 1;

const [data, total] = await Promise.all([
  prisma.talent.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
  prisma.talent.count(),
]);
```

## 🔐 Security

### Row-Level Security (Future)
```typescript
// Set user context before queries
await prisma.$executeRaw`
  SELECT set_config('app.current_user_id', ${userId}, TRUE)
`;

// Queries are automatically filtered by RLS policies
const licenses = await prisma.license.findMany();
// Only returns licenses user has access to
```

### Role-Based Access
```typescript
// Check permissions before operations
if (userRole !== 'ADMIN') {
  throw new Error('Admin access required');
}

// Or use query filters
const where = userRole === 'ADMIN' 
  ? {} 
  : { userId: currentUserId };

const data = await prisma.talent.findMany({ where });
```

## 🚨 Troubleshooting

### Connection Issues
```bash
# Check connection
npm run db:health

# Check environment
echo $DATABASE_URL
echo $DATABASE_URL_POOLED
```

### Migration Issues
```bash
# Check migration status
npm run db:migrate:status

# Reset database (DEVELOPMENT ONLY!)
npm run db:migrate:reset

# Resolve conflicts
npm run db:migrate:resolve
```

### Performance Issues
```bash
# Check slow queries
npm run db:health

# View query logs (in development)
LOG_LEVEL=debug npm run dev
```

## 📦 Environment Variables

### Required
```bash
DATABASE_URL="postgresql://user:pass@host:5432/db"
DATABASE_URL_POOLED="postgresql://user:pass@host:6543/db?pgbouncer=true"
```

### Optional
```bash
DATABASE_REPLICA_URL="postgresql://..."  # Read replica
DB_MAX_CONNECTIONS="10"                   # Pool size
DB_CONNECTION_TIMEOUT="20"                # Timeout (seconds)
HEALTH_CHECK_TOKEN="your-token"           # API auth
```

## 📚 Resources

- **Setup Guide**: `docs/database-setup.md`
- **Migration Guide**: `prisma/migrations/README.md`
- **Database README**: `src/lib/db/README.md`
- **Checklist**: `DATABASE_CHECKLIST.md`
- **Summary**: `DATABASE_SETUP_SUMMARY.md`

## 🆘 Getting Help

1. Check health status: `npm run db:health`
2. Review Supabase dashboard
3. Check application logs
4. Review documentation
5. Contact #engineering-database on Slack

---

**Last Updated**: Database Configuration Phase  
**Status**: ✅ Complete and Ready for Use
