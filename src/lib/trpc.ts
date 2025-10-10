import { initTRPC, TRPCError } from '@trpc/server';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { ZodError } from 'zod';

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
  // TODO: Add session management when NextAuth is configured
  // For now, return basic context
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
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
 * 
 * TODO: Implement authentication once NextAuth is configured
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  // TODO: Uncomment when NextAuth is set up
  // if (!ctx.session || !ctx.session.user) {
  //   throw new TRPCError({ code: 'UNAUTHORIZED' });
  // }
  return next({
    ctx,
  });
});

/**
 * Admin-only procedure
 *
 * If you want a query or mutation to ONLY be accessible to admin users, use this.
 * 
 * TODO: Implement authentication once NextAuth is configured
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  // TODO: Uncomment when NextAuth is set up
  // if (ctx.session.user.role !== 'admin') {
  //   throw new TRPCError({ code: 'FORBIDDEN' });
  // }
  return next({ ctx });
});

/**
 * Manager or Admin procedure
 *
 * If you want a query or mutation to be accessible to managers and admins, use this.
 * 
 * TODO: Implement authentication once NextAuth is configured
 */
export const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  // TODO: Uncomment when NextAuth is set up
  // if (!['admin', 'manager'].includes(ctx.session.user.role)) {
  //   throw new TRPCError({ code: 'FORBIDDEN' });
  // }
  return next({ ctx });
});
