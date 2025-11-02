import { initTRPC, TRPCError } from '@trpc/server';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { SecurityContext } from '@/lib/security/row-level-security';
import {
  getIpAssetSecurityFilter,
  getProjectSecurityFilter,
  getLicenseSecurityFilter,
  getRoyaltyStatementSecurityFilter,
  getPayoutSecurityFilter,
  getBrandSecurityFilter,
  getCreatorSecurityFilter,
  applySecurityFilter,
} from '@/lib/security/row-level-security';

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 */
export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  // Get the session from Auth.js with error handling
  let session = null;
  
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    console.error('[tRPC Context] Session error:', error);
    
    // If it's a JWT decryption error, log detailed info
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as Error).message;
      if (message.includes('decryption')) {
        console.error('[tRPC Context] JWT decryption failed - possible secret mismatch or cookie issue');
        console.error('[tRPC Context] NEXTAUTH_SECRET length:', process.env.NEXTAUTH_SECRET?.length);
        console.error('[tRPC Context] NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
      }
    }
    
    // Continue without session instead of crashing
    session = null;
  }
  
  // Build security context if user is authenticated
  let securityContext: SecurityContext | undefined;
  
  if (session?.user) {
    // Fetch creator and brand IDs if they exist
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        creator: { select: { id: true } },
        brand: { select: { id: true } },
      },
    });

    if (user) {
      securityContext = {
        userId: user.id,
        role: user.role,
        creatorId: user.creator?.id,
        brandId: user.brand?.id,
      };
    }
  }
  
  return {
    session,
    req: opts.req,
    resHeaders: opts.resHeaders,
    db: prisma,
    securityContext,
    // Security filter helpers
    securityFilters: {
      ipAsset: securityContext ? () => getIpAssetSecurityFilter(securityContext) : () => ({}),
      project: securityContext ? () => getProjectSecurityFilter(securityContext) : () => ({}),
      license: securityContext ? () => getLicenseSecurityFilter(securityContext) : () => ({}),
      royaltyStatement: securityContext ? () => getRoyaltyStatementSecurityFilter(securityContext) : () => ({}),
      payout: securityContext ? () => getPayoutSecurityFilter(securityContext) : () => ({}),
      brand: securityContext ? () => getBrandSecurityFilter(securityContext) : () => ({}),
      creator: securityContext ? () => getCreatorSecurityFilter(securityContext) : () => ({}),
      apply: <T extends Record<string, any>>(
        filterType: 'ipAsset' | 'project' | 'license' | 'royaltyStatement' | 'payout' | 'brand' | 'creator',
        existingWhere?: T
      ) => securityContext ? applySecurityFilter(securityContext, filterType, existingWhere) : existingWhere || {},
    },
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller for the tRPC API. This is used in
 * - Next.js App Router server components
 * - API routes
 * - Server-side rendering
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  // Better error messaging
  if (!ctx.session) {
    throw new TRPCError({ 
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in again.',
      cause: 'NO_SESSION'
    });
  }
  
  if (!ctx.session.user) {
    throw new TRPCError({ 
      code: 'UNAUTHORIZED',
      message: 'Invalid session. Please sign in again.',
      cause: 'NO_USER'
    });
  }
  
  return next({
    ctx: {
      ...ctx,
      // Ensure session is defined for protected procedures
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

/**
 * Admin-only procedure
 *
 * If you want a query or mutation to ONLY be accessible to admin users, use this.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

/**
 * Creator-only procedure
 *
 * If you want a query or mutation to ONLY be accessible to creator users, use this.
 */
export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'CREATOR') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This action requires Creator role',
    });
  }
  return next({ ctx });
});

/**
 * Brand-only procedure
 *
 * If you want a query or mutation to ONLY be accessible to brand users, use this.
 */
export const brandProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'BRAND') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This action requires Brand role',
    });
  }
  return next({ ctx });
});

/**
 * Creator or Brand procedure
 *
 * Accessible to both CREATOR and BRAND roles (content producers and consumers)
 */
export const creatorOrBrandProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['CREATOR', 'BRAND'].includes(ctx.session.user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This action requires Creator or Brand role',
    });
  }
  return next({ ctx });
});

/**
 * Manager or Admin procedure
 *
 * If you want a query or mutation to be accessible to managers and admins, use this.
 */
export const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['ADMIN', 'CREATOR'].includes(ctx.session.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

/**
 * Create a procedure that requires specific permission(s)
 * This provides fine-grained authorization beyond role-based access
 * 
 * @example
 * import { PERMISSIONS } from '@/lib/constants/permissions';
 * import { requirePermission } from '@/lib/middleware/permissions';
 * 
 * const listAllUsers = protectedProcedure
 *   .use(requirePermission(PERMISSIONS.USERS_VIEW_ALL))
 *   .query(async ({ ctx }) => {
 *     // Only users with USERS_VIEW_ALL permission can execute this
 *     return await prisma.user.findMany();
 *   });
 */
