/**
 * Storage Provider Factory & Client
 * 
 * Initializes and exports the configured storage provider
 */

import { storageConfig } from '../config/storage'
import { R2StorageProvider } from './providers/r2'
import type { IStorageProvider } from './types'

/**
 * Initialize storage provider based on configuration
 */
function createStorageProvider(): IStorageProvider {
  const { provider } = storageConfig

  switch (provider) {
    case 'r2':
      if (!storageConfig.r2) {
        throw new Error('R2 configuration is required when provider is "r2"')
      }
      return new R2StorageProvider({
        accountId: storageConfig.r2.accountId,
        accessKeyId: storageConfig.r2.accessKeyId,
        secretAccessKey: storageConfig.r2.secretAccessKey,
        bucketName: storageConfig.r2.bucketName,
      })

    case 'azure':
      if (!storageConfig.azure) {
        throw new Error(
          'Azure configuration is required when provider is "azure"'
        )
      }
      // Azure implementation will be added later
      throw new Error('Azure Blob Storage not yet implemented')

    default:
      throw new Error(`Unknown storage provider: ${provider}`)
  }
}

// Export singleton instance
export const storageProvider = createStorageProvider()

// Re-export types
export type { IStorageProvider, AssetMetadata, StorageConfig } from './types'
export { StorageError } from './types'
