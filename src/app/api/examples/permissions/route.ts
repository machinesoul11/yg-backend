/**
 * Example API Route: Permission-Based Access
 * Demonstrates authentication + permission checking
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/middleware';
import { PERMISSIONS } from '@/lib/constants/permissions';

export async function GET(req: NextRequest) {
  try {
    // Require specific permission
    const { user } = await withPermission(req, [PERMISSIONS.PROJECTS_VIEW_ALL]);

    // User has the required permission
    return NextResponse.json({
      message: 'Permission granted',
      userId: user.id,
    });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    if (err.code === 'INSUFFICIENT_PERMISSIONS' || err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'You do not have permission to view all projects' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
