import { createTRPCRouter } from '@/lib/trpc';
import { authRouter } from './routers/auth.router';
import { oauthRouter } from './routers/oauth.router';
import { auditRouter } from './routers/audit.router';
import { rolesRouter } from './routers/roles.router';
import { permissionsRouter } from './routers/permissions.router';
import { adminUsersRouter } from './routers/admin-users.router';
import { adminSecurityRouter } from './routers/admin-security.router';
import { sms2FARouter } from './routers/sms-2fa.router';
import { sessionRouter } from './routers/session.router';
import { securityRouter } from './routers/security.router';
import { systemRouter } from '@/modules/system';
import { emailCampaignsRouter, emailCampaignsEnhancedRouter } from '@/modules/email-campaigns';
import { projectsRouter } from '@/modules/projects';
import { ipAssetsRouter } from '@/modules/ip';
import { ipOwnershipRouter } from '@/modules/ip/routers/ip-ownership.router';
import { messagesRouter } from '@/modules/messages';
import { licensesRouter } from '@/modules/licenses';
import { payoutsRouter } from '@/modules/payouts';
import { taxComplianceRouter } from '@/modules/tax-compliance/router';
import { reportsRouter } from '@/modules/reports/router';
import { blogRouter, blogSEORouter, contentOptimizationRouter } from '@/modules/blog';
import { seoManagementRouter } from '@/modules/seo';
import { postAnalyticsRouter, platformAnalyticsRouter, eventIngestionRouter } from '@/modules/analytics';
import { searchRouter } from '@/modules/search';
import { creatorsRouter } from '@/modules/creators/routers/creators.router';
import { creatorAnalyticsRouter } from '@/modules/creators/routers/creator-analytics.router';
import { brandsRouter, brandAnalyticsRouter } from '@/modules/brands';

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
  permissions: permissionsRouter,
  adminUsers: adminUsersRouter,
  adminSecurity: adminSecurityRouter,
  sms2FA: sms2FARouter,
  session: sessionRouter,
  security: securityRouter,
  system: systemRouter,
  emailCampaigns: emailCampaignsRouter,
  emailCampaignsEnhanced: emailCampaignsEnhancedRouter,
  projects: projectsRouter,
  ipAssets: ipAssetsRouter,
  ipOwnership: ipOwnershipRouter,
  messages: messagesRouter,
  licenses: licensesRouter,
  payouts: payoutsRouter,
  taxCompliance: taxComplianceRouter,
  reports: reportsRouter,
  blog: blogRouter,
  blogSEO: blogSEORouter,
  contentOptimization: contentOptimizationRouter,
  seo: seoManagementRouter,
  postAnalytics: postAnalyticsRouter,
  platformAnalytics: platformAnalyticsRouter,
  search: searchRouter,
  creators: creatorsRouter,
  creatorAnalytics: creatorAnalyticsRouter,
  brands: brandsRouter,
  brandAnalytics: brandAnalyticsRouter,
  analytics: createTRPCRouter({
    eventIngestion: eventIngestionRouter,
  }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
