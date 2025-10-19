/**
 * Cache Initialization Script
 * 
 * Run this script after deployment to warm critical caches
 * Usage: tsx src/scripts/initialize-cache.ts
 */

import { PrismaClient } from '@prisma/client';
import { getCacheWarmingService } from '@/lib/redis/cache-warming.service';
import { cachePerformanceService } from '@/lib/redis/cache-performance.service';
import { redisMonitor } from '@/lib/redis/monitoring';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Cache Initialization Started ===\n');

  try {
    // 1. Check Redis health
    console.log('Step 1: Checking Redis health...');
    const health = await redisMonitor.getHealthStatus();
    console.log(`  Status: ${health.status}`);
    console.log(`  Latency: ${health.latency}ms`);
    console.log(`  Memory: ${health.details.memory}`);
    console.log(`  Keys: ${health.details.keyspace}`);

    if (health.status === 'unhealthy') {
      console.error('\n❌ Redis is unhealthy. Cannot proceed with cache initialization.');
      process.exit(1);
    }

    if (health.issues.length > 0) {
      console.warn('\n⚠️  Redis health issues detected:');
      health.issues.forEach((issue) => console.warn(`  - ${issue}`));
    }

    console.log('✓ Redis is healthy\n');

    // 2. Warm critical caches
    console.log('Step 2: Warming critical caches...');
    const warmingService = getCacheWarmingService(prisma);
    const warmingResult = await warmingService.warmCriticalCaches();

    console.log(`  Total tasks: ${warmingResult.totalTasks}`);
    console.log(`  Completed: ${warmingResult.completed}`);
    console.log(`  Failed: ${warmingResult.failed}`);
    console.log(`  Duration: ${warmingResult.duration}ms`);

    if (warmingResult.failed > 0) {
      console.warn('\n⚠️  Some cache warming tasks failed:');
      warmingResult.errors.forEach((error) => {
        console.warn(`  - ${error.task}: ${error.error}`);
      });
    }

    if (warmingResult.success) {
      console.log('✓ Critical caches warmed successfully\n');
    } else {
      console.error('✗ Some cache warming tasks failed\n');
    }

    // 3. Collect initial metrics
    console.log('Step 3: Collecting initial performance metrics...');
    await cachePerformanceService.recordMetricsSnapshot();
    const metrics = await cachePerformanceService.getCurrentMetrics();

    console.log(`  Hit Rate: ${metrics.hitRate}%`);
    console.log(`  Miss Rate: ${metrics.missRate}%`);
    console.log(`  Total Requests: ${metrics.totalRequests}`);
    console.log(`  Average Latency: ${metrics.averageLatency}ms`);
    console.log(`  Key Count: ${metrics.keyCount}`);
    console.log(`  Memory Usage: ${metrics.memoryUsage.used}`);

    console.log('✓ Initial metrics collected\n');

    // 4. Display cache distribution
    console.log('Step 4: Cache key distribution...');
    const distribution = await redisMonitor.getKeyDistribution();

    Object.entries(distribution).forEach(([namespace, count]) => {
      console.log(`  ${namespace}: ${count} keys`);
    });

    console.log('\n=== Cache Initialization Completed Successfully ===');
  } catch (error) {
    console.error('\n❌ Cache initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
