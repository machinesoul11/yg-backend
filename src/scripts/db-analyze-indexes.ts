#!/usr/bin/env tsx

/**
 * Database Index Analysis Tool
 * 
 * Analyzes index usage, identifies unused indexes, and suggests missing indexes
 * based on query patterns and table statistics.
 */

import { prisma } from '@/lib/db';

interface IndexStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: bigint;
  idx_tup_read: bigint;
  idx_tup_fetch: bigint;
  size_bytes: bigint;
}

interface TableStats {
  schemaname: string;
  tablename: string;
  seq_scan: bigint;
  seq_tup_read: bigint;
  idx_scan: bigint;
  idx_tup_fetch: bigint;
  n_tup_ins: bigint;
  n_tup_upd: bigint;
  n_tup_del: bigint;
  n_live_tup: bigint;
  n_dead_tup: bigint;
}

interface MissingIndexSuggestion {
  table: string;
  reason: string;
  suggestion: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * Get index usage statistics
 */
async function getIndexStats(): Promise<IndexStats[]> {
  const results = await prisma.$queryRaw<IndexStats[]>`
    SELECT 
      schemaname,
      tablename,
      indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_relation_size(indexrelid) as size_bytes
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
  `;
  return results;
}

/**
 * Get table statistics
 */
async function getTableStats(): Promise<TableStats[]> {
  const results = await prisma.$queryRaw<TableStats[]>`
    SELECT 
      schemaname,
      tablename,
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch,
      n_tup_ins,
      n_tup_upd,
      n_tup_del,
      n_live_tup,
      n_dead_tup
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY seq_scan DESC
  `;
  return results;
}

/**
 * Analyze unused indexes
 */
function analyzeUnusedIndexes(stats: IndexStats[]): IndexStats[] {
  return stats.filter(idx => {
    // Filter out primary keys and unique constraints
    if (idx.indexname.includes('_pkey') || idx.indexname.includes('_key')) {
      return false;
    }
    
    // Index has never been scanned
    return Number(idx.idx_scan) === 0;
  });
}

/**
 * Analyze low-use indexes
 */
function analyzeLowUseIndexes(stats: IndexStats[]): Array<IndexStats & { size_mb: number }> {
  return stats
    .filter(idx => {
      // Filter out primary keys
      if (idx.indexname.includes('_pkey') || idx.indexname.includes('_key')) {
        return false;
      }
      
      const scans = Number(idx.idx_scan);
      const sizeBytes = Number(idx.size_bytes);
      
      // Large index with few scans
      return scans > 0 && scans < 100 && sizeBytes > 1024 * 1024; // > 1MB
    })
    .map(idx => ({
      ...idx,
      size_mb: Number(idx.size_bytes) / (1024 * 1024),
    }))
    .sort((a, b) => b.size_mb - a.size_mb);
}

/**
 * Suggest missing indexes based on table scan patterns
 */
function suggestMissingIndexes(tableStats: TableStats[]): MissingIndexSuggestion[] {
  const suggestions: MissingIndexSuggestion[] = [];
  
  for (const table of tableStats) {
    const seqScans = Number(table.seq_scan);
    const seqTupRead = Number(table.seq_tup_read);
    const idxScans = Number(table.idx_scan);
    const liveRows = Number(table.n_live_tup);
    
    // Skip small tables
    if (liveRows < 1000) continue;
    
    // High number of sequential scans
    if (seqScans > 100 && seqScans > idxScans) {
      const avgRowsPerScan = seqScans > 0 ? seqTupRead / seqScans : 0;
      
      if (avgRowsPerScan > 100) {
        suggestions.push({
          table: `${table.schemaname}.${table.tablename}`,
          reason: `High sequential scans (${seqScans}) reading many rows (avg ${Math.round(avgRowsPerScan)}/scan)`,
          suggestion: 'Add indexes on frequently filtered columns. Review queries with EXPLAIN ANALYZE.',
          impact: 'high',
        });
      } else if (avgRowsPerScan > 10) {
        suggestions.push({
          table: `${table.schemaname}.${table.tablename}`,
          reason: `Moderate sequential scans (${seqScans}) with selective filtering`,
          suggestion: 'Consider adding indexes on WHERE clause columns.',
          impact: 'medium',
        });
      }
    }
    
    // High write activity without corresponding index usage
    const writes = Number(table.n_tup_ins) + Number(table.n_tup_upd) + Number(table.n_tup_del);
    if (writes > 1000 && idxScans === 0) {
      suggestions.push({
        table: `${table.schemaname}.${table.tablename}`,
        reason: `High write activity (${writes} operations) but no index scans`,
        suggestion: 'Review if indexes are needed for read queries. May indicate write-only table.',
        impact: 'low',
      });
    }
    
    // High dead tuple count
    const deadTuples = Number(table.n_dead_tup);
    const deadRatio = liveRows > 0 ? deadTuples / liveRows : 0;
    if (deadRatio > 0.2) {
      suggestions.push({
        table: `${table.schemaname}.${table.tablename}`,
        reason: `High dead tuple ratio (${(deadRatio * 100).toFixed(1)}%)`,
        suggestion: 'Check autovacuum settings. Table may need more frequent vacuuming.',
        impact: 'medium',
      });
    }
  }
  
  return suggestions;
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
 * Main analysis function
 */
async function main() {
  console.log('🔍 Database Index Analysis Tool\n');
  console.log('=' .repeat(80));
  
  try {
    // Get statistics
    console.log('\n📊 Collecting statistics...');
    const indexStats = await getIndexStats();
    const tableStats = await getTableStats();
    
    // Analyze unused indexes
    console.log('\n❌ Unused Indexes');
    console.log('-'.repeat(80));
    const unusedIndexes = analyzeUnusedIndexes(indexStats);
    
    if (unusedIndexes.length === 0) {
      console.log('✅ No unused indexes found');
    } else {
      console.log(`Found ${unusedIndexes.length} unused indexes:\n`);
      for (const idx of unusedIndexes) {
        console.log(`  📍 ${idx.schemaname}.${idx.tablename}.${idx.indexname}`);
        console.log(`     Size: ${formatBytes(idx.size_bytes)}`);
        console.log(`     Scans: ${idx.idx_scan}`);
        console.log(`     ⚠️  Consider dropping if not needed for constraints\n`);
      }
      
      const totalWaste = unusedIndexes.reduce((sum, idx) => sum + Number(idx.size_bytes), 0);
      console.log(`  💾 Total wasted space: ${formatBytes(totalWaste)}\n`);
    }
    
    // Analyze low-use indexes
    console.log('\n⚠️  Low-Use Indexes (large but rarely scanned)');
    console.log('-'.repeat(80));
    const lowUseIndexes = analyzeLowUseIndexes(indexStats);
    
    if (lowUseIndexes.length === 0) {
      console.log('✅ No low-use indexes found');
    } else {
      console.log(`Found ${lowUseIndexes.length} low-use indexes:\n`);
      for (const idx of lowUseIndexes.slice(0, 10)) {
        console.log(`  📍 ${idx.schemaname}.${idx.tablename}.${idx.indexname}`);
        console.log(`     Size: ${idx.size_mb.toFixed(2)} MB`);
        console.log(`     Scans: ${idx.idx_scan}`);
        console.log(`     ⚠️  Review if index is still needed\n`);
      }
    }
    
    // Suggest missing indexes
    console.log('\n💡 Missing Index Suggestions');
    console.log('-'.repeat(80));
    const suggestions = suggestMissingIndexes(tableStats);
    
    if (suggestions.length === 0) {
      console.log('✅ No obvious missing indexes detected');
    } else {
      // Group by impact
      const highImpact = suggestions.filter(s => s.impact === 'high');
      const mediumImpact = suggestions.filter(s => s.impact === 'medium');
      const lowImpact = suggestions.filter(s => s.impact === 'low');
      
      if (highImpact.length > 0) {
        console.log('\n🔴 High Priority:\n');
        for (const suggestion of highImpact) {
          console.log(`  📍 ${suggestion.table}`);
          console.log(`     ${suggestion.reason}`);
          console.log(`     💡 ${suggestion.suggestion}\n`);
        }
      }
      
      if (mediumImpact.length > 0) {
        console.log('\n🟡 Medium Priority:\n');
        for (const suggestion of mediumImpact) {
          console.log(`  📍 ${suggestion.table}`);
          console.log(`     ${suggestion.reason}`);
          console.log(`     💡 ${suggestion.suggestion}\n`);
        }
      }
      
      if (lowImpact.length > 0) {
        console.log('\n🟢 Low Priority:\n');
        for (const suggestion of lowImpact) {
          console.log(`  📍 ${suggestion.table}`);
          console.log(`     ${suggestion.reason}`);
          console.log(`     💡 ${suggestion.suggestion}\n`);
        }
      }
    }
    
    // Summary statistics
    console.log('\n📈 Summary');
    console.log('-'.repeat(80));
    const totalIndexes = indexStats.length;
    const usedIndexes = indexStats.filter(idx => Number(idx.idx_scan) > 0).length;
    const totalIndexSize = indexStats.reduce((sum, idx) => sum + Number(idx.size_bytes), 0);
    
    console.log(`  Total indexes: ${totalIndexes}`);
    console.log(`  Used indexes: ${usedIndexes} (${((usedIndexes / totalIndexes) * 100).toFixed(1)}%)`);
    console.log(`  Unused indexes: ${unusedIndexes.length}`);
    console.log(`  Total index size: ${formatBytes(totalIndexSize)}`);
    console.log(`  Tables analyzed: ${tableStats.length}`);
    console.log(`  Suggestions: ${suggestions.length}`);
    
    console.log('\n✅ Analysis complete!\n');
    console.log('📚 For detailed query analysis, use: EXPLAIN ANALYZE <query>');
    console.log('🔧 To drop an unused index: DROP INDEX CONCURRENTLY <index_name>;\n');
    
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

export { main as analyzeIndexes };
