# Supabase Database Setup - Quick Start

## 🎯 Your Supabase Project Details

- **Project URL**: https://ivndiftujdjwyqaidiea.supabase.co
- **Project Ref**: `ivndiftujdjwyqaidiea`
- **Region**: Auto-detected

## ✅ Configuration Complete

Your environment files have been configured with:
- ✅ Supabase API keys (anon & service role)
- ✅ Database connection URLs (direct & pooled)
- ✅ Connection pool settings

## 🔐 Next Steps: Get Your Database Password

1. Go to: https://app.supabase.com/project/ivndiftujdjwyqaidiea/settings/database
2. Scroll to **Connection string** section
3. Click on **URI** tab
4. Your password is shown in the connection string (or reset it if needed)
5. Copy the password

## 📝 Update Your Environment Files

Replace `[YOUR-PASSWORD]` in both `.env` and `.env.local` with your actual database password:

```bash
# Before:
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.ivndiftujdjwyqaidiea.supabase.co:5432/postgres"

# After (example):
DATABASE_URL="postgresql://postgres:your-actual-password@db.ivndiftujdjwyqaidiea.supabase.co:5432/postgres"
```

**Files to update:**
- `.env`
- `.env.local`

Update these 3 variables in each file:
- `DATABASE_URL`
- `DATABASE_URL_POOLED`
- `DATABASE_REPLICA_URL` (optional, only if using read replicas)

## 🚀 Initialize Your Database

After adding your password, run these commands:

```bash
# 1. Generate Prisma Client
npm run db:generate

# 2. Run migrations to create tables
npm run db:migrate

# 3. Seed the database with initial data (optional)
npm run db:seed

# 4. Verify database connection
npm run db:health-check
```

## 🔑 Environment Variables Added

### Database URLs
- `DATABASE_URL` - Direct connection (port 5432) for migrations
- `DATABASE_URL_POOLED` - Pooled connection (port 6543) for app queries
- `DATABASE_REPLICA_URL` - Read replica (optional, Pro+ plans only)

### Supabase API Keys
- `NEXT_PUBLIC_SUPABASE_URL` - Your project URL (safe for client-side)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous/public key (safe for client-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key (⚠️ SERVER-SIDE ONLY - never expose to client)

### Connection Pool Settings
- `DB_POOL_MODE` - Transaction pooling mode
- `DB_MAX_CONNECTIONS` - Maximum concurrent connections (10)
- `DB_MIN_CONNECTIONS` - Minimum idle connections (2)
- `DB_CONNECTION_TIMEOUT` - Connection timeout in seconds (20)
- `DB_IDLE_TIMEOUT` - Idle connection timeout in seconds (30)
- `DB_STATEMENT_TIMEOUT` - Query timeout in milliseconds (60000)

## 📊 Supabase Dashboard Quick Links

- **Database**: https://app.supabase.com/project/ivndiftujdjwyqaidiea/database/tables
- **SQL Editor**: https://app.supabase.com/project/ivndiftujdjwyqaidiea/sql
- **API Docs**: https://app.supabase.com/project/ivndiftujdjwyqaidiea/api
- **Settings**: https://app.supabase.com/project/ivndiftujdjwyqaidiea/settings/general

## 🎯 Connection Ports Explained

### Port 5432 (Direct Connection)
- Use for: Migrations, schema changes, admin tasks
- Variable: `DATABASE_URL`
- No pooling, direct database access

### Port 6543 (Pooled Connection - PgBouncer)
- Use for: Application queries, API requests
- Variable: `DATABASE_URL_POOLED`
- Connection pooling enabled for better performance

## 🔒 Security Best Practices

1. **Never commit** `.env` or `.env.local` to git
2. **Service Role Key** should ONLY be used server-side
3. **Anon Key** is safe for client-side (has Row-Level Security)
4. Use different projects for development, staging, and production

## 🧪 Testing Your Connection

Run the health check:
```bash
npm run db:health-check
```

Or test directly with psql:
```bash
psql "postgresql://postgres:[PASSWORD]@db.ivndiftujdjwyqaidiea.supabase.co:5432/postgres"
```

## 📚 Useful Commands

```bash
# Generate Prisma Client
npm run db:generate

# Create a new migration
npm run db:migrate:dev

# Deploy migrations to production
npm run db:migrate:deploy

# Open Prisma Studio (database GUI)
npm run db:studio

# Seed database
npm run db:seed

# Check database health
npm run db:health-check
```

## 🆘 Troubleshooting

### "Password authentication failed"
- Check your password in `.env` and `.env.local`
- Reset password in Supabase dashboard if needed

### "Too many connections"
- Reduce `DB_MAX_CONNECTIONS` value
- Check your Supabase plan limits (Free: 15, Pro: 50)

### "Connection timeout"
- Check your internet connection
- Verify project is not paused (Supabase pauses inactive free projects)

### "SSL connection error"
- Supabase requires SSL by default (already configured in Prisma)
- Add `?sslmode=require` if needed

## 📖 Additional Resources

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [Prisma with Supabase Guide](https://supabase.com/docs/guides/integrations/prisma)
- [Connection Pooling Guide](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

---

**Need help?** Check the docs or visit https://supabase.com/docs
