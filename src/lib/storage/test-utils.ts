/**
 * Storage Test Utilities
 * 
 * Comprehensive test utilities for testing storage implementations and consumer code
 */

import { BaseStorageProvider, StorageError, StorageErrorCode, ProgressEvent, ProgressCallback } from './base'
import type { IStorageProvider } from './types'

/**
 * Mock storage provider for testing
 */
export class MockStorageProvider extends BaseStorageProvider {
  private storage: Map<string, {
    content: Buffer
    contentType: string
    metadata: Record<string, string>
    size: number
    lastModified: Date
    etag: string
  }> = new Map()

  private shouldFail: boolean = false
  private failureMode: 'network' | 'auth' | 'validation' | 'timeout' = 'network'
  private failureCount: number = 0
  private currentFailures: number = 0
  private latencyMs: number = 0

  constructor() {
    super('mock')
  }

  /**
   * Test configuration methods
   */
  setFailureMode(mode: 'network' | 'auth' | 'validation' | 'timeout', count: number = 1): void {
    this.shouldFail = true
    this.failureMode = mode
    this.failureCount = count
    this.currentFailures = 0
  }

  setLatency(ms: number): void {
    this.latencyMs = ms
  }

  clearFailures(): void {
    this.shouldFail = false
    this.currentFailures = 0
  }

  getStorageContents(): Map<string, any> {
    return new Map(this.storage)
  }

  clearStorage(): void {
    this.storage.clear()
  }

  /**
   * Helper to simulate delays
   */
  private async simulateDelay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs))
    }
  }

  /**
   * Helper to simulate failures
   */
  private checkForFailure(): void {
    if (this.shouldFail && this.currentFailures < this.failureCount) {
      this.currentFailures++
      
      switch (this.failureMode) {
        case 'network':
          throw new Error('Network connection failed')
        case 'auth':
          throw new StorageError(StorageErrorCode.AUTHENTICATION_FAILED, 'Authentication failed')
        case 'validation':
          throw new StorageError(StorageErrorCode.VALIDATION_FAILED, 'Validation failed')
        case 'timeout':
          throw new StorageError(StorageErrorCode.TIMEOUT, 'Operation timed out')
      }
    }
  }

  /**
   * IStorageProvider implementation
   */
  async upload(params: {
    key: string
    file: Buffer | ReadableStream
    contentType: string
    metadata?: Record<string, string>
    progressCallback?: ProgressCallback
  }): Promise<{ key: string; url: string; size: number }> {
    await this.simulateDelay()
    this.checkForFailure()

    // Validate key
    const keyValidation = this.validateKey(params.key)
    if (!keyValidation.isValid) {
      throw new StorageError(
        StorageErrorCode.INVALID_KEY,
        keyValidation.errors.join(', ')
      )
    }

    // Convert stream to buffer if needed
    let content: Buffer
    if (params.file instanceof Buffer) {
      content = params.file
    } else {
      // For testing, we'll simulate reading a stream
      content = Buffer.from('mock-stream-content')
    }

    // Simulate progress updates
    if (params.progressCallback) {
      const totalBytes = content.length
      for (let i = 0; i <= totalBytes; i += Math.max(1, Math.floor(totalBytes / 10))) {
        params.progressCallback({
          bytesTransferred: Math.min(i, totalBytes),
          totalBytes,
          percentComplete: (Math.min(i, totalBytes) / totalBytes) * 100,
          operation: 'upload',
        })
        await new Promise(resolve => setTimeout(resolve, 10)) // Small delay to simulate progress
      }
    }

    const etag = `"${Date.now()}-${Math.random()}"`
    const lastModified = new Date()

    this.storage.set(params.key, {
      content,
      contentType: params.contentType,
      metadata: params.metadata || {},
      size: content.length,
      lastModified,
      etag,
    })

    return {
      key: params.key,
      url: `https://mock-storage.example.com/${params.key}`,
      size: content.length,
    }
  }

  async getUploadUrl(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
  }): Promise<{ uploadUrl: string; key: string }> {
    await this.simulateDelay()
    this.checkForFailure()

    const keyValidation = this.validateKey(params.key)
    if (!keyValidation.isValid) {
      throw new StorageError(
        StorageErrorCode.INVALID_KEY,
        keyValidation.errors.join(', ')
      )
    }

    return {
      uploadUrl: `https://mock-storage.example.com/upload/${params.key}?expires=${Date.now() + (params.expiresIn || 900) * 1000}`,
      key: params.key,
    }
  }

  async getPresignedPost(params: {
    key: string
    contentType: string
    expiresIn?: number
    maxSizeBytes?: number
    conditions?: Array<any>
  }): Promise<{
    url: string
    fields: Record<string, string>
  }> {
    await this.simulateDelay()
    this.checkForFailure()

    const keyValidation = this.validateKey(params.key)
    if (!keyValidation.isValid) {
      throw new StorageError(
        StorageErrorCode.INVALID_KEY,
        keyValidation.errors.join(', ')
      )
    }

    const expiresAt = Date.now() + (params.expiresIn || 900) * 1000

    return {
      url: `https://mock-storage.example.com/upload`,
      fields: {
        key: params.key,
        'Content-Type': params.contentType,
        policy: Buffer.from(JSON.stringify({
          expiration: new Date(expiresAt).toISOString(),
          conditions: params.conditions || [],
        })).toString('base64'),
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
        'x-amz-credential': 'mock-credential',
        'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
        'x-amz-signature': 'mock-signature',
      },
    }
  }

  async getDownloadUrl(params: {
    key: string
    expiresIn?: number
    filename?: string
  }): Promise<{ url: string; expiresAt: Date }> {
    await this.simulateDelay()
    this.checkForFailure()

    if (!this.storage.has(params.key)) {
      throw new StorageError(StorageErrorCode.NOT_FOUND, `Key not found: ${params.key}`)
    }

    const expiresIn = params.expiresIn || 900
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return {
      url: `https://mock-storage.example.com/download/${params.key}?expires=${expiresAt.getTime()}`,
      expiresAt,
    }
  }

  async delete(key: string): Promise<void> {
    await this.simulateDelay()
    this.checkForFailure()

    if (!this.storage.has(key)) {
      throw new StorageError(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`)
    }

    this.storage.delete(key)
  }

  async deleteBatch(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    await this.simulateDelay()
    this.checkForFailure()

    const deleted: string[] = []
    const failed: string[] = []

    for (const key of keys) {
      if (this.storage.has(key)) {
        this.storage.delete(key)
        deleted.push(key)
      } else {
        failed.push(key)
      }
    }

    return { deleted, failed }
  }

  async exists(key: string): Promise<boolean> {
    await this.simulateDelay()
    this.checkForFailure()

    return this.storage.has(key)
  }

  async getMetadata(key: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
  }> {
    await this.simulateDelay()
    this.checkForFailure()

    const item = this.storage.get(key)
    if (!item) {
      throw new StorageError(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`)
    }

    return {
      size: item.size,
      contentType: item.contentType,
      lastModified: item.lastModified,
      etag: item.etag,
    }
  }

  async list(params: {
    prefix?: string
    maxResults?: number
    continuationToken?: string
  }): Promise<{
    items: Array<{ key: string; size: number; lastModified: Date }>
    continuationToken?: string
  }> {
    await this.simulateDelay()
    this.checkForFailure()

    let keys = Array.from(this.storage.keys())

    if (params.prefix) {
      keys = keys.filter(key => key.startsWith(params.prefix!))
    }

    // Simple pagination simulation
    const startIndex = params.continuationToken ? parseInt(params.continuationToken) : 0
    const maxResults = params.maxResults || 1000
    const endIndex = startIndex + maxResults

    const paginatedKeys = keys.slice(startIndex, endIndex)
    const items = paginatedKeys.map(key => {
      const item = this.storage.get(key)!
      return {
        key,
        size: item.size,
        lastModified: item.lastModified,
      }
    })

    return {
      items,
      continuationToken: endIndex < keys.length ? endIndex.toString() : undefined,
    }
  }

  async copy(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    await this.simulateDelay()
    this.checkForFailure()

    const sourceItem = this.storage.get(params.sourceKey)
    if (!sourceItem) {
      throw new StorageError(StorageErrorCode.NOT_FOUND, `Source key not found: ${params.sourceKey}`)
    }

    const keyValidation = this.validateKey(params.destinationKey)
    if (!keyValidation.isValid) {
      throw new StorageError(
        StorageErrorCode.INVALID_KEY,
        keyValidation.errors.join(', ')
      )
    }

    this.storage.set(params.destinationKey, { ...sourceItem })

    return { key: params.destinationKey }
  }

  async move(params: {
    sourceKey: string
    destinationKey: string
  }): Promise<{ key: string }> {
    await this.copy(params)
    await this.delete(params.sourceKey)

    return { key: params.destinationKey }
  }
}

/**
 * Test data generators
 */
export class StorageTestDataGenerator {
  /**
   * Generate test file content
   */
  static generateTestFile(sizeBytes: number, type: 'text' | 'binary' = 'text'): Buffer {
    if (type === 'text') {
      const content = 'A'.repeat(sizeBytes)
      return Buffer.from(content, 'utf8')
    } else {
      return Buffer.alloc(sizeBytes, 0x42) // Fill with 'B' bytes
    }
  }

  /**
   * Generate test image file (mock)
   */
  static generateTestImage(width: number, height: number): Buffer {
    // Mock PNG header and minimal content
    const headerSize = 33
    const imageDataSize = width * height * 3 // RGB
    const totalSize = headerSize + imageDataSize

    const buffer = Buffer.alloc(totalSize)
    
    // Write PNG signature
    buffer.write('\x89PNG\r\n\x1a\n', 0)
    
    // Mock IHDR chunk
    buffer.writeUInt32BE(13, 8) // IHDR length
    buffer.write('IHDR', 12)
    buffer.writeUInt32BE(width, 16)
    buffer.writeUInt32BE(height, 20)
    
    return buffer
  }

  /**
   * Generate test keys with various patterns
   */
  static generateTestKeys(): {
    valid: string[]
    invalid: string[]
  } {
    return {
      valid: [
        'test/file.txt',
        'images/photo.jpg',
        'documents/report-2024.pdf',
        'uploads/user-123/avatar.png',
        'tmp/processing/batch-001.zip',
      ],
      invalid: [
        '', // empty
        '/leading-slash.txt', // leading slash
        'trailing-slash/', // trailing slash
        'double//slash.txt', // double slash
        'path/../traversal.txt', // path traversal
        'null\0char.txt', // null character
        'A'.repeat(1025), // too long
      ],
    }
  }

  /**
   * Generate test metadata
   */
  static generateTestMetadata(): Record<string, string> {
    return {
      'user-id': '123',
      'upload-source': 'web-app',
      'content-hash': 'sha256:abc123',
      'original-filename': 'test-file.jpg',
    }
  }
}

/**
 * Test harness for running storage provider tests
 */
export class StorageTestHarness {
  constructor(private provider: IStorageProvider) {}

  /**
   * Run comprehensive test suite
   */
  async runTestSuite(): Promise<{
    passed: number
    failed: number
    results: Array<{ test: string; passed: boolean; error?: string }>
  }> {
    const results: Array<{ test: string; passed: boolean; error?: string }> = []

    const tests = [
      () => this.testBasicUpload(),
      () => this.testInvalidKey(),
      () => this.testFileNotFound(),
      () => this.testBatchOperations(),
      () => this.testMetadataOperations(),
      () => this.testListOperations(),
      () => this.testCopyMove(),
    ]

    for (const test of tests) {
      try {
        await test()
        results.push({ test: test.name, passed: true })
      } catch (error) {
        results.push({
          test: test.name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length

    return { passed, failed, results }
  }

  private async testBasicUpload(): Promise<void> {
    const testData = StorageTestDataGenerator.generateTestFile(1024)
    const key = 'test/basic-upload.txt'

    const result = await this.provider.upload({
      key,
      file: testData,
      contentType: 'text/plain',
    })

    if (result.key !== key) {
      throw new Error(`Expected key ${key}, got ${result.key}`)
    }

    if (result.size !== testData.length) {
      throw new Error(`Expected size ${testData.length}, got ${result.size}`)
    }

    // Verify file exists
    const exists = await this.provider.exists(key)
    if (!exists) {
      throw new Error('File should exist after upload')
    }

    // Clean up
    await this.provider.delete(key)
  }

  private async testInvalidKey(): Promise<void> {
    const testData = StorageTestDataGenerator.generateTestFile(100)
    
    try {
      await this.provider.upload({
        key: '', // invalid key
        file: testData,
        contentType: 'text/plain',
      })
      throw new Error('Should have thrown error for invalid key')
    } catch (error) {
      if (!(error instanceof StorageError)) {
        throw new Error('Should throw StorageError for invalid key')
      }
    }
  }

  private async testFileNotFound(): Promise<void> {
    try {
      await this.provider.getMetadata('non-existent-file.txt')
      throw new Error('Should have thrown error for non-existent file')
    } catch (error) {
      if (!(error instanceof StorageError) || error.code !== StorageErrorCode.NOT_FOUND) {
        throw new Error('Should throw NOT_FOUND error for non-existent file')
      }
    }
  }

  private async testBatchOperations(): Promise<void> {
    const keys = ['test/batch-1.txt', 'test/batch-2.txt', 'test/batch-3.txt']
    const testData = StorageTestDataGenerator.generateTestFile(100)

    // Upload test files
    for (const key of keys) {
      await this.provider.upload({
        key,
        file: testData,
        contentType: 'text/plain',
      })
    }

    // Test batch delete
    const result = await this.provider.deleteBatch(keys)
    
    if (result.deleted.length !== keys.length) {
      throw new Error(`Expected ${keys.length} deleted files, got ${result.deleted.length}`)
    }

    if (result.failed.length !== 0) {
      throw new Error(`Expected 0 failed deletions, got ${result.failed.length}`)
    }
  }

  private async testMetadataOperations(): Promise<void> {
    const key = 'test/metadata-test.txt'
    const testData = StorageTestDataGenerator.generateTestFile(1024)
    const metadata = StorageTestDataGenerator.generateTestMetadata()

    await this.provider.upload({
      key,
      file: testData,
      contentType: 'text/plain',
      metadata,
    })

    const fileMetadata = await this.provider.getMetadata(key)
    
    if (fileMetadata.size !== testData.length) {
      throw new Error(`Expected size ${testData.length}, got ${fileMetadata.size}`)
    }

    if (fileMetadata.contentType !== 'text/plain') {
      throw new Error(`Expected content type 'text/plain', got ${fileMetadata.contentType}`)
    }

    // Clean up
    await this.provider.delete(key)
  }

  private async testListOperations(): Promise<void> {
    const prefix = 'test/list/'
    const keys = [
      `${prefix}file1.txt`,
      `${prefix}file2.txt`,
      `${prefix}subdir/file3.txt`,
    ]
    const testData = StorageTestDataGenerator.generateTestFile(100)

    // Upload test files
    for (const key of keys) {
      await this.provider.upload({
        key,
        file: testData,
        contentType: 'text/plain',
      })
    }

    // List with prefix
    const result = await this.provider.list({ prefix })
    
    if (result.items.length !== keys.length) {
      throw new Error(`Expected ${keys.length} items, got ${result.items.length}`)
    }

    // Clean up
    await this.provider.deleteBatch(keys)
  }

  private async testCopyMove(): Promise<void> {
    const sourceKey = 'test/source.txt'
    const copyKey = 'test/copy.txt'
    const moveKey = 'test/moved.txt'
    const testData = StorageTestDataGenerator.generateTestFile(1024)

    // Upload source file
    await this.provider.upload({
      key: sourceKey,
      file: testData,
      contentType: 'text/plain',
    })

    // Test copy
    await this.provider.copy({ sourceKey, destinationKey: copyKey })
    
    const sourceExists = await this.provider.exists(sourceKey)
    const copyExists = await this.provider.exists(copyKey)
    
    if (!sourceExists) {
      throw new Error('Source file should still exist after copy')
    }
    
    if (!copyExists) {
      throw new Error('Copy file should exist after copy')
    }

    // Test move
    await this.provider.move({ sourceKey: copyKey, destinationKey: moveKey })
    
    const copyExistsAfterMove = await this.provider.exists(copyKey)
    const moveExists = await this.provider.exists(moveKey)
    
    if (copyExistsAfterMove) {
      throw new Error('Copy file should not exist after move')
    }
    
    if (!moveExists) {
      throw new Error('Moved file should exist after move')
    }

    // Clean up
    await this.provider.deleteBatch([sourceKey, moveKey])
  }
}
