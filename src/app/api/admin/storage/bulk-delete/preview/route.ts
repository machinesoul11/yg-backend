/**
 * Bulk Delete API Route
 * 
 * Admin endpoint for bulk file deletion with safeguards
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
 * POST /api/admin/storage/bulk-delete/preview
 * 
 * Preview what would be deleted in a bulk operation
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
    const { assetIds, filterCriteria } = body;

    const preview = await fileManagementService.previewBulkDelete({
      assetIds,
      filterCriteria,
      userId: session.user.id,
      userRole: session.user.role as UserRole,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...preview,
        totalSizeBytes: preview.totalSizeBytes.toString(), // Serialize BigInt
        assetsToDelete: preview.assetsToDelete.map((asset) => ({
          ...asset,
          fileSize: asset.fileSize.toString(),
        })),
      },
    });
  } catch (error) {
    console.error('Bulk delete preview failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate bulk delete preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
