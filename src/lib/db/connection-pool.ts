/**
 * Database Connection Pool Configuration
 * 
 * Configures PgBouncer-compatible connection pooling for optimal
 * database performance and resource utilization.
 */

export const CONNECTION_POOL_CONFIG = {
  /**
   * Connection pool mode
   * 
   * - session: Connection is assigned for the entire session (safest, lowest performance)
   * - transaction: Connection is assigned per transaction (balanced)
   * - statement: Connection is assigned per statement (highest performance, but limited compatibility)
   * 
   * For Supabase with PgBouncer, use 'transaction' mode
   */
  poolMode: process.env.DB_POOL_MODE || 'transaction',

  /**
   * Maximum number of connections in the pool
   * 
   * Supabase free tier: ~15 connections
   * Supabase paid tier: 50-200+ connections depending on plan
   */
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),

  /**
   * Minimum number of connections to maintain
   */
  minConnections: parseInt(process.env.DB_MIN_CONNECTIONS || '2', 10),

  /**
   * Connection timeout in seconds
   */
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '20', 10),

  /**
   * Idle timeout in seconds (close connections idle for this long)
   */
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30', 10),

  /**
   * Statement timeout in milliseconds (cancel queries taking longer than this)
   */
  statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '60000', 10),
} as const;

/**
 * Build database URL with connection pool parameters
 */
export function buildDatabaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const url = new URL(baseUrl);

  // Add PgBouncer parameters
  const params = new URLSearchParams(url.search);
  
  // Connection pool settings
  params.set('pgbouncer', 'true');
  params.set('connection_limit', CONNECTION_POOL_CONFIG.maxConnections.toString());
  params.set('pool_timeout', CONNECTION_POOL_CONFIG.connectionTimeout.toString());
  
  // Performance tuning
  params.set('statement_cache_size', '100');
  params.set('prepared_statements', 'false'); // Required for PgBouncer transaction mode
  
  // Reconnection settings
  params.set('connect_timeout', '15');

  url.search = params.toString();
  
  return url.toString();
}

/**
 * Validate connection pool configuration
 */
export function validatePoolConfig(): void {
  const { maxConnections, minConnections, connectionTimeout, idleTimeout } = CONNECTION_POOL_CONFIG;

  if (minConnections > maxConnections) {
    throw new Error('DB_MIN_CONNECTIONS cannot be greater than DB_MAX_CONNECTIONS');
  }

  if (connectionTimeout < 5) {
    console.warn('DB_CONNECTION_TIMEOUT is very low, may cause connection failures');
  }

  if (idleTimeout < 10) {
    console.warn('DB_IDLE_TIMEOUT is very low, may cause excessive connection churn');
  }

  console.log('Database connection pool configuration validated:', CONNECTION_POOL_CONFIG);
}
