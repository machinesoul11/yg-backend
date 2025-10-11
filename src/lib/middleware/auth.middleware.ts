/**
 * Authentication Middleware
 * Core authentication verification layer for API routes
 * 
 * This middleware validates user identity through multiple authentication methods:
 * - Session-based authentication (Auth.js cookies)
 * - JWT bearer tokens
 * - API keys for service integrations
 */

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import jwt from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { AUTH_CONFIG } from '@/lib/config';
import { AuditService, AUDIT_ACTIONS } from '@/lib/services/audit.service';
import { rateLimiter } from '@/lib/redis';
import { validateApiKey } from './api-key.middleware';
import type { UserRole } from '@prisma/client';

const auditService = new AuditService(prisma);

/**
 * Authenticated user context
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  name?: string | null;
  creatorId?: string;
  brandId?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'NO_CREDENTIALS' | 'USER_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'RATE_LIMITED';
}

/**
 * Authentication method type
 */
type AuthMethod = 'session' | 'bearer' | 'apikey';

/**
 * Extract authentication credentials from request
 */
function extractAuthCredentials(req: NextRequest): { method: AuthMethod; credentials: string } | null {
  // Check Authorization header for bearer token or API key
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return { method: 'bearer', credentials: authHeader.substring(7) };
    }
    if (authHeader.startsWith('ApiKey ')) {
      return { method: 'apikey', credentials: authHeader.substring(7) };
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers.get('x-api-key');
  if (apiKeyHeader) {
    return { method: 'apikey', credentials: apiKeyHeader };
  }

  // Session-based auth will be handled by getToken
  return { method: 'session', credentials: '' };
}

/**
 * Verify JWT bearer token
 */
async function verifyBearerToken(token: string): Promise<AuthUser | null> {
  try {
    // Use next-auth's decode function
    const decoded = await jwt.decode({
      token,
      secret: AUTH_CONFIG.secret,
    });
    
    // Validate token structure
    if (!decoded || !decoded.userId || !decoded.email || !decoded.role) {
      return null;
    }

    // Fetch fresh user data from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        creator: { select: { id: true } },
        brand: { select: { id: true } },
      },
    });

    if (!user || user.deleted_at || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: !!user.email_verified,
      name: user.name,
      creatorId: user.creator?.id,
      brandId: user.brand?.id,
    };
  } catch (error) {
    console.error('[AuthMiddleware] Bearer token verification failed:', error);
    return null;
  }
}

/**
 * Verify API key (integrates with API key system)
 */
async function verifyApiKey(apiKey: string): Promise<AuthUser | null> {
  const result = await validateApiKey(apiKey);
  
  if (!result.valid || !result.userId) {
    return null;
  }

  // Fetch user information
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    include: {
      creator: { select: { id: true } },
      brand: { select: { id: true } },
    },
  });

  if (!user || user.deleted_at || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: !!user.email_verified,
    name: user.name,
    creatorId: user.creator?.id,
    brandId: user.brand?.id,
  };
}

/**
 * Verify session-based authentication using Auth.js
 */
async function verifySession(req: NextRequest): Promise<AuthUser | null> {
  try {
    const token = await getToken({
      req: req as any,
      secret: AUTH_CONFIG.secret,
    });

    if (!token || !token.userId) {
      return null;
    }

    // Fetch current user state from database
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      include: {
        creator: { select: { id: true } },
        brand: { select: { id: true } },
      },
    });

    if (!user || user.deleted_at || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: !!user.email_verified,
      name: user.name,
      creatorId: user.creator?.id,
      brandId: user.brand?.id,
    };
  } catch (error) {
    console.error('[AuthMiddleware] Session verification failed:', error);
    return null;
  }
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req: NextRequest, userId?: string): string {
  if (userId) return userId;
  
  // Fallback to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/**
 * Get request metadata for audit logging
 */
function getRequestMetadata(req: NextRequest) {
  return {
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
  };
}

/**
 * Main authentication middleware
 * Verifies user identity and enriches request with user context
 * 
 * @param req - Next.js request object
 * @param options - Authentication options
 * @returns Authentication result
 * 
 * @example
 * ```typescript
 * const auth = await authenticateRequest(request);
 * if (!auth.authenticated || !auth.user) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export async function authenticateRequest(
  req: NextRequest,
  options: {
    requireEmailVerification?: boolean;
    enableRateLimiting?: boolean;
    rateLimitAction?: 'api' | 'upload' | 'message';
  } = {}
): Promise<AuthResult> {
  const metadata = getRequestMetadata(req);

  try {
    // Extract credentials
    const auth = extractAuthCredentials(req);
    let user: AuthUser | null = null;

    if (auth) {
      // Attempt authentication based on method
      switch (auth.method) {
        case 'bearer':
          user = await verifyBearerToken(auth.credentials);
          break;
        case 'apikey':
          user = await verifyApiKey(auth.credentials);
          break;
        case 'session':
          user = await verifySession(req);
          break;
      }
    }

    // No valid credentials found
    if (!user) {
      await auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: 'unknown',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        requestId: metadata.requestId,
        after: { reason: 'AUTHENTICATION_FAILED', method: auth?.method || 'none' },
      });

      return {
        authenticated: false,
        error: 'Authentication required',
        errorCode: 'NO_CREDENTIALS',
      };
    }

    // Check email verification requirement
    if (options.requireEmailVerification && !user.emailVerified) {
      return {
        authenticated: false,
        error: 'Email verification required',
        errorCode: 'ACCOUNT_INACTIVE',
      };
    }

    // Rate limiting check
    if (options.enableRateLimiting) {
      const identifier = getClientIdentifier(req, user.id);
      const action = options.rateLimitAction || 'api';
      
      const rateLimit = await rateLimiter.checkLimit(identifier, action);
      if (!rateLimit.allowed) {
        await auditService.log({
          action: 'RATE_LIMIT_EXCEEDED',
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          requestId: metadata.requestId,
          after: { action, limit: rateLimit.limit, resetAt: rateLimit.resetAt },
        });

        return {
          authenticated: false,
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMITED',
        };
      }
    }

    // Successful authentication
    return {
      authenticated: true,
      user,
    };
  } catch (error) {
    console.error('[AuthMiddleware] Authentication error:', error);
    
    await auditService.log({
      action: 'AUTHENTICATION_ERROR',
      entityType: 'system',
      entityId: 'auth-middleware',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      after: { error: error instanceof Error ? error.message : 'Unknown error' },
    });

    return {
      authenticated: false,
      error: 'Authentication failed',
      errorCode: 'INVALID_TOKEN',
    };
  }
}

/**
 * Middleware wrapper for API routes that requires authentication
 * 
 * @example
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   const auth = await requireAuth(req);
 *   // auth.user is guaranteed to exist
 *   return NextResponse.json({ userId: auth.user.id });
 * }
 * ```
 */
export async function requireAuth(
  req: NextRequest,
  options?: Parameters<typeof authenticateRequest>[1]
): Promise<{ user: AuthUser }> {
  const result = await authenticateRequest(req, options);
  
  if (!result.authenticated || !result.user) {
    throw new Error(result.error || 'Unauthorized');
  }

  return { user: result.user };
}
