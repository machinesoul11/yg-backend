/**
 * Query Filtering System
 * 
 * Provides automatic role-based and ownership-based query filtering
 * to ensure data isolation and security across all database queries.
 * 
 * This module extends the existing RLS implementation with:
 * - Automatic query filtering by role
 * - Tenant-scoped query helpers
 * - Ownership-based filtering
 * - Permission-based select filtering
 * - Secure data aggregation
 */

// Types
export * from './types';

// Role-based filtering
export * from './role-filters';

// Tenant-scoped queries
export * from './tenant-scoped-queries';

// Ownership filtering
export * from './ownership-filters';

// Permission-based select filtering
export * from './permission-select';

// Secure aggregations
export * from './secure-aggregations';
