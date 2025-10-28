import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest } from 'next/server';
import { appRouter } from '@/lib/api/root';
import { createTRPCContext } from '@/lib/trpc';
import { addCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';

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

  // Add CORS headers to the response using centralized utility
  return addCorsHeaders(response, origin);
};

// Handle CORS preflight requests using centralized utility
const handleOptions = (req: NextRequest) => {
  return handleCorsPreflightRequest(req);
};

export { handler as GET, handler as POST, handleOptions as OPTIONS };
