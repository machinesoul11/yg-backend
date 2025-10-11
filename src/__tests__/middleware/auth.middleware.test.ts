/**
 * Authentication Middleware Tests
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, requireAuth } from '@/lib/middleware/auth.middleware';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { rateLimiter } from '@/lib/redis';

// Mock dependencies
jest.mock('next-auth/jwt');
jest.mock('@/lib/db');
jest.mock('@/lib/redis');
jest.mock('@/lib/services/audit.service');

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRateLimiter = rateLimiter as jest.Mocked<typeof rateLimiter>;

describe('Authentication Middleware', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'CREATOR' as const,
    isActive: true,
    deleted_at: null,
    email_verified: new Date(),
    creator: { id: 'creator-123' },
    brand: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Authentication', () => {
    it('should authenticate valid session', async () => {
      // Mock session token
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      // Mock user lookup
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('user-123');
    });

    it('should reject expired or missing session', async () => {
      mockGetToken.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(false);
      expect(result.errorCode).toBe('NO_CREDENTIALS');
    });

    it('should reject deleted user account', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        deleted_at: new Date(),
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(false);
    });

    it('should reject inactive user account', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req);

      expect(result.authenticated).toBe(false);
    });
  });

  describe('Email Verification', () => {
    it('should enforce email verification when required', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        email_verified: null, // Not verified
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req, {
        requireEmailVerification: true,
      });

      expect(result.authenticated).toBe(false);
      expect(result.errorCode).toBe('ACCOUNT_INACTIVE');
    });

    it('should allow unverified email when not required', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        email_verified: null,
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req, {
        requireEmailVerification: false,
      });

      expect(result.authenticated).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits when enabled', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Mock rate limit exceeded
      (mockRateLimiter.checkLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
        limit: 100,
        current: 101,
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req, {
        enableRateLimiting: true,
        rateLimitAction: 'api',
      });

      expect(result.authenticated).toBe(false);
      expect(result.errorCode).toBe('RATE_LIMITED');
    });

    it('should allow request when under rate limit', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      (mockRateLimiter.checkLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetAt: new Date(),
        limit: 100,
        current: 50,
      });

      const req = new NextRequest('http://localhost:3000/api/test');
      const result = await authenticateRequest(req, {
        enableRateLimiting: true,
        rateLimitAction: 'api',
      });

      expect(result.authenticated).toBe(true);
    });
  });

  describe('Bearer Token Authentication', () => {
    it('should authenticate valid bearer token', async () => {
      const req = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      // Note: This test would need proper JWT mocking
      // For now, it demonstrates the pattern
    });
  });

  describe('requireAuth helper', () => {
    it('should return user when authenticated', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'CREATOR',
      } as any);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = new NextRequest('http://localhost:3000/api/test');
      const { user } = await requireAuth(req);

      expect(user).toBeDefined();
      expect(user.id).toBe('user-123');
    });

    it('should throw when not authenticated', async () => {
      mockGetToken.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/test');

      await expect(requireAuth(req)).rejects.toThrow();
    });
  });
});
