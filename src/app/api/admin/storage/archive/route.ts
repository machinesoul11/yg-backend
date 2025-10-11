/**
 * Archive API Route
 * 
 * Admin endpoints for archiving and unarchiving assets
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
 * POST /api/admin/storage/archive
 * 
 * Archive one or more assets
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
    const { assetId, assetIds, reason, metadata } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'Archive reason is required' },
        { status: 400 }
      );
    }

    const result = await fileManagementService.archiveAssets({
      assetId,
      assetIds,
      reason,
      userId: session.user.id,
      metadata,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Archive operation failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to archive assets',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/storage/archive
 * 
 * Get archived assets
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await fileManagementService.getArchivedAssets({
      userId,
      projectId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        assets: result.assets.map((asset: any) => ({
          ...asset,
          fileSize: asset.fileSize.toString(),
        })),
      },
    });
  } catch (error) {
    console.error('Get archived assets failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve archived assets',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
