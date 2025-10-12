/**
 * Asset Quality Validation Job
 * 
 * Performs comprehensive quality validation on assets:
 * - Technical quality checks (resolution, bitrate, format)
 * - Brand guideline compliance (contrast, sharpness)
 * - Quality scoring (0-100)
 * - Auto-approval for high-quality assets
 * - Flagging for manual review when needed
 * 
 * Runs after virus scan and metadata extraction complete
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { AssetType, AssetStatus } from '@prisma/client';
import {
  validateAssetQuality,
  type QualityValidationResult,
} from '@/lib/services/asset-processing/quality-validation.service';

export interface QualityValidationJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
}

export async function qualityValidationJob(
  job: Job<QualityValidationJobData>
) {
  const { assetId, storageKey, type, mimeType } = job.data;

  try {
    job.log(`Starting quality validation for asset ${assetId} (${type})`);

    // Get asset details including metadata
    const asset = await prisma.ipAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        type: true,
        fileSize: true,
        metadata: true,
        status: true,
      },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // Download file from storage for quality analysis
    job.log(`Downloading file for quality analysis: ${storageKey}`);
    const { url: downloadUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900, // 15 minutes
    });

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    // Extract additional parameters from metadata if needed
    const metadata = asset.metadata as any;
    const additionalParams: any = {};

    if (type === 'DOCUMENT') {
      additionalParams.pageCount = metadata?.technical?.pageCount || 1;
      additionalParams.fileSize = Number(asset.fileSize);
    }

    // Perform quality validation
    job.log('Running quality validation checks');
    const validationResult: QualityValidationResult = await validateAssetQuality(
      fileBuffer,
      type,
      additionalParams
    );

    job.log(
      `Quality validation complete. Score: ${validationResult.overallScore}/100, Status: ${validationResult.overallStatus}`
    );

    // Log individual check results
    for (const check of validationResult.checks) {
      const status = check.passed ? '✓' : '✗';
      job.log(
        `  ${status} ${check.check}: ${check.message} (score: ${check.score}/100)`
      );
    }

    // Determine next status based on validation result
    let newStatus: AssetStatus = asset.status;
    
    if (validationResult.overallStatus === 'approved' && validationResult.autoApprove) {
      // Auto-approve high-quality assets
      newStatus = AssetStatus.APPROVED;
      job.log(`Asset auto-approved based on quality score ${validationResult.overallScore}/100`);
    } else if (validationResult.overallStatus === 'review_needed') {
      // Flag for manual review
      newStatus = AssetStatus.REVIEW;
      job.log(`Asset flagged for manual review (quality score: ${validationResult.overallScore}/100)`);
    } else if (validationResult.overallStatus === 'rejected') {
      // Auto-reject poor quality assets
      newStatus = AssetStatus.REJECTED;
      job.log(`Asset auto-rejected due to quality issues (score: ${validationResult.overallScore}/100)`);
    }

    // Update asset with validation results
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        status: newStatus,
        metadata: {
          ...(metadata || {}),
          qualityValidation: {
            score: validationResult.overallScore,
            status: validationResult.overallStatus,
            autoApproved: validationResult.autoApprove,
            checks: validationResult.checks,
            recommendations: validationResult.recommendations,
            validatedAt: new Date().toISOString(),
          },
        },
      },
    });

    job.log(`Asset status updated to: ${newStatus}`);

    // If recommendations exist, log them
    if (validationResult.recommendations.length > 0) {
      job.log('Quality recommendations:');
      for (const recommendation of validationResult.recommendations) {
        job.log(`  - ${recommendation}`);
      }
    }

    return {
      success: true,
      qualityScore: validationResult.overallScore,
      status: validationResult.overallStatus,
      autoApproved: validationResult.autoApprove,
      checksCount: validationResult.checks.length,
      recommendationsCount: validationResult.recommendations.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Quality validation failed: ${errorMessage}`);

    // Update asset with error information
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          qualityValidation: {
            error: errorMessage,
            failedAt: new Date().toISOString(),
          },
        },
      },
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
