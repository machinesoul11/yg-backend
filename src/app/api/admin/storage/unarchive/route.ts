/**
 * Unarchive API Route
 * 
 * Admin endpoint for unarchiving assets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { FileManagementService } from '@/lib/storage/file-management';
import { UserRole } from '@prisma/client';

const fileManagementService = new FileManagementService(prisma, storageProvider);

/**
 * POST /api/admin/storage/unarchive
 * 
 * Unarchive one or more assets
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { assetId, assetIds } = body;

    const result = await fileManagementService.unarchiveAssets({
      assetId,
      assetIds,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Unarchive operation failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to unarchive assets',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
