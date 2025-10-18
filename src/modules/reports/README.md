# Reports Module

Comprehensive reporting system for the YesGoddess platform, providing financial and operational insights with custom report building capabilities.

## Overview

The Reports Module provides a robust, enterprise-grade reporting infrastructure with the following capabilities:

- **Custom Report Builder**: Ad-hoc report creation with intelligent defaults and validation
- **Pre-defined Templates**: Monthly, quarterly, and annual reports for common use cases
- **Financial Statement Generation**: Comprehensive financial reports with revenue, expense, and profitability analysis
- **Type-Safe API**: Built with tRPC and Zod for end-to-end type safety
- **Flexible Export Options**: Support for PDF, CSV, Excel, and JSON formats
- **Advanced Filtering**: Filter reports by brands, creators, projects, regions, and more
- **Scheduled Reports**: Automated recurring report generation with email delivery
- **Security & Access Control**: Row-level security with role-based access
- **Archive Management**: Retention policies and lifecycle management
- **Error Handling**: Comprehensive error classification and handling
- **Performance Optimized**: Built with Redis caching, streaming exports, and background processing

## Current Implementation Status

### ✅ Completed Features (Roadmap Complete)

1. **Core Infrastructure**
   - Error handling framework with classification
   - Zod validation schemas for type safety
   - Modular service architecture
   - Background job processing with BullMQ
   - Audit logging integration

2. **Custom Report Builder** ✨ NEW
   - Dynamic field discovery for all data sources
   - Intelligent defaults by report category
   - Comprehensive validation engine
   - Configuration save/load functionality
   - Row-level security filters
   - Query builder with optimization

3. **Report Templates** ✨ NEW
   - Monthly Operational Report
   - Quarterly Strategic Report
   - Annual Comprehensive Report
   - Creator Earnings Statement
   - Brand Campaign Performance
   - Tax Compliance Report
   - Asset Portfolio Analysis

4. **PDF Report Generator** ✅
   - Professional layouts with branding
   - Charts and visualizations
   - Table rendering
   - Header/footer customization
   - Page numbering

5. **CSV Export Functionality** ✅
   - Streaming exports for large datasets
   - Memory-efficient processing
   - Proper escaping and formatting
   - Metadata headers

6. **Scheduled Report Generation** ✅
   - Cron-based scheduling
   - Daily, weekly, monthly, quarterly, annual frequencies
   - Retry logic with exponential backoff
   - Execution history tracking
   - Administrative management interface

7. **Report Delivery via Email** ✅
   - Scheduled report delivery template
   - Custom report ready notification
   - Secure download links
   - Attachment handling
   - Template registry integration

8. **Additional Services**
   - Excel export functionality
   - Secure download with signed URLs
   - Report archive with retention policies
   - Tiered storage (hot/cool/archive)

## Usage

### Basic Financial Report Generation

```typescript
import { FinancialReportingService } from '@/modules/reports';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

// Initialize services
const prisma = new PrismaClient();
const redis = new Redis();
const financialService = new FinancialReportingService(prisma, redis);

// Generate financial statement
const report = await financialService.generateFinancialStatement({
  name: 'Q1 2024 Financial Statement',
  type: 'financial_statement',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-03-31'),
  format: 'json',
  includeBalanceSheet: true,
  includeCashFlow: true,
  includeBreakdowns: true,
  generatedBy: 'user-id',
  filters: {
    brandIds: ['brand-1', 'brand-2'],
    regions: ['US', 'EU']
  }
});
```

### Using the tRPC API

```typescript
// Client-side usage
const report = await trpc.reports.generateFinancialReport.mutate({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-03-31'),
  format: 'json',
  includeDetails: true,
  filters: {
    brandIds: ['brand-1'],
    licenseTypes: ['EXCLUSIVE', 'NON_EXCLUSIVE']
  }
});
```

### Error Handling

```typescript
import { 
  ReportGenerationError, 
  ReportValidationError, 
  classifyReportError 
} from '@/modules/reports';

try {
  const report = await financialService.generateFinancialStatement(config);
} catch (error) {
  if (error instanceof ReportValidationError) {
    // Handle validation errors
    console.error('Validation failed:', error.details);
  } else if (error instanceof ReportGenerationError) {
    // Handle generation errors
    const classification = classifyReportError(error);
    console.error('Generation failed:', classification);
  }
}
```

## API Endpoints

### `generateFinancialReport`
Generate a comprehensive financial statement report.

**Input:**
- `startDate`: Report period start date
- `endDate`: Report period end date  
- `format`: Output format ('pdf' | 'csv' | 'excel' | 'json')
- `includeDetails`: Include detailed breakdowns
- `filters`: Optional filtering criteria

**Output:**
- `success`: Boolean indicating success
- `data`: Complete financial report data
- `message`: Status message

### `getReportHistory`
Retrieve historical reports with pagination.

**Input:**
- `limit`: Number of reports to return (1-100)
- `offset`: Pagination offset
- `type`: Optional report type filter
- `startDate`/`endDate`: Optional date range filter

### `validateReportConfig`
Validate report configuration before generation.

**Input:**
- Report configuration object

**Output:**
- `valid`: Boolean indicating validity
- `config`: Validated configuration (if valid)
- `errors`: Validation errors (if invalid)

### `getReportTypes`
Get available report types and their capabilities.

**Output:**
- `reportTypes`: Array of available report types
- `capabilities`: System-wide reporting capabilities

## Architecture

### Service Layer
```
/src/modules/reports/
├── services/           # Business logic services
│   ├── financial-reporting.service.ts
│   └── (additional services...)
├── schemas/           # Zod validation schemas
│   └── report.schema.ts
├── errors/            # Error handling
│   └── report.errors.ts
├── types.ts           # TypeScript type definitions
├── router.ts          # tRPC API endpoints
└── index.ts           # Module exports
```

### Database Integration

The reports module integrates with your existing Prisma schema, primarily using:

- `License` model for revenue data
- `RoyaltyStatement` model for royalty information
- `Payout` model for payment tracking
- `Creator`, `Brand`, `Project` models for entity relationships

### Caching Strategy

- Redis caching for frequently accessed aggregations
- Configurable cache TTL based on report type
- Cache invalidation on relevant data updates

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Report Generation Settings
REPORTS_MAX_DATE_RANGE_DAYS=730
REPORTS_CACHE_TTL_SECONDS=3600
REPORTS_MAX_CONCURRENT_GENERATIONS=5
```

### Performance Considerations

1. **Large Date Ranges**: Reports with date ranges > 2 years are rejected by default
2. **Database Optimization**: Uses database aggregations to minimize memory usage
3. **Caching**: Frequently accessed data is cached in Redis
4. **Pagination**: Large datasets are paginated to prevent memory issues

## Security

- Input validation with Zod schemas
- SQL injection protection via Prisma
- Rate limiting on report generation endpoints
- Access control integration ready
- Sensitive data filtering in error messages

## Error Handling

The module provides comprehensive error classification:

- **User Errors**: Validation failures, invalid parameters
- **System Errors**: Database issues, service failures
- **External Errors**: Third-party service problems
- **Configuration Errors**: Setup and configuration issues

Each error includes:
- Severity level (low/medium/high/critical)
- Category classification
- Retry recommendations
- Structured error details

## Testing

```typescript
// Example test
import { FinancialReportingService } from '@/modules/reports';
import { mockPrismaClient, mockRedisClient } from '@/test/mocks';

describe('FinancialReportingService', () => {
  it('should generate financial statements', async () => {
    const service = new FinancialReportingService(mockPrismaClient, mockRedisClient);
    
    const report = await service.generateFinancialStatement({
      // test configuration
    });
    
    expect(report).toBeDefined();
    expect(report.data.summary.totalRevenueCents).toBeGreaterThan(0);
  });
});
```

## Next Steps

1. **Implement Additional Services**: Complete revenue reconciliation, transaction ledger, and other report types
2. **Add Export Functionality**: Implement PDF/Excel generation with professional templates
3. **Scheduled Reports**: Add background job integration for automated reports
4. **Performance Optimization**: Add more sophisticated caching and database query optimization
5. **UI Integration**: Create frontend components for report configuration and viewing

## Contributing

When adding new report types:

1. Create the service in `/services/`
2. Add type definitions to `types.ts`
3. Create validation schema in `/schemas/`
4. Add tRPC endpoints to `router.ts`
5. Export from `index.ts`
6. Add comprehensive error handling
7. Include unit tests

## Support

For questions or issues with the Reports Module:

1. Check the error classification for guidance
2. Review the validation schemas for input requirements
3. Examine the service implementations for business logic
4. Use the tRPC router for API integration examples
