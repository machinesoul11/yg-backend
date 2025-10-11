/**
 * Example API Route: Protected Admin Endpoint
 * Demonstrates authentication + role-based authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    const { user } = await requireAdmin(req);

    // User is guaranteed to be authenticated and have ADMIN role
    return NextResponse.json({
      message: 'Admin access granted',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    if (err.code === 'ROLE_REQUIRED' || err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
