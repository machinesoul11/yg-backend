import { createTRPCRouter } from '@/lib/trpc';
import { authRouter } from './routers/auth.router';
import { oauthRouter } from './routers/oauth.router';
import { auditRouter } from './routers/audit.router';
import { rolesRouter } from './routers/roles.router';
import { systemRouter } from '@/modules/system';
import { emailCampaignsRouter, emailCampaignsEnhancedRouter } from '@/modules/email-campaigns';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  oauth: oauthRouter,
  audit: auditRouter,
  roles: rolesRouter,
  system: systemRouter,
  emailCampaigns: emailCampaignsRouter,
  emailCampaignsEnhanced: emailCampaignsEnhancedRouter,
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
