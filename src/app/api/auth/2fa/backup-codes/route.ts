/**
 * GET /api/auth/2fa/backup-codes
 * View remaining backup codes for the authenticated user
 * Returns a list of unused backup codes (masked for security)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isAuthError } from '@/lib/errors/auth.errors';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to view backup codes',
          },
        },
        { status: 401 }
      );
    }

    // Get user and backup codes
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        two_factor_enabled: true,
        twoFactorBackupCodes: {
          where: { used: false },
          select: {
            id: true,
            code: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        },
        { status: 404 }
      );
    }

    if (!user.two_factor_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TWO_FACTOR_NOT_ENABLED',
            message: 'Two-factor authentication is not enabled for this account',
          },
        },
        { status: 400 }
      );
    }

    // Note: Backup codes are stored as hashes, so we cannot display them
    // This endpoint returns metadata about backup codes, not the codes themselves
    const backupCodesInfo = user.twoFactorBackupCodes.map((bc, index) => ({
      id: bc.id,
      label: `Backup Code ${index + 1}`,
      maskedCode: `****-****-****`, // All codes are masked since they're hashed
      created: bc.createdAt,
      status: 'unused',
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          total: user.twoFactorBackupCodes.length,
          codes: backupCodesInfo,
          message: 'Backup codes are securely stored and cannot be displayed after initial generation',
          note: 'If you have lost your backup codes, you can regenerate them (this will invalidate all existing codes)',
          recommendations: {
            regenerate: user.twoFactorBackupCodes.length < 3
              ? 'You have less than 3 backup codes remaining. Consider regenerating them.'
              : null,
            lowCodes: user.twoFactorBackupCodes.length <= 2
              ? `Warning: Only ${user.twoFactorBackupCodes.length} backup code(s) remaining`
              : null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Backup codes retrieval error:', error);

    if (isAuthError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
          },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve backup codes',
        },
      },
      { status: 500 }
    );
  }
}
