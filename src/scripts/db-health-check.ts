#!/usr/bin/env tsx
/**
 * Database Health Check Script
 * 
 * Verifies database connectivity, performance, and configuration.
 * Run with: npm run db:health
 */

import { prisma, checkDatabaseHealth } from '../lib/db';
import { DatabaseMonitor } from '../lib/db/monitoring';
import { validatePoolConfig } from '../lib/db/connection-pool';

async function main() {
  console.log('🔍 YesGoddess Database Health Check\n');
  console.log('='.repeat(60));

  // 1. Validate connection pool configuration
  console.log('\n1. Connection Pool Configuration');
  console.log('-'.repeat(60));
  try {
    validatePoolConfig();
    console.log('✓ Connection pool configuration is valid\n');
  } catch (error) {
    console.error('✗ Connection pool configuration error:', error);
    process.exit(1);
  }

  // 2. Check database connectivity
  console.log('\n2. Database Connectivity');
  console.log('-'.repeat(60));
  const health = await checkDatabaseHealth();
  
  console.log(`Primary Database: ${health.primary ? '✓ Connected' : '✗ Disconnected'}`);
  console.log(`  Latency: ${health.latency.primary}ms`);
  
  console.log(`\nRead Replica: ${health.replica ? '✓ Connected' : '✗ Disconnected'}`);
  console.log(`  Latency: ${health.latency.replica}ms`);

  if (!health.primary) {
    console.error('\n✗ Primary database is not accessible!');
    process.exit(1);
  }

  // 3. Check database metrics
  console.log('\n3. Database Performance Metrics');
  console.log('-'.repeat(60));
  const monitor = new DatabaseMonitor(prisma);
  const metrics = await monitor.getMetrics();

  console.log(`Active Queries: ${metrics.queries.total}`);
  console.log(`Slow Queries: ${metrics.queries.slow}`);
  console.log(`Failed Queries: ${metrics.queries.failed}`);
  console.log(`\nConnections:`);
  console.log(`  Active: ${metrics.connections.active}`);
  console.log(`  Idle: ${metrics.connections.idle}`);
  console.log(`  Total: ${metrics.connections.total}`);
  console.log(`\nQuery Performance:`);
  console.log(`  Average: ${metrics.performance.avgQueryTime}ms`);
  console.log(`  P95: ${metrics.performance.p95QueryTime}ms`);
  console.log(`  P99: ${metrics.performance.p99QueryTime}ms`);

  // 4. Check database size
  console.log('\n4. Database Size & Usage');
  console.log('-'.repeat(60));
  const sizeInfo = await monitor.getDatabaseSize();
  console.log(`Total Database Size: ${sizeInfo.databaseSize}`);
  console.log(`Table Count: ${sizeInfo.tableCount}`);
  console.log(`\nLargest Tables:`);
  sizeInfo.largestTables.slice(0, 5).forEach((table, i) => {
    console.log(`  ${i + 1}. ${table.table}: ${table.size}`);
  });

  // 5. Check index usage
  console.log('\n5. Index Usage (Top 10)');
  console.log('-'.repeat(60));
  const indexes = await monitor.getIndexUsage();
  indexes.slice(0, 10).forEach((idx, i) => {
    console.log(`  ${i + 1}. ${idx.table}.${idx.index}`);
    console.log(`     Scans: ${idx.scans.toLocaleString()}, Tuples: ${idx.tuples.toLocaleString()}`);
  });

  // 6. Check for slow queries
  console.log('\n6. Recent Slow Queries');
  console.log('-'.repeat(60));
  const slowQueries = monitor.getSlowQueries(5);
  if (slowQueries.length === 0) {
    console.log('  ✓ No slow queries detected in the last minute');
  } else {
    slowQueries.forEach((query, i) => {
      console.log(`  ${i + 1}. ${query.model}.${query.operation} - ${query.duration}ms`);
    });
  }

  // 7. Test critical table access
  console.log('\n7. Critical Table Access');
  console.log('-'.repeat(60));
  const tables = [
    { name: 'users', test: () => prisma.user.findFirst() },
    { name: 'talents', test: () => prisma.talent.findFirst() },
    { name: 'brands', test: () => prisma.brand.findFirst() },
    { name: 'licenses', test: () => prisma.license.findFirst() },
    { name: 'royalties', test: () => prisma.royalty.findFirst() },
  ];

  for (const table of tables) {
    try {
      await table.test();
      console.log(`  ✓ ${table.name}`);
    } catch (error) {
      console.error(`  ✗ ${table.name}: ${error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✓ Database health check completed successfully');
  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n✗ Health check failed:', error);
  process.exit(1);
});
