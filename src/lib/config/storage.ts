/**
 * Storage Configuration
 * 
 * Validates and exports storage configuration from environment variables
 */

import { z } from 'zod'

const storageConfigSchema = z.object({
  provider: z.enum(['r2', 'azure']),
  r2: z
    .object({
      accountId: z.string().min(1),
      accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1),
      bucketName: z.string().min(1),
      publicUrl: z.string().url().optional(),
    })
    .optional(),
  azure: z
    .object({
      accountName: z.string().min(1),
      accountKey: z.string().min(1),
      containerName: z.string().min(1),
    })
    .optional(),
  maxFileSize: z.number().positive(),
  allowedTypes: z.array(z.string()),
  uploadUrlExpiry: z.number().positive(),
  downloadUrlExpiry: z.number().positive(),
})

export const storageConfig = storageConfigSchema.parse({
  provider: process.env.STORAGE_PROVIDER || 's3',
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
    bucketName:
      process.env.STORAGE_BUCKET_ASSETS || 'yesgoddess-assets-production',
    publicUrl: process.env.R2_PUBLIC_URL,
  },
  azure: process.env.AZURE_STORAGE_ACCOUNT_NAME
    ? {
        accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
        accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY || '',
        containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || '',
      }
    : undefined,
  maxFileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '52428800'), // 50MB
  allowedTypes:
    process.env.STORAGE_ALLOWED_TYPES?.split(',') ||
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg',
      'audio/wav',
    ],
  uploadUrlExpiry: parseInt(process.env.STORAGE_UPLOAD_URL_EXPIRY || '900'), // 15 min
  downloadUrlExpiry: parseInt(
    process.env.STORAGE_DOWNLOAD_URL_EXPIRY || '3600'
  ), // 1 hour
})

export type StorageConfig = z.infer<typeof storageConfigSchema>
