# YesGoddess Backend & Admin Platform

IP Licensing Platform API & Operations Management built with Next.js, Prisma, and tRPC.

## Overview

This is a [Next.js](https://nextjs.org) project that powers the YesGoddess IP licensing platform, enabling creators and brands to manage intellectual property, licenses, royalties, and payouts.

### Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Database:** PostgreSQL (Supabase)
- **ORM:** Prisma
- **API:** tRPC
- **Authentication:** NextAuth.js
- **Payments:** Stripe
- **Storage:** Cloudflare R2
- **Cache/Queue:** Redis (Upstash)
- **Email:** Resend

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase recommended)
- Redis instance (Upstash recommended)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Generate Prisma Client
npm run db:generate

# Run database migrations
npm run db:migrate:deploy

# (Optional) Seed test data
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## Database Management

### Common Commands

```bash
# Migration management
npm run db:migrate          # Create & apply migration (dev)
npm run db:migrate:deploy   # Apply migrations (production)
npm run db:migrate:status   # Check migration status

# Database utilities
npm run db:generate         # Generate Prisma Client
npm run db:health           # Run health check
npm run db:seed             # Seed test data
npm run db:studio           # Open Prisma Studio

# Development
npm run dev                 # Start dev server
npm run build              # Build for production
npm run lint               # Run linter
```

### Migration Documentation

For detailed migration procedures, see:

- **📘 [Migration Quick Start](docs/MIGRATIONS_QUICK_START.md)** - Get started with migrations
- **📋 [Migration Checklist](docs/MIGRATION_CHECKLIST.md)** - Step-by-step deployment guide
- **📖 [Migration Complete Guide](docs/MIGRATIONS_COMPLETE.md)** - Comprehensive documentation
- **🔧 [CI/CD Setup](/.github/CI_CD_SETUP.md)** - Automated deployment configuration
- **📝 [Migration Workflow](prisma/migrations/README.md)** - Daily development guide

---

## Project Structure

```
yg-backend/
├── .github/
│   └── workflows/          # CI/CD automation
├── docs/                   # Documentation
│   ├── MIGRATIONS_*.md     # Migration guides
│   ├── DATABASE_*.md       # Database documentation
│   └── *_MODULE_COMPLETE.md # Feature documentation
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── migrations/         # Migration files
│   │   ├── rollbacks/      # Rollback scripts
│   │   └── *.sql          # SQL migrations
│   └── seed.ts            # Seed data script
├── src/
│   ├── app/               # Next.js app directory
│   ├── lib/
│   │   ├── db/           # Database client & utilities
│   │   └── ...           # Other utilities
│   └── scripts/          # CLI scripts
└── package.json
```

---

## Available Scripts

### Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Database
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes (dev only)
- `npm run db:migrate` - Create & apply migration
- `npm run db:migrate:deploy` - Apply migrations (production)
- `npm run db:migrate:status` - Check migration status
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed test data
- `npm run db:health` - Database health check

### Email
- `npm run email:dev` - Email template development
- `npm run email:build` - Build email templates

---

## Environment Variables

Required environment variables (see `.env.example` for full list):

```env
# Database
DATABASE_URL=postgresql://...           # Direct connection
DATABASE_URL_POOLED=postgresql://...    # Pooled connection

# Authentication
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# Redis
REDIS_URL=redis://...

# Storage (Cloudflare R2)
STORAGE_PROVIDER=s3
STORAGE_BUCKET=your-bucket
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_ENDPOINT=...

# Email (Resend)
RESEND_API_KEY=...

# Payments (Stripe)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

---

## Documentation

### Getting Started
- [Quick Start Guide](docs/MIGRATIONS_QUICK_START.md)
- [Database Setup](docs/DATABASE_SETUP_SUMMARY.md)
- [Database Checklist](docs/DATABASE_CHECKLIST.md)

### Development
- [Migration Workflow](prisma/migrations/README.md)
- [Migration Checklist](docs/MIGRATION_CHECKLIST.md)
- [Rollback Procedures](prisma/migrations/rollbacks/ROLLBACK_TEMPLATE.md)

### Deployment
- [CI/CD Setup](.github/CI_CD_SETUP.md)
- [Projects Deployment Guide](PROJECTS_DEPLOYMENT_GUIDE.md)
- [Supabase Setup](SUPABASE_SETUP.md)

### Reference
- [Database Quick Reference](docs/DATABASE_QUICK_REFERENCE.md)
- [Database Files Index](docs/DATABASE_FILES_INDEX.md)
- [Backend Roadmap](YesGoddess%20Ops%20-%20Backend%20&%20Admin%20Development%20Roadmap.md)

---

## Key Features

### Implemented Modules ✅

- **Authentication** - User auth with NextAuth.js
- **Creators** - Creator profiles and management
- **Brands** - Brand accounts and teams
- **Projects** - Project lifecycle management
- **IP Assets** - Asset storage and versioning
- **IP Ownership** - Multi-party ownership tracking
- **Licenses** - License management and scoping
- **Royalties** - Automated royalty calculations
- **Payouts** - Stripe Connect payouts
- **Analytics** - Event tracking and metrics
- **Audit Logs** - Comprehensive audit trail
- **System Tables** - Idempotency, feature flags, notifications
- **Email System** - Transactional emails with Resend

### Database Features

- **Connection Pooling** - PgBouncer integration
- **Read Replicas** - Optional read replica support
- **Health Monitoring** - Automated health checks
- **Backup System** - Automated backups via Supabase
- **Migration System** - Prisma Migrate with rollback support
- **Seed Data** - Comprehensive test data
- **Row-Level Security** - PostgreSQL RLS policies
- **Performance Indexes** - Optimized query performance

---

## Deployment

### Vercel (Recommended)

This project is optimized for deployment on [Vercel](https://vercel.com):

1. Push code to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

See [Vercel deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.

### Database Migrations

For production deployments:

1. **Backup database** (automatic via Supabase)
2. **Apply migrations**: `npm run db:migrate:deploy`
3. **Verify health**: `npm run db:health`
4. **Deploy application** via Vercel

See [Migration Checklist](docs/MIGRATION_CHECKLIST.md) for detailed procedures.

---

## Contributing

1. Create feature branch from `develop`
2. Make changes and commit
3. Open PR to `develop` (tests run automatically)
4. After review, merge to `develop` (auto-deploys to staging)
5. Create release when ready for production

---

## Support

- **Documentation**: Check `docs/` directory
- **Issues**: GitHub Issues
- **Questions**: Team Slack channel

---

## License

Proprietary - YesGoddess Platform

---

**Last Updated:** October 10, 2025  
**Status:** Production Ready 🚀
