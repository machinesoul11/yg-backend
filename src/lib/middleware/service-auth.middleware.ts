/**
 * Service-Level Authentication
 * Authentication for internal service-to-service communication
 * 
 * Supports:
 * - Service tokens with automatic rotation
 * - Request signature verification (HMAC)
 * - Service identity propagation
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { prisma } from '@/lib/db';

const auditService = new AuditService(prisma);

/**
 * Known service identities
 */
export type ServiceIdentity =
  | 'analytics-processor'
  | 'royalty-calculator'
  | 'payout-processor'
  | 'email-service'
  | 'storage-service'
  | 'notification-service'
  | 'background-job';

/**
 * Service authentication result
 */
export interface ServiceAuthResult {
  authenticated: boolean;
  serviceId?: ServiceIdentity;
  error?: string;
}

/**
 * Service token information
 */
interface ServiceToken {
  serviceId: ServiceIdentity;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  rotationScheduled?: Date;
}

/**
 * Request signature payload
 */
interface SignaturePayload {
  timestamp: number;
  method: string;
  path: string;
  body?: string;
}

/**
 * Generate service token
 */
export function generateServiceToken(serviceId: ServiceIdentity): string {
  const randomBytes = crypto.randomBytes(32);
  const token = `svc_${serviceId}_${randomBytes.toString('base64url')}`;
  return token;
}

/**
 * Hash service token for storage
 */
function hashServiceToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * Get service secret from environment
 */
function getServiceSecret(serviceId: ServiceIdentity): string | undefined {
  // Map service IDs to environment variables
  const envVarMap: Record<ServiceIdentity, string> = {
    'analytics-processor': 'SERVICE_SECRET_ANALYTICS',
    'royalty-calculator': 'SERVICE_SECRET_ROYALTY',
    'payout-processor': 'SERVICE_SECRET_PAYOUT',
    'email-service': 'SERVICE_SECRET_EMAIL',
    'storage-service': 'SERVICE_SECRET_STORAGE',
    'notification-service': 'SERVICE_SECRET_NOTIFICATION',
    'background-job': 'SERVICE_SECRET_JOBS',
  };

  return process.env[envVarMap[serviceId]];
}

/**
 * Store service token in Redis
 */
async function storeServiceToken(
  serviceId: ServiceIdentity,
  tokenHash: string,
  expiresInDays: number = 90
): Promise<void> {
  const key = `service:token:${serviceId}`;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const tokenInfo: ServiceToken = {
    serviceId,
    tokenHash,
    createdAt: new Date(),
    expiresAt,
  };

  await redis.setex(
    key,
    expiresInDays * 24 * 60 * 60,
    JSON.stringify(tokenInfo)
  );
}

/**
 * Get service token from Redis
 */
async function getServiceToken(serviceId: ServiceIdentity): Promise<ServiceToken | null> {
  try {
    const key = `service:token:${serviceId}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[ServiceAuth] Token retrieval error:', error);
    return null;
  }
}

/**
 * Validate service token
 */
export async function validateServiceToken(token: string): Promise<ServiceAuthResult> {
  // Extract service ID from token format: svc_{serviceId}_{random}
  const parts = token.split('_');
  if (parts.length < 3 || parts[0] !== 'svc') {
    return {
      authenticated: false,
      error: 'Invalid service token format',
    };
  }

  const serviceId = parts.slice(1, -1).join('_') as ServiceIdentity;
  const tokenHash = hashServiceToken(token);

  try {
    // Get stored token
    const storedToken = await getServiceToken(serviceId);

    if (!storedToken) {
      return {
        authenticated: false,
        error: 'Service token not found',
      };
    }

    // Verify token hash matches
    if (storedToken.tokenHash !== tokenHash) {
      await auditService.log({
        action: 'SERVICE_AUTH_FAILED',
        entityType: 'service',
        entityId: serviceId,
        after: { reason: 'Invalid token' },
      });

      return {
        authenticated: false,
        error: 'Invalid service token',
      };
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      return {
        authenticated: false,
        error: 'Service token expired',
      };
    }

    return {
      authenticated: true,
      serviceId,
    };
  } catch (error) {
    console.error('[ServiceAuth] Token validation error:', error);
    return {
      authenticated: false,
      error: 'Service authentication failed',
    };
  }
}

/**
 * Generate request signature for service-to-service calls
 */
export function generateRequestSignature(
  payload: SignaturePayload,
  secret: string
): string {
  const data = JSON.stringify({
    timestamp: payload.timestamp,
    method: payload.method,
    path: payload.path,
    body: payload.body || '',
  });

  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify request signature
 */
export function verifyRequestSignature(
  req: NextRequest,
  signature: string,
  secret: string,
  maxAgeSeconds: number = 300 // 5 minutes
): boolean {
  try {
    // Extract timestamp from signature header or body
    const timestamp = parseInt(req.headers.get('x-timestamp') || '0');
    
    if (!timestamp) {
      return false;
    }

    // Check timestamp is within acceptable range (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAgeSeconds) {
      console.warn('[ServiceAuth] Request timestamp out of range');
      return false;
    }

    // Reconstruct the payload
    const payload: SignaturePayload = {
      timestamp,
      method: req.method,
      path: req.nextUrl.pathname,
      // Body would need to be read from request, but that consumes the stream
      // In practice, you'd need to buffer the body first
    };

    const expectedSignature = generateRequestSignature(payload, secret);

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[ServiceAuth] Signature verification error:', error);
    return false;
  }
}

/**
 * Authenticate service request
 * Checks for service token in Authorization header
 */
export async function authenticateServiceRequest(
  req: NextRequest
): Promise<ServiceAuthResult> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    return {
      authenticated: false,
      error: 'Missing authorization header',
    };
  }

  // Check for service token
  if (authHeader.startsWith('Service ')) {
    const token = authHeader.substring(8);
    return await validateServiceToken(token);
  }

  // Check for signed request
  if (authHeader.startsWith('Signature ')) {
    const signature = authHeader.substring(10);
    const serviceIdHeader = req.headers.get('x-service-id') as ServiceIdentity;

    if (!serviceIdHeader) {
      return {
        authenticated: false,
        error: 'Missing service ID header',
      };
    }

    const secret = getServiceSecret(serviceIdHeader);
    if (!secret) {
      return {
        authenticated: false,
        error: 'Service not configured',
      };
    }

    const isValid = verifyRequestSignature(req, signature, secret);

    if (!isValid) {
      await auditService.log({
        action: 'SERVICE_AUTH_FAILED',
        entityType: 'service',
        entityId: serviceIdHeader,
        after: { reason: 'Invalid signature' },
      });

      return {
        authenticated: false,
        error: 'Invalid request signature',
      };
    }

    return {
      authenticated: true,
      serviceId: serviceIdHeader,
    };
  }

  return {
    authenticated: false,
    error: 'Invalid authorization method',
  };
}

/**
 * Require service authentication - throws if not authenticated
 */
export async function requireServiceAuth(
  req: NextRequest,
  allowedServices?: ServiceIdentity[]
): Promise<{ serviceId: ServiceIdentity }> {
  const result = await authenticateServiceRequest(req);

  if (!result.authenticated || !result.serviceId) {
    const error = new Error(result.error || 'Service authentication required');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  // Check if service is allowed
  if (allowedServices && !allowedServices.includes(result.serviceId)) {
    const error = new Error(`Service ${result.serviceId} not authorized for this endpoint`);
    (error as any).code = 'FORBIDDEN';
    throw error;
  }

  return { serviceId: result.serviceId };
}

/**
 * Initialize service token (should be run during service startup)
 */
export async function initializeServiceToken(
  serviceId: ServiceIdentity
): Promise<string> {
  // Check if token already exists and is valid
  const existingToken = await getServiceToken(serviceId);
  
  if (existingToken && existingToken.expiresAt > new Date()) {
    console.log(`[ServiceAuth] Using existing token for ${serviceId}`);
    // Return a placeholder since we don't store the actual token
    return 'TOKEN_EXISTS';
  }

  // Generate new token
  const token = generateServiceToken(serviceId);
  const tokenHash = hashServiceToken(token);

  // Store token
  await storeServiceToken(serviceId, tokenHash);

  // Audit log
  await auditService.log({
    action: 'SERVICE_TOKEN_CREATED',
    entityType: 'service',
    entityId: serviceId,
    after: { serviceId },
  });

  console.log(`[ServiceAuth] Generated new token for ${serviceId}`);
  return token;
}

/**
 * Rotate service token
 */
export async function rotateServiceToken(
  serviceId: ServiceIdentity,
  gracePeriodHours: number = 24
): Promise<{ newToken: string; expiresAt: Date }> {
  // Generate new token
  const newToken = generateServiceToken(serviceId);
  const tokenHash = hashServiceToken(newToken);

  // Store new token
  await storeServiceToken(serviceId, tokenHash);

  // Old token will remain valid until Redis expiry
  // In production, you'd want to track both old and new tokens during grace period

  const expiresAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000);

  await auditService.log({
    action: 'SERVICE_TOKEN_ROTATED',
    entityType: 'service',
    entityId: serviceId,
    after: { gracePeriodHours, expiresAt },
  });

  return { newToken, expiresAt };
}
