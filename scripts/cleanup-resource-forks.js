#!/usr/bin/env node

/**
 * Resource Fork Cleanup Script for yg-backend
 * ULTRA-AGGRESSIVE: Deletes ._ files immediately upon detection
 * Multiple scanning strategies running simultaneously
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ResourceForkCleaner {
  constructor(watchDir = process.cwd()) {
    this.watchDir = watchDir;
    this.isRunning = false;
    
    // Directories to never touch
    this.excludeDirs = new Set([
      'node_modules',
      '.git',
      '.next',
      'dist',
      'build',
      'coverage'
    ]);

    // NO DEBOUNCING - delete immediately
    this.deletionQueue = new Set();
    this.activeWatchers = [];
    this.totalDeleted = 0;
  }

  /**
   * Check if a file is a resource fork (._ file)
   */
  isResourceFork(filename) {
    return filename.startsWith('._');
  }

  /**
   * Check if directory should be excluded
   */
  shouldExcludeDir(dirPath) {
    const parts = dirPath.split(path.sep);
    return parts.some(part => this.excludeDirs.has(part));
  }

  /**
   * Delete a resource fork file IMMEDIATELY - NO DELAYS
   */
  async deleteResourceFork(filePath) {
    const relativePath = path.relative(this.watchDir, filePath);
    
    // Prevent duplicate simultaneous deletions
    if (this.deletionQueue.has(filePath)) {
      return false;
    }
    
    this.deletionQueue.add(filePath);

    try {
      // Delete immediately - don't even check if it's a file first
      await fs.promises.unlink(filePath);
      this.totalDeleted++;
      console.log(`🗑️  DELETED [${this.totalDeleted}]: ${relativePath}`);
      
      // Remove from queue after a tiny delay
      setTimeout(() => this.deletionQueue.delete(filePath), 100);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EPERM') {
        // File already gone or permission issue - ignore
        this.deletionQueue.delete(filePath);
        return true;
      }
      console.error(`❌ Failed to delete ${relativePath}:`, error.message);
      this.deletionQueue.delete(filePath);
      return false;
    }
  }

  /**
   * Force delete using shell command (fallback)
   */
  async forceDeleteResourceFork(filePath) {
    try {
      await execAsync(`rm -f "${filePath}"`);
      const relativePath = path.relative(this.watchDir, filePath);
      this.totalDeleted++;
      console.log(`🗑️  FORCE DELETED [${this.totalDeleted}]: ${relativePath}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Recursively scan directory for ._ files
   */
  async scanAndClean(dir) {
    if (this.shouldExcludeDir(dir)) {
      return 0;
    }

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      let cleanedCount = 0;
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          cleanedCount += await this.scanAndClean(fullPath);
        } else if (this.isResourceFork(entry.name)) {
          const success = await this.deleteResourceFork(fullPath);
          if (success) cleanedCount++;
        }
      }
      
      return cleanedCount;
    } catch (error) {
      // Silently ignore permission errors
      if (error.code !== 'EACCES' && error.code !== 'ENOENT' && error.code !== 'EPERM') {
        console.error(`Error scanning ${dir}:`, error.message);
      }
      return 0;
    }
  }

  /**
   * CONTINUOUS aggressive scan - runs every 1 second
   */
  async continuousScan() {
    if (!this.isRunning) return;
    
    try {
      const excludePatterns = Array.from(this.excludeDirs)
        .map(dir => `-not -path "*/${dir}/*"`)
        .join(' ');
      
      const { stdout } = await execAsync(
        `find "${this.watchDir}" -name "._*" -type f ${excludePatterns} 2>/dev/null || true`,
        { maxBuffer: 1024 * 1024 }
      );
      
      const resourceForks = stdout.trim().split('\n').filter(Boolean);
      
      if (resourceForks.length > 0) {
        console.log(`🚨 Continuous scan found ${resourceForks.length} resource fork file${resourceForks.length === 1 ? '' : 's'} - DELETING NOW`);
        
        // Delete all simultaneously
        await Promise.all(resourceForks.map(filePath => this.deleteResourceFork(filePath)));
      }
    } catch (error) {
      // Silently continue
    }
    
    // Run again in 1 second
    setTimeout(() => this.continuousScan(), 1000);
  }

  /**
   * HYPER-AGGRESSIVE find + delete loop - runs every 300ms
   */
  async hyperAggressiveScan() {
    if (!this.isRunning) return;
    
    try {
      // Use find with -delete for instant removal
      const excludePatterns = Array.from(this.excludeDirs)
        .map(dir => `-not -path "*/${dir}/*"`)
        .join(' ');
      
      const { stdout } = await execAsync(
        `find "${this.watchDir}" -name "._*" -type f ${excludePatterns} -print -delete 2>/dev/null || true`,
        { maxBuffer: 1024 * 1024 }
      );
      
      const deleted = stdout.trim().split('\n').filter(Boolean);
      if (deleted.length > 0) {
        deleted.forEach(filePath => {
          const relativePath = path.relative(this.watchDir, filePath);
          this.totalDeleted++;
          console.log(`⚡ HYPER-SCAN DELETED [${this.totalDeleted}]: ${relativePath}`);
        });
      }
    } catch (error) {
      // Silently continue
    }
    
    // Run again in 300ms for maximum aggression
    setTimeout(() => this.hyperAggressiveScan(), 300);
  }

  /**
   * Initial cleanup - INSTANT
   */
  async initialCleanup() {
    console.log('🧹 Performing AGGRESSIVE initial cleanup...');
    
    try {
      const excludePatterns = Array.from(this.excludeDirs)
        .map(dir => `-not -path "*/${dir}/*"`)
        .join(' ');
      
      const { stdout } = await execAsync(
        `find "${this.watchDir}" -name "._*" -type f ${excludePatterns} -print -delete 2>/dev/null || true`,
        { maxBuffer: 1024 * 1024 }
      );
      
      const deleted = stdout.trim().split('\n').filter(Boolean);
      
      if (deleted.length > 0) {
        this.totalDeleted = deleted.length;
        console.log(`✅ Deleted ${deleted.length} resource fork file${deleted.length === 1 ? '' : 's'}\n`);
        deleted.forEach(filePath => {
          const relativePath = path.relative(this.watchDir, filePath);
          console.log(`   🗑️  ${relativePath}`);
        });
        console.log('');
      } else {
        console.log('✅ No resource fork files found\n');
      }
      
      return deleted.length;
    } catch (error) {
      console.error('Error during initial cleanup:', error.message);
      return 0;
    }
  }

  /**
   * Start macOS watcher using fswatch - ZERO LATENCY
   */
  async startMacOSWatcher() {
    return new Promise((resolve, reject) => {
      const excludeArgs = Array.from(this.excludeDirs)
        .flatMap(dir => ['--exclude', dir]);
      
      // ZERO latency - instant detection and deletion
      const fswatch = spawn('fswatch', [
        '-r',                    // recursive
        '--event', 'Created',
        '--event', 'Renamed', 
        '--event', 'MovedTo',
        '--event', 'Updated',    // catch any updates too
        '--latency', '0.01',     // 10ms - effectively instant
        ...excludeArgs,
        this.watchDir
      ]);

      fswatch.stdout.on('data', (data) => {
        const files = data.toString().trim().split('\n').filter(Boolean);
        
        // Process all files immediately in parallel
        files.forEach((filePath) => {
          const filename = path.basename(filePath);
          if (this.isResourceFork(filename)) {
            // INSTANT deletion - don't await, fire and forget
            this.deleteResourceFork(filePath).catch(() => {
              // If normal delete fails, force it
              this.forceDeleteResourceFork(filePath);
            });
          }
        });
      });

      fswatch.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        if (!errorMsg.includes('No such file') && !errorMsg.includes('Permission denied')) {
          console.error('fswatch error:', errorMsg);
        }
      });

      fswatch.on('error', (error) => {
        reject(error);
      });

      fswatch.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`fswatch exited with code ${code}`));
        }
      });

      this.activeWatchers.push(fswatch);
      console.log('👀 Started fswatch with 10ms latency (ULTRA-AGGRESSIVE)');
      resolve(fswatch);
    });
  }

  /**
   * Fallback watcher using Node.js fs.watch - AGGRESSIVE MODE
   */
  async startFallbackWatcher() {
    console.log('👀 Starting AGGRESSIVE fallback watcher...');
    console.log('💡 Install fswatch for better performance: brew install fswatch\n');
    
    const watchRecursive = async (dir) => {
      if (this.shouldExcludeDir(dir)) {
        return;
      }

      try {
        const watcher = fs.watch(dir, { recursive: false }, async (eventType, filename) => {
          if (filename && this.isResourceFork(filename)) {
            const filePath = path.join(dir, filename);
            // INSTANT deletion
            this.deleteResourceFork(filePath).catch(() => {
              this.forceDeleteResourceFork(filePath);
            });
          }
        });
        
        this.activeWatchers.push(watcher);

        // Watch subdirectories
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);
            if (!this.shouldExcludeDir(fullPath)) {
              await watchRecursive(fullPath);
            }
          }
        }
      } catch (error) {
        if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
          console.error(`Error watching ${dir}:`, error.message);
        }
      }
    };

    await watchRecursive(this.watchDir);
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
🧹 yg-backend Resource Fork Cleaner - ULTRA-AGGRESSIVE MODE

Automatically removes macOS ._ resource fork files INSTANTLY.

Usage:
  node scripts/cleanup-resource-forks.js [options]

Options:
  --help, -h       Show this help message
  --clean-only     Run cleanup once and exit (don't watch)
  --no-watch       Same as --clean-only
  --watch          Run in watch mode (default)

Default behavior: 
  Runs initial cleanup, then activates 3 simultaneous monitoring layers:
  1. fswatch with 10ms latency (instant detection)
  2. Continuous find scan every 1 second
  3. Hyper-aggressive find+delete every 300ms

Files are deleted IMMEDIATELY upon detection with NO delays.

What are resource forks?
  macOS creates ._ files (resource forks) when copying files to non-HFS+
  filesystems. These files are metadata containers and are not needed in
  version control or development environments.

Excluded directories:
  • node_modules (never touched)
  • .git (never touched)
  • .next (never touched)
  • dist (never touched)
  • build (never touched)
  • coverage (never touched)

Performance:
  This script is optimized for the yg-backend project and runs constantly
  with multiple aggressive scanning strategies for instant deletion.
    `);
  }

  /**
   * Start the cleaner with MAXIMUM AGGRESSION
   */
  async start(options = {}) {
    if (options.help) {
      this.showHelp();
      return;
    }

    if (this.isRunning) {
      console.log('Resource fork cleaner is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 yg-backend Resource Fork Cleaner - ULTRA-AGGRESSIVE MODE');
    console.log(`📁 Monitoring: ${this.watchDir}\n`);
    
    // Initial cleanup with instant deletion
    await this.initialCleanup();

    if (options.cleanOnly) {
      console.log('✅ Cleanup completed');
      return;
    }

    // Start ALL monitoring strategies simultaneously
    console.log('🎯 Starting MULTI-LAYER AGGRESSIVE MONITORING...\n');
    
    // Layer 1: fswatch with 10ms latency (if available on macOS)
    if (process.platform === 'darwin') {
      try {
        await execAsync('which fswatch');
        await this.startMacOSWatcher();
      } catch (error) {
        await this.startFallbackWatcher();
      }
    } else {
      await this.startFallbackWatcher();
    }

    // Layer 2: Continuous scan every 1 second
    console.log('🔄 Starting continuous scan (1 second interval)');
    this.continuousScan();

    // Layer 3: Hyper-aggressive scan every 300ms with instant deletion
    console.log('⚡ Starting hyper-aggressive scan (300ms interval)');
    this.hyperAggressiveScan();

    console.log('\n✨ ULTRA-AGGRESSIVE MODE ACTIVE');
    console.log('   🎯 3 monitoring layers running simultaneously:');
    console.log('      1. fswatch with 10ms latency');
    console.log('      2. Continuous find scan (1s)');
    console.log('      3. Hyper-aggressive find+delete (300ms)');
    console.log('   🗑️  Files deleted INSTANTLY upon detection');
    console.log('   Press Ctrl+C to stop\n');
  }

  /**
   * Stop the cleaner
   */
  stop() {
    this.isRunning = false;
    
    // Kill all active watchers
    this.activeWatchers.forEach(watcher => {
      try {
        if (watcher.kill) {
          watcher.kill();
        } else if (watcher.close) {
          watcher.close();
        }
      } catch (error) {
        // Ignore errors during shutdown
      }
    });
    
    console.log(`\n🛑 Resource fork cleaner stopped (Total deleted: ${this.totalDeleted})`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    help: args.includes('--help') || args.includes('-h'),
    cleanOnly: args.includes('--clean-only') || args.includes('--no-watch'),
    watch: args.includes('--watch') || (!args.includes('--clean-only') && !args.includes('--no-watch'))
  };

  // Default to watch mode
  if (!options.cleanOnly && !options.help) {
    options.watch = true;
  }

  const cleaner = new ResourceForkCleaner();

  // Graceful shutdown
  process.on('SIGINT', () => {
    cleaner.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleaner.stop();
    process.exit(0);
  });

  // Handle errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Error:', error.message);
    cleaner.stop();
    process.exit(1);
  });

  // Start the cleaner
  cleaner.start(options).catch((error) => {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  });
}

module.exports = ResourceForkCleaner;
