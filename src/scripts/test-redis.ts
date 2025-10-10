#!/usr/bin/env tsx

/**
 * Test Redis Connection and Functionality
 * Run: npm run redis:test
 */

import 'dotenv/config';
import { getRedisClient, closeRedisClient, cacheService, rateLimiter, distributedLock, redisMonitor } from '../lib/redis';

async function testRedisConnection() {
  console.log('🧪 Testing Redis Connection and Functionality\n');

  try {
    const redis = getRedisClient();
    console.log('✅ Redis client initialized');

    // Test 1: Basic connection
    console.log('\n1️⃣  Testing basic connection...');
    const pong = await redis.ping();
    console.log(`   PING response: ${pong}`);

    // Test 2: Set and Get
    console.log('\n2️⃣  Testing SET/GET operations...');
    await redis.set('test:key', 'Hello Redis!');
    const value = await redis.get('test:key');
    console.log(`   Retrieved value: ${value}`);

    // Test 3: Cache Service
    console.log('\n3️⃣  Testing Cache Service...');
    const testData = { id: '123', name: 'Test User', email: 'test@example.com' };
    await cacheService.set('cache:user:123', testData, 60);
    const cached = await cacheService.get<typeof testData>('cache:user:123');
    console.log(`   Cached data: ${JSON.stringify(cached)}`);

    // Test 4: Rate Limiter
    console.log('\n4️⃣  Testing Rate Limiter...');
    const limit1 = await rateLimiter.checkLimit('test-user', 'api', 10, 60);
    console.log(`   First request: allowed=${limit1.allowed}, remaining=${limit1.remaining}`);
    
    const limit2 = await rateLimiter.checkLimit('test-user', 'api', 10, 60);
    console.log(`   Second request: allowed=${limit2.allowed}, remaining=${limit2.remaining}`);

    // Test 5: Distributed Lock
    console.log('\n5️⃣  Testing Distributed Lock...');
    const { acquired, release } = await distributedLock.acquire('test:lock', 30);
    console.log(`   Lock acquired: ${acquired}`);
    
    if (acquired) {
      console.log('   Simulating work...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await release();
      console.log('   Lock released');
    }

    // Test 6: Monitoring
    console.log('\n6️⃣  Testing Monitoring...');
    const health = await redisMonitor.getHealthStatus();
    console.log(`   Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`   Latency: ${health.latency}ms`);

    const hitRate = await redisMonitor.getHitRate();
    console.log(`   Hit rate: ${hitRate.hitRate.toFixed(2)}%`);

    const cacheStats = await cacheService.getStats();
    console.log(`   Total keys: ${cacheStats.totalKeys}`);
    console.log(`   Cache keys: ${cacheStats.cacheKeys}`);

    // Test 7: Cleanup
    console.log('\n7️⃣  Cleaning up test data...');
    await redis.del('test:key');
    await cacheService.delete('cache:user:123');
    await rateLimiter.reset('test-user', 'api');
    await distributedLock.forceRelease('test:lock');
    console.log('   Cleanup complete');

    console.log('\n✅ All tests passed! Redis is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeRedisClient();
    console.log('✅ Redis connection closed');
  }
}

// Run tests
testRedisConnection().catch(console.error);
