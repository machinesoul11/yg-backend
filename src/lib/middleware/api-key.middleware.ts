/**
 * API Key Authentication System
 * Manages API keys for service-to-service communication and third-party integrations
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import crypto from 'crypto';
import type { UserRole } from '@prisma/client';

const auditService = new AuditService(prisma);

/**
 * API Key prefix for different environments
 */
const API_KEY_PREFIX = {
  live: 'yg_live_',
  test: 'yg_test_',
} as const;

/**
 * API Key scope (permissions)
 */
export type ApiKeyScope =
  | 'read:assets'
  | 'write:assets'
  | 'read:projects'
  | 'write:projects'
  | 'read:licenses'
  | 'write:licenses'
  | 'read:analytics'
  | 'webhooks:receive'
  | 'admin:all';

/**
 * API Key status
 */
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * API Key information
 */
export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

/**
 * API Key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  userRole?: UserRole;
  scopes?: ApiKeyScope[];
  keyInfo?: ApiKeyInfo;
  error?: string;
}

/**
 * Generate a secure API key
 */
export function generateApiKey(environment: 'live' | 'test' = 'live'): string {
  // Generate 32 bytes of random data
  const randomBytes = crypto.randomBytes(32);
  const keyString = randomBytes.toString('base64url'); // URL-safe base64
  
  return `${API_KEY_PREFIX[environment]}${keyString}`;
}

/**
 * Hash API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return (
    apiKey.startsWith(API_KEY_PREFIX.live) ||
    apiKey.startsWith(API_KEY_PREFIX.test)
  );
}

/**
 * Build cache key for API key lookup
 */
function buildApiKeyCacheKey(keyHash: string): string {
  return `apikey:${keyHash}`;
}

/**
 * Get cached API key info
 */
async function getCachedApiKey(keyHash: string): Promise<ApiKeyInfo | null> {
  try {
    const cached = await redis.get(buildApiKeyCacheKey(keyHash));
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[ApiKeyAuth] Cache read error:', error);
    return null;
  }
}

/**
 * Cache API key info
 */
async function cacheApiKey(keyInfo: ApiKeyInfo, ttl: number = 300): Promise<void> {
  try {
    const key = buildApiKeyCacheKey(keyInfo.keyHash);
    await redis.setex(key, ttl, JSON.stringify(keyInfo));
  } catch (error) {
    console.error('[ApiKeyAuth] Cache write error:', error);
  }
}

/**
 * Invalidate API key cache
 */
export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  try {
    await redis.del(buildApiKeyCacheKey(keyHash));
  } catch (error) {
    console.error('[ApiKeyAuth] Cache invalidation error:', error);
  }
}

/**
 * Create a new API key (stores in database as api_keys table doesn't exist yet)
 * This is a placeholder implementation that will need database table when ready
 */
export async function createApiKey(params: {
  userId: string;
  name: string;
  scopes: ApiKeyScope[];
  expiresInDays?: number;
  environment?: 'live' | 'test';
}): Promise<{ apiKey: string; keyInfo: ApiKeyInfo }> {
  const { userId, name, scopes, expiresInDays, environment = 'live' } = params;

  // Generate API key
  const apiKey = generateApiKey(environment);
  const keyHash = hashApiKey(apiKey);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  // TODO: Store in api_keys table when it's created
  // For now, we'll store in a temporary format
  const keyInfo: ApiKeyInfo = {
    id: crypto.randomUUID(),
    userId,
    name,
    keyHash,
    scopes,
    status: 'active',
    createdAt: new Date(),
    expiresAt,
    usageCount: 0,
  };

  // Cache the key info
  await cacheApiKey(keyInfo);

  // Audit log
  await auditService.log({
    action: 'API_KEY_CREATED',
    entityType: 'api_key',
    entityId: keyInfo.id,
    userId,
    after: {
      name,
      scopes,
      expiresAt,
    },
  });

  return { apiKey, keyInfo };
}

/**
 * Validate API key and return associated user and permissions
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  // Validate format
  if (!isValidApiKeyFormat(apiKey)) {
    return {
      valid: false,
      error: 'Invalid API key format',
    };
  }

  const keyHash = hashApiKey(apiKey);

  try {
    // Check cache first
    let keyInfo = await getCachedApiKey(keyHash);

    // TODO: Query database when api_keys table exists
    // For now, only cached keys work
    if (!keyInfo) {
      return {
        valid: false,
        error: 'API key not found',
      };
    }

    // Check if revoked
    if (keyInfo.status === 'revoked') {
      await auditService.log({
        action: 'API_KEY_REVOKED_ATTEMPT',
        entityType: 'api_key',
        entityId: keyInfo.id,
        userId: keyInfo.userId,
        after: { keyHash },
      });

      return {
        valid: false,
        error: 'API key has been revoked',
      };
    }

    // Check if expired
    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      return {
        valid: false,
        error: 'API key has expired',
      };
    }

    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: keyInfo.userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        deleted_at: true,
      },
    });

    if (!user || user.deleted_at || !user.isActive) {
      return {
        valid: false,
        error: 'Associated user account is inactive',
      };
    }

    // Update last used timestamp and usage count
    keyInfo.lastUsedAt = new Date();
    keyInfo.usageCount++;
    
    // Update cache
    await cacheApiKey(keyInfo);

    // TODO: Update database when table exists

    return {
      valid: true,
      userId: user.id,
      userRole: user.role,
      scopes: keyInfo.scopes,
      keyInfo,
    };
  } catch (error) {
    console.error('[ApiKeyAuth] Validation error:', error);
    
    return {
      valid: false,
      error: 'API key validation failed',
    };
  }
}

/**
 * Check if API key has specific scope
 */
export function hasScope(keyInfo: ApiKeyInfo, requiredScope: ApiKeyScope): boolean {
  // admin:all scope grants all permissions
  if (keyInfo.scopes.includes('admin:all')) {
    return true;
  }

  return keyInfo.scopes.includes(requiredScope);
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<void> {
  // TODO: Update database when table exists
  
  // For now, just invalidate cache
  // We need the keyHash to invalidate, so this is incomplete
  
  await auditService.log({
    action: 'API_KEY_REVOKED',
    entityType: 'api_key',
    entityId: keyId,
    userId,
  });
}

/**
 * List API keys for a user
 */
export async function listApiKeys(userId: string): Promise<Partial<ApiKeyInfo>[]> {
  // TODO: Query database when table exists
  // For now, return empty array
  
  return [];
}

/**
 * Rotate API key (generate new key, keep old one valid for grace period)
 */
export async function rotateApiKey(
  keyId: string,
  userId: string,
  gracePeriodDays: number = 7
): Promise<{ apiKey: string; keyInfo: ApiKeyInfo }> {
  // TODO: Implement when database table exists
  // 1. Mark old key with expiration date = now + gracePeriodDays
  // 2. Create new key with same scopes
  // 3. Return new key
  
  throw new Error('API key rotation not yet implemented');
}
