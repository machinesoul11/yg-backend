import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest, NextResponse } from 'next/server';
import { appRouter } from '@/lib/api/root';
import { createTRPCContext } from '@/lib/trpc';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: (opts) => createTRPCContext(opts),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`,
            );
          }
        : undefined,
  });

// Handle CORS preflight requests
const handleOptions = (req: NextRequest) => {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://www.yesgoddess.agency',
    process.env.NEXT_PUBLIC_APP_URL || 'https://ops.yesgoddess.agency',
  ];

  const isAllowedOrigin = allowedOrigins.includes(origin);

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trpc-source',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
};

export { handler as GET, handler as POST, handleOptions as OPTIONS };
