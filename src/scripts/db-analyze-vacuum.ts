#!/usr/bin/env tsx

/**
 * Database Vacuum Analysis Tool
 * 
 * Analyzes table bloat, dead tuples, and vacuum activity
 * Provides recommendations for vacuum tuning
 */

import { prisma } from '@/lib/db';

interface VacuumStats {
  schemaname: string;
  relname: string;
  last_vacuum: Date | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
  last_autoanalyze: Date | null;
  n_tup_ins: bigint;
  n_tup_upd: bigint;
  n_tup_del: bigint;
  n_live_tup: bigint;
  n_dead_tup: bigint;
  n_mod_since_analyze: bigint;
}

interface TableBloat {
  schemaname: string;
  tablename: string;
  actual_size_bytes: bigint;
  expected_size_bytes: bigint;
  bloat_bytes: bigint;
  bloat_ratio: number;
}

interface VacuumRecommendation {
  table: string;
  reason: string;
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Get vacuum statistics for all tables
 */
async function getVacuumStats(): Promise<VacuumStats[]> {
  const results = await prisma.$queryRaw<VacuumStats[]>`
    SELECT 
      schemaname,
      relname,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      n_tup_ins,
      n_tup_upd,
      n_tup_del,
      n_live_tup,
      n_dead_tup,
      n_mod_since_analyze
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_dead_tup DESC
  `;
  return results;
}

/**
 * Estimate table bloat
 */
async function getTableBloat(): Promise<TableBloat[]> {
  const results = await prisma.$queryRaw<TableBloat[]>`
    SELECT 
      schemaname,
      tablename,
      pg_total_relation_size(schemaname || '.' || tablename) as actual_size_bytes,
      pg_relation_size(schemaname || '.' || tablename) as expected_size_bytes,
      pg_total_relation_size(schemaname || '.' || tablename) - 
        pg_relation_size(schemaname || '.' || tablename) as bloat_bytes,
      CASE 
        WHEN pg_relation_size(schemaname || '.' || tablename) > 0 
        THEN (pg_total_relation_size(schemaname || '.' || tablename)::float / 
              pg_relation_size(schemaname || '.' || tablename)::float) - 1
        ELSE 0
      END as bloat_ratio
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY bloat_bytes DESC
  `;
  return results;
}

/**
 * Check if autovacuum is running
 */
async function checkAutovacuumStatus(): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ autovacuum: boolean }>>`
    SELECT current_setting('autovacuum')::boolean as autovacuum
  `;
  return result[0]?.autovacuum ?? false;
}

/**
 * Get current vacuum processes
 */
async function getCurrentVacuums(): Promise<Array<{ pid: number; table: string; duration: string }>> {
  const results = await prisma.$queryRaw<Array<{
    pid: number;
    query: string;
    state_change: Date;
  }>>`
    SELECT 
      pid,
      query,
      state_change
    FROM pg_stat_activity
    WHERE query LIKE '%vacuum%'
      AND query NOT LIKE '%pg_stat_activity%'
      AND state = 'active'
  `;
  
  return results.map(r => {
    const duration = Date.now() - r.state_change.getTime();
    const match = r.query.match(/vacuum.*?\s+(\w+\.\w+|\w+)/i);
    const table = match ? match[1] : 'unknown';
    
    return {
      pid: r.pid,
      table,
      duration: formatDuration(duration),
    };
  });
}

/**
 * Analyze vacuum needs and generate recommendations
 */
function analyzeVacuumNeeds(stats: VacuumStats[]): VacuumRecommendation[] {
  const recommendations: VacuumRecommendation[] = [];
  const now = new Date();
  
  for (const table of stats) {
    const tableName = `${table.schemaname}.${table.relname}`;
    const liveRows = Number(table.n_live_tup);
    const deadRows = Number(table.n_dead_tup);
    const modifiedSinceAnalyze = Number(table.n_mod_since_analyze);
    
    // Skip empty tables
    if (liveRows === 0 && deadRows === 0) continue;
    
    // Calculate dead tuple ratio
    const totalRows = liveRows + deadRows;
    const deadRatio = totalRows > 0 ? deadRows / totalRows : 0;
    
    // Critical: Very high dead tuple ratio
    if (deadRatio > 0.5) {
      recommendations.push({
        table: tableName,
        reason: `Critical dead tuple ratio: ${(deadRatio * 100).toFixed(1)}% (${deadRows.toLocaleString()} dead rows)`,
        action: 'Run manual VACUUM ANALYZE immediately. Consider VACUUM FULL during maintenance window.',
        priority: 'critical',
      });
      continue;
    }
    
    // High: High dead tuple ratio
    if (deadRatio > 0.2) {
      recommendations.push({
        table: tableName,
        reason: `High dead tuple ratio: ${(deadRatio * 100).toFixed(1)}% (${deadRows.toLocaleString()} dead rows)`,
        action: 'Run manual VACUUM ANALYZE. Tune autovacuum_vacuum_scale_factor for this table.',
        priority: 'high',
      });
      continue;
    }
    
    // Check vacuum frequency
    const lastVacuum = table.last_autovacuum || table.last_vacuum;
    if (lastVacuum) {
      const hoursSinceVacuum = (now.getTime() - lastVacuum.getTime()) / (1000 * 60 * 60);
      
      // Never vacuumed or very old
      if (hoursSinceVacuum > 168 && deadRows > 1000) { // 1 week
        recommendations.push({
          table: tableName,
          reason: `No vacuum in ${Math.floor(hoursSinceVacuum / 24)} days (${deadRows.toLocaleString()} dead rows)`,
          action: 'Run manual VACUUM ANALYZE. Check autovacuum configuration.',
          priority: 'high',
        });
      }
    } else if (deadRows > 500) {
      recommendations.push({
        table: tableName,
        reason: `Never vacuumed (${deadRows.toLocaleString()} dead rows)`,
        action: 'Run manual VACUUM ANALYZE immediately.',
        priority: 'high',
      });
    }
    
    // Check analyze frequency
    const lastAnalyze = table.last_autoanalyze || table.last_analyze;
    if (lastAnalyze && modifiedSinceAnalyze > liveRows * 0.1) {
      const hoursSinceAnalyze = (now.getTime() - lastAnalyze.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceAnalyze > 24 && liveRows > 1000) {
        recommendations.push({
          table: tableName,
          reason: `${modifiedSinceAnalyze.toLocaleString()} rows modified since last analyze (${Math.floor(hoursSinceAnalyze)} hours ago)`,
          action: 'Run ANALYZE to update query planner statistics.',
          priority: 'medium',
        });
      }
    }
    
    // Moderate dead tuples
    if (deadRatio > 0.1 && deadRatio <= 0.2 && deadRows > 1000) {
      recommendations.push({
        table: tableName,
        reason: `Moderate dead tuple ratio: ${(deadRatio * 100).toFixed(1)}% (${deadRows.toLocaleString()} dead rows)`,
        action: 'Monitor table. Consider tuning autovacuum if ratio increases.',
        priority: 'low',
      });
    }
  }
  
  return recommendations;
}

/**
 * Analyze table bloat
 */
function analyzeBloat(bloatStats: TableBloat[]): VacuumRecommendation[] {
  const recommendations: VacuumRecommendation[] = [];
  
  for (const table of bloatStats) {
    const bloatRatio = table.bloat_ratio;
    const bloatBytes = Number(table.bloat_bytes);
    const actualSize = Number(table.actual_size_bytes);
    
    // Skip small tables
    if (actualSize < 1024 * 1024) continue; // < 1MB
    
    const tableName = `${table.schemaname}.${table.tablename}`;
    
    if (bloatRatio > 0.5) {
      recommendations.push({
        table: tableName,
        reason: `Severe bloat: ${(bloatRatio * 100).toFixed(1)}% (${formatBytes(bloatBytes)} wasted)`,
        action: 'Schedule VACUUM FULL during maintenance window to reclaim space.',
        priority: 'critical',
      });
    } else if (bloatRatio > 0.3) {
      recommendations.push({
        table: tableName,
        reason: `High bloat: ${(bloatRatio * 100).toFixed(1)}% (${formatBytes(bloatBytes)} wasted)`,
        action: 'Run VACUUM ANALYZE. Consider VACUUM FULL during next maintenance.',
        priority: 'high',
      });
    } else if (bloatRatio > 0.2 && bloatBytes > 10 * 1024 * 1024) { // > 10MB
      recommendations.push({
        table: tableName,
        reason: `Moderate bloat: ${(bloatRatio * 100).toFixed(1)}% (${formatBytes(bloatBytes)} wasted)`,
        action: 'Monitor bloat. Run VACUUM if it increases.',
        priority: 'medium',
      });
    }
  }
  
  return recommendations;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: bigint | number): string {
  const b = Number(bytes);
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = b;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format duration in milliseconds to human-readable
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format date to relative time
 */
function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}m ago`;
  }
}

/**
 * Main analysis function
 */
async function main() {
  console.log('🧹 Database Vacuum Analysis Tool\n');
  console.log('='.repeat(80));
  
  try {
    // Check autovacuum status
    console.log('\n📋 Autovacuum Configuration');
    console.log('-'.repeat(80));
    const autovacuumEnabled = await checkAutovacuumStatus();
    console.log(`Autovacuum: ${autovacuumEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    
    if (!autovacuumEnabled) {
      console.log('\n⚠️  WARNING: Autovacuum is disabled! This will lead to performance degradation.');
      console.log('   Enable with: ALTER DATABASE postgres SET autovacuum = on;\n');
    }
    
    // Check running vacuums
    const runningVacuums = await getCurrentVacuums();
    if (runningVacuums.length > 0) {
      console.log('\n🔄 Active Vacuum Processes:');
      for (const vac of runningVacuums) {
        console.log(`   PID ${vac.pid}: ${vac.table} (running ${vac.duration})`);
      }
    }
    
    // Get statistics
    console.log('\n📊 Collecting vacuum statistics...');
    const vacuumStats = await getVacuumStats();
    const bloatStats = await getTableBloat();
    
    // Analyze dead tuples
    console.log('\n💀 Dead Tuple Analysis');
    console.log('-'.repeat(80));
    
    const topDeadTuples = vacuumStats
      .filter(t => Number(t.n_dead_tup) > 0)
      .slice(0, 10);
    
    if (topDeadTuples.length === 0) {
      console.log('✅ No significant dead tuples found');
    } else {
      console.log('Top 10 tables by dead tuple count:\n');
      for (const table of topDeadTuples) {
        const liveRows = Number(table.n_live_tup);
        const deadRows = Number(table.n_dead_tup);
        const deadRatio = (liveRows + deadRows) > 0 
          ? (deadRows / (liveRows + deadRows) * 100).toFixed(1)
          : '0.0';
        
        console.log(`  📍 ${table.schemaname}.${table.relname}`);
        console.log(`     Live rows: ${liveRows.toLocaleString()}`);
        console.log(`     Dead rows: ${deadRows.toLocaleString()} (${deadRatio}%)`);
        console.log(`     Last vacuum: ${formatRelativeTime(table.last_autovacuum || table.last_vacuum)}`);
        console.log(`     Last analyze: ${formatRelativeTime(table.last_autoanalyze || table.last_analyze)}\n`);
      }
    }
    
    // Analyze bloat
    console.log('\n💾 Table Bloat Analysis');
    console.log('-'.repeat(80));
    
    const significantBloat = bloatStats
      .filter(t => Number(t.actual_size_bytes) > 1024 * 1024) // > 1MB
      .filter(t => t.bloat_ratio > 0.1)
      .slice(0, 10);
    
    if (significantBloat.length === 0) {
      console.log('✅ No significant bloat detected');
    } else {
      console.log('Top 10 tables by bloat:\n');
      for (const table of significantBloat) {
        const bloatPercent = (table.bloat_ratio * 100).toFixed(1);
        const actualSize = formatBytes(table.actual_size_bytes);
        const bloatSize = formatBytes(table.bloat_bytes);
        
        console.log(`  📍 ${table.schemaname}.${table.tablename}`);
        console.log(`     Total size: ${actualSize}`);
        console.log(`     Bloat: ${bloatSize} (${bloatPercent}%)\n`);
      }
    }
    
    // Generate recommendations
    console.log('\n💡 Recommendations');
    console.log('-'.repeat(80));
    
    const vacuumRecs = analyzeVacuumNeeds(vacuumStats);
    const bloatRecs = analyzeBloat(bloatStats);
    const allRecs = [...vacuumRecs, ...bloatRecs];
    
    const critical = allRecs.filter(r => r.priority === 'critical');
    const high = allRecs.filter(r => r.priority === 'high');
    const medium = allRecs.filter(r => r.priority === 'medium');
    const low = allRecs.filter(r => r.priority === 'low');
    
    if (allRecs.length === 0) {
      console.log('✅ No action needed. Database is well-maintained.');
    } else {
      
      if (critical.length > 0) {
        console.log('\n🔴 Critical Priority:\n');
        for (const rec of critical) {
          console.log(`  📍 ${rec.table}`);
          console.log(`     ${rec.reason}`);
          console.log(`     ⚡ ${rec.action}\n`);
        }
      }
      
      if (high.length > 0) {
        console.log('\n🟠 High Priority:\n');
        for (const rec of high) {
          console.log(`  📍 ${rec.table}`);
          console.log(`     ${rec.reason}`);
          console.log(`     💡 ${rec.action}\n`);
        }
      }
      
      if (medium.length > 0) {
        console.log('\n🟡 Medium Priority:\n');
        for (const rec of medium) {
          console.log(`  📍 ${rec.table}`);
          console.log(`     ${rec.reason}`);
          console.log(`     💡 ${rec.action}\n`);
        }
      }
      
      if (low.length > 0) {
        console.log('\n🟢 Low Priority:\n');
        for (const rec of low) {
          console.log(`  📍 ${rec.table}`);
          console.log(`     ${rec.reason}`);
          console.log(`     💡 ${rec.action}\n`);
        }
      }
    }
    
    // Summary
    console.log('\n📈 Summary');
    console.log('-'.repeat(80));
    const totalTables = vacuumStats.length;
    const tablesWithDeadTuples = vacuumStats.filter(t => Number(t.n_dead_tup) > 0).length;
    const totalDeadTuples = vacuumStats.reduce((sum, t) => sum + Number(t.n_dead_tup), 0);
    const totalBloat = bloatStats.reduce((sum, t) => sum + Number(t.bloat_bytes), 0);
    
    console.log(`  Total tables: ${totalTables}`);
    console.log(`  Tables with dead tuples: ${tablesWithDeadTuples}`);
    console.log(`  Total dead tuples: ${totalDeadTuples.toLocaleString()}`);
    console.log(`  Estimated bloat: ${formatBytes(totalBloat)}`);
    console.log(`  Recommendations: ${allRecs.length}`);
    console.log(`    Critical: ${critical.length}`);
    console.log(`    High: ${high.length}`);
    console.log(`    Medium: ${medium.length}`);
    console.log(`    Low: ${low.length}`);
    
    console.log('\n✅ Analysis complete!\n');
    console.log('🔧 Common vacuum commands:');
    console.log('   VACUUM ANALYZE;                    -- Regular vacuum (non-blocking)');
    console.log('   VACUUM ANALYZE table_name;         -- Vacuum specific table');
    console.log('   VACUUM FULL table_name;            -- Full vacuum (requires lock)\n');
    
  } catch (error) {
    console.error('\n❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as analyzeVacuum };
