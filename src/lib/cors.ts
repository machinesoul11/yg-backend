/**
 * CORS Configuration Utility
 * 
 * Centralized CORS handling for the YesGoddess Backend API
 * Ensures proper cross-origin request handling between frontend and backend domains
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Get the list of allowed origins from environment variables
 */
export const getAllowedOrigins = (): string[] => {
  // Get allowed origins from environment variable (comma-separated)
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean);
  
  if (envOrigins && envOrigins.length > 0) {
    return envOrigins;
  }

  // Fallback to individual environment variables
  const origins = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[];

  // If no environment variables are set, use production defaults
  if (origins.length === 0) {
    return [
      'https://www.yesgoddess.agency',
      'https://yesgoddess.agency',
      'https://ops.yesgoddess.agency',
    ];
  }

  return origins;
};

/**
 * Normalize an origin by removing trailing slashes
 */
const normalizeOrigin = (origin: string): string => {
  return origin.replace(/\/$/, '');
};

/**
 * Check if an origin is allowed
 */
export const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

  return normalizedAllowedOrigins.includes(normalizedOrigin);
};

/**
 * Get the allowed origin to return in CORS headers
 * If the request origin is allowed, return it; otherwise return the first allowed origin
 */
export const getAllowedOrigin = (origin: string | null): string => {
  if (origin && isOriginAllowed(origin)) {
    return origin;
  }

  // Return the first allowed origin as default
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins[0] || 'https://www.yesgoddess.agency';
};

/**
 * Get standard CORS headers for API responses
 */
export const getCorsHeaders = (origin: string | null): Record<string, string> => {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'apikey',
      'x-client-info',
      'x-trpc-source',
    ].join(', '),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Range, X-Content-Range',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
};

/**
 * Handle CORS preflight (OPTIONS) requests
 * Returns a 204 No Content response with appropriate CORS headers
 */
export const handleCorsPreflightRequest = (req: NextRequest): NextResponse => {
  const origin = req.headers.get('origin');
  
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
};

/**
 * Add CORS headers to an existing NextResponse
 */
export const addCorsHeaders = (
  response: NextResponse | Response,
  origin: string | null
): NextResponse => {
  const corsHeaders = getCorsHeaders(origin);
  
  // If it's already a NextResponse, modify it directly
  if (response instanceof NextResponse) {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // Clone the Response to create a new NextResponse with CORS headers
  const newResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
};

/**
 * Create a JSON response with CORS headers
 */
export const corsJsonResponse = (
  data: unknown,
  origin: string | null,
  status: number = 200
): NextResponse => {
  const response = NextResponse.json(data, { status });
  return addCorsHeaders(response, origin);
};

/**
 * Create an error response with CORS headers
 */
export const corsErrorResponse = (
  error: string,
  origin: string | null,
  status: number = 500
): NextResponse => {
  return corsJsonResponse({ error }, origin, status);
};

/**
 * Middleware wrapper to add CORS headers to any Next.js API route handler
 * 
 * @example
 * ```typescript
 * export const GET = withCors(async (req: NextRequest) => {
 *   return NextResponse.json({ data: 'hello' });
 * });
 * ```
 */
export const withCors = (
  handler: (req: NextRequest, ...args: any[]) => Promise<Response | NextResponse>
) => {
  return async (req: NextRequest, ...args: any[]): Promise<NextResponse> => {
    const origin = req.headers.get('origin');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return handleCorsPreflightRequest(req);
    }

    // Execute the handler
    const response = await handler(req, ...args);

    // Add CORS headers to the response
    return addCorsHeaders(response, origin);
  };
};
