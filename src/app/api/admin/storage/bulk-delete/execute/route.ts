/**
 * Bulk Delete Execute API Route
 * 
 * Admin endpoint to execute bulk file deletion
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
 * POST /api/admin/storage/bulk-delete/execute
 * 
 * Execute bulk delete operation
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
    const { assetIds, filterCriteria, skipConfirmation = false } = body;

    const result = await fileManagementService.executeBulkDelete({
      assetIds,
      filterCriteria,
      userId: session.user.id,
      userRole: session.user.role as UserRole,
      skipConfirmation,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Bulk delete execution failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute bulk delete',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
