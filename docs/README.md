# YesGoddess Backend Documentation

This directory contains comprehensive documentation for the YesGoddess backend system, organized by category for easy navigation.

## 📁 Directory Structure

### 🧩 Modules (`/modules`)
Feature-specific documentation for each major system module:

- **`authentication/`** - User authentication, session management, and authorization
  - `overview.md` - Complete authentication system documentation
  - `quick-reference.md` - Quick reference for auth APIs and flows
  - `implementation.md` - Implementation checklist and guide

- **`brands/`** - Brand management and profiles
  - `overview.md` - Brand system overview
  - `quick-reference.md` - Brand API reference
  - `implementation.md` - Implementation guide

- **`creators/`** - Creator profiles and management
  - `quick-reference.md` - Creator API reference
  - `implementation.md` - Implementation guide

- **`ip-assets/`** - Intellectual property asset management
  - `overview.md` - IP assets system overview
  - `ownership.md` - IP ownership tracking
  - `quick-reference.md` - IP assets API reference
  - `implementation.md` - Implementation guide

- **`licensing/`** - Licensing agreements and management
  - `quick-reference.md` - Licensing API reference
  - `implementation.md` - Implementation guide

- **`projects/`** - Project management and tracking
  - `overview.md` - Projects system overview
  - `deployment-guide.md` - Project deployment guide
  - `quick-reference.md` - Projects API reference
  - `implementation.md` - Implementation guide

- **`payouts/`** - Payment processing and payouts
  - `overview.md` - Payouts system overview
  - `tables.md` - Database tables documentation
  - `quick-reference.md` - Payouts API reference
  - `implementation.md` - Implementation checklist

- **`royalties/`** - Royalty calculations and tracking
  - `overview.md` - Royalties system overview
  - `quick-reference.md` - Royalties API reference

- **`analytics/`** - Analytics and event tracking
  - `overview.md` - Analytics system overview
  - `quick-reference.md` - Analytics events reference

- **`audit-log/`** - System audit logging
  - `overview.md` - Audit log system overview
  - `quick-reference.md` - Audit log reference

- **`system-tables/`** - Core system tables and metadata
  - `overview.md` - System tables overview
  - `quick-reference.md` - System tables reference
  - `implementation.md` - Implementation guide

### 🏗️ Infrastructure (`/infrastructure`)
Infrastructure and third-party service documentation:

- **`database/`** - PostgreSQL/Supabase database configuration
  - `setup-guide.md` - Complete database setup guide
  - `quick-reference.md` - Database quick reference
  - `files-index.md` - Index of database-related files
  - `check-constraints-overview.md` - Check constraints documentation
  - `check-constraints-reference.md` - Check constraints reference
  - `check-constraints-deployment.md` - Deployment checklist

- **`storage/`** - File storage (Cloudflare R2) configuration
  - `implementation.md` - Storage implementation guide
  - `configuration.md` - Storage configuration
  - `structure.md` - Storage structure and organization

- **`redis/`** - Redis cache and session store
  - `implementation.md` - Redis implementation guide
  - `configuration.md` - Redis configuration
  - `setup.md` - Redis setup guide

- **`email/`** - Email service (Resend) integration
  - `implementation.md` - Email service implementation
  - `resend-setup.md` - Resend setup guide

- **`supabase/`** - Supabase platform integration
  - `integration.md` - Supabase integration guide
  - `setup.md` - Supabase setup instructions
  - `ready.md` - Production readiness checklist

### 🚀 Operations (`/operations`)
Deployment and operational documentation:

- **`migrations/`** - Database migrations
  - `overview.md` - Migrations overview and checklist
  - `quick-start.md` - Quick start guide
  - `files-index.md` - Index of migration files

### 🎨 Brand (`/brand`)
Brand assets and guidelines:

- `guidelines.md` - YES GODDESS brand guidelines
- `logo-usage.md` - Logo usage documentation

## 🗂️ Documentation Types

Each module typically contains these document types:

- **`overview.md`** - Comprehensive overview of the module/feature
- **`quick-reference.md`** - Quick reference guide for APIs and common operations
- **`implementation.md`** - Implementation checklist and detailed guide
- **`*-guide.md`** - Specific guides for setup, deployment, etc.

## 🔍 Finding Documentation

### By Feature
Navigate to `/modules/{feature-name}/` for feature-specific documentation.

### By Infrastructure Component
Navigate to `/infrastructure/{component}/` for infrastructure setup and configuration.

### By Task
- **Setting up the project**: Start with `/infrastructure/database/setup-guide.md`
- **Implementing a new feature**: Check the relevant module's `implementation.md`
- **API reference**: Look for `quick-reference.md` in the relevant module
- **Deployment**: Check `/operations/migrations/` and module-specific deployment guides
- **Brand assets**: See `/brand/` folder

## 📊 Documentation Statistics

- **Total Modules**: 11
- **Infrastructure Components**: 5
- **Total Documentation Files**: ~60 organized files

## 🔄 Recent Changes

**October 2025** - Major documentation reorganization:
- Consolidated redundant files (checklists, summaries, and implementation guides)
- Organized into logical categories (modules, infrastructure, operations, brand)
- Reduced file count while preserving all important information
- Improved discoverability and navigation

## 📝 Contributing

When adding new documentation:
1. Place it in the appropriate category folder
2. Follow the naming conventions (overview, quick-reference, implementation, etc.)
3. Update this README if adding new categories or major documents
4. Keep module-specific docs in their respective module folders

## 🔗 Related Documentation

- **Root README**: `/README.md` - Main project README
- **Development Roadmap**: `/YesGoddess Ops - Backend & Admin Development Roadmap.md`
- **CI/CD Setup**: `/.github/CI_CD_SETUP.md`
