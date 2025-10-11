/**
 * Authorization Middleware Tests
 */

import { checkRole, checkPermission, requireRole, requirePermission } from '@/lib/middleware/authorization.middleware';
import { PermissionService } from '@/lib/services/permission.service';
import { PERMISSIONS } from '@/lib/constants/permissions';
import type { AuthUser } from '@/lib/middleware/auth.middleware';

// Mock dependencies
jest.mock('@/lib/services/permission.service');
jest.mock('@/lib/db');

const mockPermissionService = PermissionService as jest.Mocked<typeof PermissionService>;

describe('Authorization Middleware', () => {
  const mockAdminUser: AuthUser = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'ADMIN',
    emailVerified: true,
    name: 'Admin User',
  };

  const mockCreatorUser: AuthUser = {
    id: 'creator-123',
    email: 'creator@example.com',
    role: 'CREATOR',
    emailVerified: true,
    name: 'Creator User',
    creatorId: 'creator-abc',
  };

  const mockBrandUser: AuthUser = {
    id: 'brand-123',
    email: 'brand@example.com',
    role: 'BRAND',
    emailVerified: true,
    name: 'Brand User',
    brandId: 'brand-xyz',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRole', () => {
    it('should allow user with required role', () => {
      const result = checkRole(mockAdminUser, {
        allowedRoles: ['ADMIN'],
      });

      expect(result.authorized).toBe(true);
    });

    it('should allow user with any of multiple allowed roles', () => {
      const result = checkRole(mockCreatorUser, {
        allowedRoles: ['ADMIN', 'CREATOR'],
      });

      expect(result.authorized).toBe(true);
    });

    it('should deny user without required role', () => {
      const result = checkRole(mockCreatorUser, {
        allowedRoles: ['ADMIN'],
      });

      expect(result.authorized).toBe(false);
      expect(result.errorCode).toBe('ROLE_REQUIRED');
    });
  });

  describe('requireRole', () => {
    it('should not throw for user with required role', () => {
      expect(() => {
        requireRole(mockAdminUser, ['ADMIN']);
      }).not.toThrow();
    });

    it('should throw for user without required role', () => {
      expect(() => {
        requireRole(mockCreatorUser, ['ADMIN']);
      }).toThrow();
    });
  });

  describe('checkPermission', () => {
    it('should allow user with required permission', async () => {
      const mockService = {
        hasAnyPermission: jest.fn().mockResolvedValue(true),
        hasAllPermissions: jest.fn().mockResolvedValue(true),
      };

      // This would need proper mocking of the PermissionService constructor

      const result = await checkPermission(mockAdminUser, {
        requiredPermissions: [PERMISSIONS.PROJECTS_VIEW_ALL],
      });

      expect(result.authorized).toBe(true);
    });
  });

  describe('Role-specific helpers', () => {
    it('should verify admin role correctly', () => {
      const adminResult = checkRole(mockAdminUser, { allowedRoles: ['ADMIN'] });
      expect(adminResult.authorized).toBe(true);

      const creatorResult = checkRole(mockCreatorUser, { allowedRoles: ['ADMIN'] });
      expect(creatorResult.authorized).toBe(false);
    });

    it('should verify creator role correctly', () => {
      const creatorResult = checkRole(mockCreatorUser, { allowedRoles: ['CREATOR'] });
      expect(creatorResult.authorized).toBe(true);

      const brandResult = checkRole(mockBrandUser, { allowedRoles: ['CREATOR'] });
      expect(brandResult.authorized).toBe(false);
    });

    it('should verify brand role correctly', () => {
      const brandResult = checkRole(mockBrandUser, { allowedRoles: ['BRAND'] });
      expect(brandResult.authorized).toBe(true);

      const adminResult = checkRole(mockAdminUser, { allowedRoles: ['BRAND'] });
      expect(adminResult.authorized).toBe(false);
    });
  });
});
