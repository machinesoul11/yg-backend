/**
 * Example API Route: Service-to-Service Authentication
 * Demonstrates internal service authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireServiceAuth } from '@/lib/middleware';

export async function POST(req: NextRequest) {
  try {
    // Require service authentication
    // Only allow specific services
    const { serviceId } = await requireServiceAuth(req, [
      'analytics-processor',
      'background-job',
    ]);

    const body = await req.json();

    // Process service request
    return NextResponse.json({
      message: 'Service request processed',
      serviceId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Service authentication required' },
        { status: 401 }
      );
    }
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'Service not authorized for this endpoint' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
