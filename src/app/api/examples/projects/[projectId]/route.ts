/**
 * Example API Route: Resource with Ownership Check
 * Demonstrates authentication + ownership verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireOwnership } from '@/lib/middleware';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // Authenticate user
    const { user } = await requireAuth(req);

    // Verify ownership of the project
    await requireOwnership(user, 'project', params.projectId);

    // User has access to this project
    return NextResponse.json({
      message: 'Access granted',
      projectId: params.projectId,
    });
  } catch (error) {
    const err = error as any;
    
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'You do not have access to this project' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
