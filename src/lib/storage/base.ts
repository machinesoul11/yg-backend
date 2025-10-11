/**
 * Base Storage Provider Class
 * 
 * Abstract base class providing common functionality for all storage providers.
 * Implements validation, error handling, retry logic, progress tracking, and logging.
 */

import type { IStorageProvider } from './types'
import { StorageMonitoringService } from './monitoring'

/**
 * Storage operation configuration
 */
export interface StorageOperationConfig {
  maxRetries?: number
  retryDelayMs?: number
  maxRetryDelayMs?: number
  retryMultiplier?: number
  retryJitterMs?: number
  timeoutMs?: number
}

/**
 * Progress tracking callback
 */
export interface ProgressCallback {
  (progress: ProgressEvent): void
}

/**
 * Progress event structure
 */
export interface ProgressEvent {
  bytesTransferred: number
  totalBytes: number
  percentComplete: number
  estimatedTimeRemainingMs?: number
  transferSpeedBps?: number
  operation: 'upload' | 'download' | 'copy' | 'move'
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Storage operation context for logging and metrics
 */
export interface OperationContext {
  operationType: string
  key?: string
  startTime: number
  metadata?: Record<string, any>
}

/**
 * Storage error codes
 */
export enum StorageErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  DELETE_FAILED = 'DELETE_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  INSUFFICIENT_STORAGE = 'INSUFFICIENT_STORAGE',
  INVALID_KEY = 'INVALID_KEY',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
}

/**
 * Enhanced storage error class
 */
export class StorageError extends Error {
  constructor(
    public code: StorageErrorCode,
    message: string,
    public details?: {
      operation?: string
      key?: string
      provider?: string
      originalError?: Error
      context?: Record<string, any>
    }
  ) {
    super(message)
    this.name = 'StorageError'
    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Create storage error from unknown error
   */
  static fromError(
    error: unknown,
    context: {
      operation: string
      key?: string
      provider: string
    }
  ): StorageError {
    if (error instanceof StorageError) {
      return error
    }

    const originalError = error instanceof Error ? error : new Error(String(error))
    const message = originalError.message

    // Map common error patterns to storage error codes
    let code: StorageErrorCode = StorageErrorCode.NETWORK_ERROR

    if (message.includes('timeout') || message.includes('TIMEOUT')) {
      code = StorageErrorCode.TIMEOUT
    } else if (message.includes('not found') || message.includes('NoSuchKey')) {
      code = StorageErrorCode.NOT_FOUND
    } else if (message.includes('auth') || message.includes('Forbidden')) {
      code = StorageErrorCode.AUTHENTICATION_FAILED
    } else if (message.includes('rate limit') || message.includes('throttle')) {
      code = StorageErrorCode.RATE_LIMITED
    }

    return new StorageError(code, message, {
      ...context,
      originalError,
    })
  }
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
}

/**
 * Abstract base storage provider class
 */
export abstract class BaseStorageProvider implements IStorageProvider {
  protected monitoring: StorageMonitoringService
  protected config: Required<StorageOperationConfig>
  protected circuitBreakers: Map<string, CircuitBreakerState> = new Map()
  protected progressTrackers: Map<string, ProgressCallback> = new Map()
  protected progressLastUpdate: Map<string, number> = new Map()
  
  // Default configuration (can be overridden via env vars)
  private static readonly DEFAULT_CONFIG: Required<StorageOperationConfig> = {
    maxRetries: parseInt(process.env.STORAGE_MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.STORAGE_RETRY_DELAY_MS || '1000'),
    maxRetryDelayMs: parseInt(process.env.STORAGE_MAX_RETRY_DELAY_MS || '30000'),
    retryMultiplier: parseFloat(process.env.STORAGE_RETRY_MULTIPLIER || '2'),
    retryJitterMs: parseInt(process.env.STORAGE_RETRY_JITTER_MS || '100'),
    timeoutMs: parseInt(process.env.STORAGE_TIMEOUT_MS || '60000'),
  }

  // Validation configuration
  protected static readonly MAX_KEY_LENGTH = 1024
  protected static readonly FORBIDDEN_KEY_PATTERNS = [
    '..',
    '//',
    '\\',
    '\0',
    '\r',
    '\n',
  ]

  constructor(
    protected providerName: string,
    config?: Partial<StorageOperationConfig>
  ) {
    this.config = { ...BaseStorageProvider.DEFAULT_CONFIG, ...config }
    this.monitoring = new StorageMonitoringService()
  }

  /**
   * Validate storage key
   */
  protected validateKey(key: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Check if key is empty
    if (!key || key.trim().length === 0) {
      errors.push('Storage key cannot be empty')
    }

    // Check key length
    if (key.length > BaseStorageProvider.MAX_KEY_LENGTH) {
      errors.push(`Storage key too long (max ${BaseStorageProvider.MAX_KEY_LENGTH} characters)`)
    }

    // Check for forbidden patterns
    for (const pattern of BaseStorageProvider.FORBIDDEN_KEY_PATTERNS) {
      if (key.includes(pattern)) {
        errors.push(`Storage key cannot contain: ${pattern}`)
      }
    }

    // Check for leading/trailing slashes
    if (key.startsWith('/')) {
      warnings.push('Storage key should not start with /')
    }
    if (key.endsWith('/')) {
      warnings.push('Storage key should not end with /')
    }

    // Check for consecutive slashes
    if (key.includes('//')) {
      errors.push('Storage key cannot contain consecutive slashes')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Validate file content type
   */
  protected validateContentType(
    contentType: string,
    allowedTypes?: string[]
  ): ValidationResult {
    const errors: string[] = []

    if (!contentType || contentType.trim().length === 0) {
      errors.push('Content type is required')
      return { isValid: false, errors }
    }

    // Basic MIME type format validation
    const mimeTypeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/
    if (!mimeTypeRegex.test(contentType)) {
      errors.push('Invalid content type format')
    }

    // Check against allowed types if provided
    if (allowedTypes && allowedTypes.length > 0) {
      const isAllowed = allowedTypes.some(allowed => {
        // Support wildcard patterns like "image/*"
        if (allowed.endsWith('/*')) {
          const category = allowed.slice(0, -2)
          return contentType.startsWith(`${category  }/`)
        }
        return contentType === allowed
      })

      if (!isAllowed) {
        errors.push(`Content type ${contentType} is not allowed`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Validate file size
   */
  protected validateFileSize(
    size: number,
    maxSize?: number
  ): ValidationResult {
    const errors: string[] = []

    if (size < 0) {
      errors.push('File size cannot be negative')
    }

    if (size === 0) {
      errors.push('File cannot be empty')
    }

    if (maxSize && size > maxSize) {
      errors.push(`File too large (max ${this.formatBytes(maxSize)})`)
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Execute operation with retry logic and circuit breaker
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: OperationContext,
    config?: Partial<StorageOperationConfig>
  ): Promise<T> {
    const operationConfig = { ...this.config, ...config }
    const circuitBreakerKey = `${this.providerName}:${context.operationType}`

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(circuitBreakerKey)) {
      throw new StorageError(
        StorageErrorCode.CIRCUIT_BREAKER_OPEN,
        `Circuit breaker is open for ${context.operationType}`,
        {
          operation: context.operationType,
          key: context.key,
          provider: this.providerName,
        }
      )
    }

    let lastError: Error | undefined
    const startTime = Date.now()

    for (let attempt = 0; attempt <= operationConfig.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          this.createTimeoutPromise<T>(operationConfig.timeoutMs),
        ])

        // Reset circuit breaker on success
        this.resetCircuitBreaker(circuitBreakerKey)

        // Log successful operation
        const latency = Date.now() - startTime
        await this.logOperation(context, true, latency)

        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Update circuit breaker
        this.recordCircuitBreakerFailure(circuitBreakerKey)

        // Don't retry on validation errors or non-retryable errors
        if (!this.isRetryableError(lastError)) {
          break
        }

        // Don't retry on last attempt
        if (attempt === operationConfig.maxRetries) {
          break
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempt, operationConfig)
        await this.sleep(delay)
      }
    }

    // Log failed operation
    const latency = Date.now() - startTime
    await this.logOperation(context, false, latency, lastError)

    throw StorageError.fromError(lastError!, {
      operation: context.operationType,
      key: context.key,
      provider: this.providerName,
    })
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    
    // Don't retry validation errors
    if (error instanceof StorageError) {
      const nonRetryableCodes = [
        StorageErrorCode.VALIDATION_FAILED,
        StorageErrorCode.INVALID_KEY,
        StorageErrorCode.FILE_TOO_LARGE,
        StorageErrorCode.INVALID_FILE_TYPE,
        StorageErrorCode.AUTHENTICATION_FAILED,
      ]
      return !nonRetryableCodes.includes(error.code)
    }

    // Retry network errors, timeouts, and rate limits
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('throttle') ||
      message.includes('connection') ||
      message.includes('socket')
    )
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(
    attempt: number,
    config: Required<StorageOperationConfig>
  ): number {
    const exponentialDelay = Math.min(
      config.retryDelayMs * Math.pow(config.retryMultiplier, attempt),
      config.maxRetryDelayMs
    )

    // Add jitter to avoid thundering herd
    const jitter = Math.random() * config.retryJitterMs
    return exponentialDelay + jitter
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(key: string): boolean {
    const state = this.circuitBreakers.get(key)
    if (!state) return false

    if (state.state === 'open') {
      // Check if we should transition to half-open
      const timeSinceLastFailure = Date.now() - state.lastFailureTime
      if (timeSinceLastFailure > 60000) { // 1 minute cooldown
        state.state = 'half-open'
        return false
      }
      return true
    }

    return false
  }

  private recordCircuitBreakerFailure(key: string): void {
    const state = this.circuitBreakers.get(key) || {
      failures: 0,
      lastFailureTime: Date.now(),
      state: 'closed' as const,
    }

    state.failures++
    state.lastFailureTime = Date.now()

    // Open circuit breaker after 5 failures
    if (state.failures >= 5) {
      state.state = 'open'
    }

    this.circuitBreakers.set(key, state)
  }

  private resetCircuitBreaker(key: string): void {
    this.circuitBreakers.delete(key)
  }

  /**
   * Progress tracking
   */
  protected trackProgress(
    operationId: string,
    callback: ProgressCallback
  ): void {
    this.progressTrackers.set(operationId, callback)
    this.progressLastUpdate.set(operationId, 0)
  }

  protected updateProgress(
    operationId: string,
    progress: Omit<ProgressEvent, 'percentComplete'>,
    forceUpdate: boolean = false
  ): void {
    const callback = this.progressTrackers.get(operationId)
    if (!callback) return

    // Throttle progress updates (default 200ms between updates)
    const now = Date.now()
    const lastUpdate = this.progressLastUpdate.get(operationId) || 0
    const throttleMs = parseInt(process.env.STORAGE_PROGRESS_THROTTLE_MS || '200')
    
    if (!forceUpdate && now - lastUpdate < throttleMs) {
      return
    }

    this.progressLastUpdate.set(operationId, now)

    const percentComplete = progress.totalBytes > 0 
      ? (progress.bytesTransferred / progress.totalBytes) * 100 
      : 0

    callback({
      ...progress,
      percentComplete,
    })
  }

  protected finishProgress(operationId: string): void {
    this.progressTrackers.delete(operationId)
    this.progressLastUpdate.delete(operationId)
  }

  /**
   * Logging and metrics
   */
  private async logOperation(
    context: OperationContext,
    success: boolean,
    latency: number,
    error?: Error
  ): Promise<void> {
    try {
      // Determine operation type for monitoring
      let operation: 'upload' | 'download' | 'delete' = 'upload'
      if (context.operationType.includes('download') || context.operationType.includes('get')) {
        operation = 'download'
      } else if (context.operationType.includes('delete')) {
        operation = 'delete'
      }

      await this.monitoring.logOperation({
        operation,
        success,
        fileSize: context.metadata?.fileSize || 0,
        latency,
        error: error?.message,
      })
    } catch (logError) {
      // Don't throw on logging errors, just log to console
      console.error('Failed to log storage operation:', logError)
    }
  }

  /**
   * Utility methods
   */
  private async createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new StorageError(
          StorageErrorCode.TIMEOUT,
          `Operation timed out after ${timeoutMs}ms`
        ))
      }, timeoutMs)
    })
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Abstract methods that must be implemented by concrete providers
   */
  abstract upload(params: {
    key: string
    file: Buffer | ReadableStream
    contentType: string
    metadata?: Record<string, string>
    progressCallback?: ProgressCallback
  }): Promise<{ key: string; url: string; size: number }>

  abstract getUploadUrl(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
  }): Promise<{ uploadUrl: string; key: string }>

  abstract getPresignedPost(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
    conditions?: Array<any>
  }): Promise<{
    url: string
    fields: Record<string, string>
  }>

  abstract getDownloadUrl(params: {
    key: string
    expiresIn?: number
    filename?: string
  }): Promise<{ url: string; expiresAt: Date }>

  abstract delete(key: string): Promise<void>

  abstract deleteBatch(keys: string[]): Promise<{ deleted: string[]; failed: string[] }>

  abstract exists(key: string): Promise<boolean>

  abstract getMetadata(key: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
  }>

  abstract list(params: {
    prefix?: string
    maxResults?: number
    continuationToken?: string
  }): Promise<{
    items: Array<{ key: string; size: number; lastModified: Date }>
    continuationToken?: string
  }>

  abstract copy(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }>

  abstract move(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }>
}
