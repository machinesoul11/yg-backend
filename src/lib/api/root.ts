import { createTRPCRouter } from '@/lib/trpc';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
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
