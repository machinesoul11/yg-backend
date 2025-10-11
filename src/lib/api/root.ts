import { createTRPCRouter } from '@/lib/trpc';
import { authRouter } from './routers/auth.router';
import { auditRouter } from './routers/audit.router';
import { systemRouter } from '@/modules/system';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  audit: auditRouter,
  system: systemRouter,
  // Add your routers here
  // Example:
  // ip: ipRouter,
  // licenses: licensesRouter,
  // royalties: royaltiesRouter,
  // talent: talentRouter,
  // brands: brandsRouter,
  // analytics: analyticsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
