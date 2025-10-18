/**
 * Report API Endpoints Integration Tests
 * 
 * Tests for the four required Report API endpoints:
 * 1. POST /reports/generate
 * 2. GET /reports/:id/download
 * 3. GET /reports/templates
 * 4. POST /reports/schedule
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appRouter } from '@/lib/api/root';
import { createTRPCContext } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import type { Session } from 'next-auth';

// Mock session data
const mockAdminSession: Session = {
  user: {
    id: 'admin_user_123',
    email: 'admin@yesgoddess.com',
    name: 'Admin User',
    role: 'ADMIN',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockCreatorSession: Session = {
  user: {
    id: 'creator_user_123',
    email: 'creator@yesgoddess.com',
    name: 'Creator User',
    role: 'CREATOR',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockBrandSession: Session = {
  user: {
    id: 'brand_user_123',
    email: 'brand@yesgoddess.com',
    name: 'Brand User',
    role: 'BRAND',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

describe('Report API Endpoints', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  describe('POST /reports/generate', () => {
    it('should create a new report generation job', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const result = await caller.reports.generate({
        reportType: 'revenue',
        parameters: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-31'),
        },
        format: 'pdf',
        name: 'Test Revenue Report',
      });

      expect(result).toHaveProperty('reportId');
      expect(result).toHaveProperty('jobId');
      expect(result.status).toBe('GENERATING');
      expect(result).toHaveProperty('estimatedCompletionTime');
      expect(result).toHaveProperty('message');
    });

    it('should support different report types', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const reportTypes = ['revenue', 'payouts', 'reconciliation', 'custom'] as const;

      for (const reportType of reportTypes) {
        const result = await caller.reports.generate({
          reportType,
          parameters: {
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-01-31'),
          },
          format: 'pdf',
        });

        expect(result.status).toBe('GENERATING');
      }
    });

    it('should support different export formats', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const formats = ['pdf', 'csv', 'excel', 'json'] as const;

      for (const format of formats) {
        const result = await caller.reports.generate({
          reportType: 'revenue',
          parameters: {
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-01-31'),
          },
          format,
        });

        expect(result.status).toBe('GENERATING');
      }
    });

    it('should require authentication', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });

      caller = appRouter.createCaller(ctx);

      await expect(
        caller.reports.generate({
          reportType: 'revenue',
          parameters: {},
          format: 'pdf',
        })
      ).rejects.toThrow();
    });
  });

  describe('GET /reports/:id/download', () => {
    it('should generate download URL for completed report', async () => {
      // First, create a test report
      const testReport = await prisma.financialReport.create({
        data: {
          id: 'test_report_123',
          reportType: 'REVENUE',
          period: { startDate: '2025-01-01', endDate: '2025-01-31' },
          generatedBy: mockAdminSession.user.id,
          status: 'COMPLETED',
          storageKey: 'reports/test_report_123.pdf',
          metadata: {
            format: 'pdf',
            name: 'Test Report',
            fileSize: 1024000,
          },
        },
      });

      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const result = await caller.reports.download({
        reportId: testReport.id,
      });

      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('reportInfo');
      expect(result.reportInfo.id).toBe(testReport.id);

      // Cleanup
      await prisma.financialReport.delete({
        where: { id: testReport.id },
      });
    });

    it('should reject if report is not completed', async () => {
      const testReport = await prisma.financialReport.create({
        data: {
          id: 'test_report_456',
          reportType: 'REVENUE',
          period: { startDate: '2025-01-01', endDate: '2025-01-31' },
          generatedBy: mockAdminSession.user.id,
          status: 'GENERATING',
          metadata: {},
        },
      });

      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      await expect(
        caller.reports.download({
          reportId: testReport.id,
        })
      ).rejects.toThrow(/not ready for download/i);

      // Cleanup
      await prisma.financialReport.delete({
        where: { id: testReport.id },
      });
    });

    it('should enforce access control', async () => {
      const testReport = await prisma.financialReport.create({
        data: {
          id: 'test_report_789',
          reportType: 'REVENUE',
          period: { startDate: '2025-01-01', endDate: '2025-01-31' },
          generatedBy: mockAdminSession.user.id,
          status: 'COMPLETED',
          storageKey: 'reports/test_report_789.pdf',
          metadata: {},
        },
      });

      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockCreatorSession, // Different user
      };

      caller = appRouter.createCaller(authenticatedCtx);

      await expect(
        caller.reports.download({
          reportId: testReport.id,
        })
      ).rejects.toThrow(/access denied/i);

      // Cleanup
      await prisma.financialReport.delete({
        where: { id: testReport.id },
      });
    });

    it('should return 404 for non-existent report', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      await expect(
        caller.reports.download({
          reportId: 'non_existent_report',
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('GET /reports/templates', () => {
    it('should return available templates', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const result = await caller.reports.getTemplates();

      expect(result).toHaveProperty('templates');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.templates)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should filter templates by user role', async () => {
      const adminCtx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const adminAuthCtx = {
        ...adminCtx,
        session: mockAdminSession,
      };

      const creatorCtx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const creatorAuthCtx = {
        ...creatorCtx,
        session: mockCreatorSession,
      };

      const adminCaller = appRouter.createCaller(adminAuthCtx);
      const creatorCaller = appRouter.createCaller(creatorAuthCtx);

      const adminTemplates = await adminCaller.reports.getTemplates();
      const creatorTemplates = await creatorCaller.reports.getTemplates();

      // Admin should have access to more templates
      expect(adminTemplates.total).toBeGreaterThanOrEqual(creatorTemplates.total);
    });

    it('should require authentication', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });

      caller = appRouter.createCaller(ctx);

      await expect(caller.reports.getTemplates()).rejects.toThrow();
    });
  });

  describe('POST /reports/schedule', () => {
    it('should create a scheduled report', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const result = await caller.reports.scheduleReport({
        name: 'Monthly Revenue Report',
        reportType: 'platform_revenue',
        frequency: 'MONTHLY',
        recipients: ['admin@yesgoddess.com'],
        formats: ['PDF', 'CSV'],
        schedule: {
          dayOfMonth: 1,
          hour: 9,
          minute: 0,
          timezone: 'America/New_York',
        },
        deliveryOptions: {
          emailDelivery: true,
          secureDownload: true,
          attachToEmail: false,
          downloadExpiration: 168,
        },
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('scheduledReport');
      expect(result.scheduledReport).toHaveProperty('id');
      expect(result.scheduledReport.name).toBe('Monthly Revenue Report');
      expect(result.scheduledReport.frequency).toBe('MONTHLY');
      expect(result.scheduledReport).toHaveProperty('nextScheduledAt');
      expect(result).toHaveProperty('message');

      // Cleanup
      if (result.scheduledReport.id) {
        await prisma.scheduledReport.delete({
          where: { id: result.scheduledReport.id },
        });
      }
    });

    it('should validate schedule configuration for frequency', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      // Weekly requires dayOfWeek
      await expect(
        caller.reports.scheduleReport({
          name: 'Weekly Report',
          reportType: 'platform_revenue',
          frequency: 'WEEKLY',
          recipients: ['admin@yesgoddess.com'],
          formats: ['PDF'],
          schedule: {
            hour: 9,
            minute: 0,
            timezone: 'America/New_York',
            // Missing dayOfWeek!
          },
          deliveryOptions: {
            emailDelivery: true,
            secureDownload: true,
            attachToEmail: false,
            downloadExpiration: 168,
          },
        })
      ).rejects.toThrow(/schedule configuration/i);
    });

    it('should support all frequency options', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      // Daily
      const dailyResult = await caller.reports.scheduleReport({
        name: 'Daily Report',
        reportType: 'platform_revenue',
        frequency: 'DAILY',
        recipients: ['admin@yesgoddess.com'],
        formats: ['PDF'],
        schedule: {
          hour: 9,
          minute: 0,
          timezone: 'America/New_York',
        },
        deliveryOptions: {
          emailDelivery: true,
          secureDownload: true,
          attachToEmail: false,
          downloadExpiration: 168,
        },
      });
      expect(dailyResult.success).toBe(true);

      // Weekly
      const weeklyResult = await caller.reports.scheduleReport({
        name: 'Weekly Report',
        reportType: 'platform_revenue',
        frequency: 'WEEKLY',
        recipients: ['admin@yesgoddess.com'],
        formats: ['PDF'],
        schedule: {
          dayOfWeek: 1, // Monday
          hour: 9,
          minute: 0,
          timezone: 'America/New_York',
        },
        deliveryOptions: {
          emailDelivery: true,
          secureDownload: true,
          attachToEmail: false,
          downloadExpiration: 168,
        },
      });
      expect(weeklyResult.success).toBe(true);

      // Cleanup
      await prisma.scheduledReport.delete({
        where: { id: dailyResult.scheduledReport.id },
      });
      await prisma.scheduledReport.delete({
        where: { id: weeklyResult.scheduledReport.id },
      });
    });

    it('should require appropriate role', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: {
          user: {
            id: 'viewer_user_123',
            email: 'viewer@yesgoddess.com',
            name: 'Viewer User',
            role: 'VIEWER',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        },
      };

      caller = appRouter.createCaller(authenticatedCtx);

      await expect(
        caller.reports.scheduleReport({
          name: 'Test Report',
          reportType: 'platform_revenue',
          frequency: 'DAILY',
          recipients: ['test@yesgoddess.com'],
          formats: ['PDF'],
          schedule: {
            hour: 9,
            minute: 0,
            timezone: 'America/New_York',
          },
          deliveryOptions: {
            emailDelivery: true,
            secureDownload: true,
            attachToEmail: false,
            downloadExpiration: 168,
          },
        })
      ).rejects.toThrow(/insufficient permissions/i);
    });

    it('should support all report types', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const reportTypes = [
        'royalty_statements',
        'transaction_ledger',
        'creator_earnings',
        'platform_revenue',
        'payout_summary',
      ] as const;

      for (const reportType of reportTypes) {
        const result = await caller.reports.scheduleReport({
          name: `Test ${reportType} Report`,
          reportType,
          frequency: 'DAILY',
          recipients: ['admin@yesgoddess.com'],
          formats: ['PDF'],
          schedule: {
            hour: 9,
            minute: 0,
            timezone: 'America/New_York',
          },
          deliveryOptions: {
            emailDelivery: true,
            secureDownload: true,
            attachToEmail: false,
            downloadExpiration: 168,
          },
        });

        expect(result.success).toBe(true);

        // Cleanup
        await prisma.scheduledReport.delete({
          where: { id: result.scheduledReport.id },
        });
      }
    });

    it('should support multiple formats', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });
      
      const authenticatedCtx = {
        ...ctx,
        session: mockAdminSession,
      };

      caller = appRouter.createCaller(authenticatedCtx);

      const result = await caller.reports.scheduleReport({
        name: 'Multi-Format Report',
        reportType: 'platform_revenue',
        frequency: 'DAILY',
        recipients: ['admin@yesgoddess.com'],
        formats: ['PDF', 'CSV', 'EXCEL'],
        schedule: {
          hour: 9,
          minute: 0,
          timezone: 'America/New_York',
        },
        deliveryOptions: {
          emailDelivery: true,
          secureDownload: true,
          attachToEmail: false,
          downloadExpiration: 168,
        },
      });

      expect(result.success).toBe(true);

      // Cleanup
      await prisma.scheduledReport.delete({
        where: { id: result.scheduledReport.id },
      });
    });
  });

  describe('Endpoint Integration', () => {
    it('should have all endpoints registered in router', () => {
      expect(appRouter._def.procedures).toHaveProperty('reports.generate');
      expect(appRouter._def.procedures).toHaveProperty('reports.download');
      expect(appRouter._def.procedures).toHaveProperty('reports.getTemplates');
      expect(appRouter._def.procedures).toHaveProperty('reports.scheduleReport');
    });

    it('should enforce authentication on all endpoints', async () => {
      const ctx = await createTRPCContext({
        req: new Request('http://localhost:3000'),
        resHeaders: new Headers(),
      });

      caller = appRouter.createCaller(ctx);

      // All endpoints should reject unauthenticated requests
      await expect(
        caller.reports.generate({
          reportType: 'revenue',
          parameters: {},
          format: 'pdf',
        })
      ).rejects.toThrow();

      await expect(
        caller.reports.download({ reportId: 'test' })
      ).rejects.toThrow();

      await expect(caller.reports.getTemplates()).rejects.toThrow();

      await expect(
        caller.reports.scheduleReport({
          name: 'Test',
          reportType: 'platform_revenue',
          frequency: 'DAILY',
          recipients: ['test@example.com'],
          formats: ['PDF'],
          schedule: { hour: 9, minute: 0, timezone: 'America/New_York' },
          deliveryOptions: {
            emailDelivery: true,
            secureDownload: true,
            attachToEmail: false,
            downloadExpiration: 168,
          },
        })
      ).rejects.toThrow();
    });
  });
});
