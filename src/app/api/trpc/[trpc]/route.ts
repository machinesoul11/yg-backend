import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest, NextResponse } from 'next/server';
import { appRouter } from '@/lib/api/root';
import { createTRPCContext } from '@/lib/trpc';

// CORS helper to get allowed origin
const getAllowedOrigin = (origin: string | null): string => {
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://www.yesgoddess.agency',
    process.env.NEXT_PUBLIC_APP_URL || 'https://ops.yesgoddess.agency',
  ];

  // Normalize origins by removing trailing slashes for comparison
  const normalizedOrigin = origin?.replace(/\/$/, '') || '';
  const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));
  const isAllowedOrigin = normalizedAllowedOrigins.includes(normalizedOrigin);

  return isAllowedOrigin && origin ? origin : allowedOrigins[0];
};

// CORS headers generator
const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': getAllowedOrigin(origin),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trpc-source',
  'Access-Control-Allow-Credentials': 'true',
});

const handler = async (req: NextRequest) => {
  const origin = req.headers.get('origin');
  
  const response = await fetchRequestHandler({
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

  // Clone the response to add CORS headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  // Add CORS headers to the response
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
};

// Handle CORS preflight requests
const handleOptions = (req: NextRequest) => {
  const origin = req.headers.get('origin');

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(origin),
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
};

export { handler as GET, handler as POST, handleOptions as OPTIONS };
