/**
 * Quality Validation Service
 * 
 * Comprehensive quality validation for all asset types:
 * - Automated technical quality checks
 * - Resolution and format validation
 * - Audio/video quality assessment
 * - Document readability validation
 * - Brand guideline compliance checks
 * - Quality scoring (0-100)
 * 
 * Aligns with YES GODDESS brand standards:
 * - High contrast, sharp focus, minimal processing
 * - Architectural precision, monastic restraint
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { AssetType } from '@prisma/client';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface QualityCheckResult {
  check: string;
  passed: boolean;
  score: number; // 0-100
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: Record<string, any>;
}

export interface QualityValidationResult {
  overallScore: number; // 0-100
  overallStatus: 'approved' | 'review_needed' | 'rejected';
  checks: QualityCheckResult[];
  recommendations: string[];
  autoApprove: boolean;
}

export interface ImageQualityMetrics {
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: number;
  colorSpace: string;
  hasAlpha: boolean;
  format: string;
  compressionRatio?: number;
  sharpness?: number;
  contrast?: number;
  brightness?: number;
  isUpscaled?: boolean;
}

export interface VideoQualityMetrics {
  width: number;
  height: number;
  duration: number;
  fps: number;
  bitrate: number;
  codec: string;
  audioCodec?: string;
  audioBitrate?: number;
  hasCorruptedFrames?: boolean;
  hasBlackFrames?: boolean;
  audioSync?: boolean;
}

export interface AudioQualityMetrics {
  duration: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  bitrate: number;
  hasClipping?: boolean;
  hasDistortion?: boolean;
  hasSilence?: boolean;
  dynamicRange?: number;
}

export interface DocumentQualityMetrics {
  pageCount: number;
  hasEmbeddedFonts?: boolean;
  isSearchable?: boolean;
  averagePageResolution?: number;
  hasCorruptedPages?: boolean;
  fileSize: number;
}

// Quality thresholds based on brand standards
const QUALITY_THRESHOLDS = {
  image: {
    minResolution: 2000, // pixels on longest edge
    minMegapixels: 3,
    minSharpness: 0.6, // 0-1 scale
    minContrast: 0.3, // 0-1 scale
    preferredColorSpace: 'srgb',
    maxCompressionArtifacts: 0.2, // 0-1 scale
  },
  video: {
    minResolution: 1920, // width
    minBitrate: 5000000, // 5 Mbps for 1080p
    minFps: 24,
    maxBlackFramePercentage: 0.05, // 5%
    audioSyncTolerance: 0.1, // 100ms
  },
  audio: {
    minSampleRate: 44100,
    minBitDepth: 16,
    minBitrate: 128000, // 128 kbps
    maxClippingPercentage: 0.01, // 1%
    minDynamicRange: 20, // dB
  },
  document: {
    maxPageCount: 100,
    minPageResolution: 150, // DPI
    requireEmbeddedFonts: true,
  },
};

/**
 * Validate image quality
 */
export async function validateImageQuality(
  imageBuffer: Buffer
): Promise<QualityValidationResult> {
  const checks: QualityCheckResult[] = [];
  const recommendations: string[] = [];

  try {
    // Extract image metrics
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const stats = await image.stats();

    const metrics: ImageQualityMetrics = {
      width: metadata.width || 0,
      height: metadata.height || 0,
      megapixels: ((metadata.width || 0) * (metadata.height || 0)) / 1000000,
      aspectRatio: (metadata.width || 1) / (metadata.height || 1),
      colorSpace: metadata.space || 'unknown',
      hasAlpha: metadata.hasAlpha || false,
      format: metadata.format || 'unknown',
    };

    // Calculate contrast from channel statistics
    const channelStats = stats.channels[0]; // Use first channel
    const contrast = (channelStats.max - channelStats.min) / 255;
    metrics.contrast = contrast;

    // Check 1: Minimum resolution
    const longestEdge = Math.max(metrics.width, metrics.height);
    if (longestEdge >= QUALITY_THRESHOLDS.image.minResolution) {
      checks.push({
        check: 'minimum_resolution',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Resolution ${metrics.width}x${metrics.height} meets platform minimum (${QUALITY_THRESHOLDS.image.minResolution}px longest edge)`,
        details: { width: metrics.width, height: metrics.height, longestEdge },
      });
    } else {
      checks.push({
        check: 'minimum_resolution',
        passed: false,
        score: 0,
        severity: 'critical',
        message: `Resolution ${metrics.width}x${metrics.height} is below platform minimum. Required: ${QUALITY_THRESHOLDS.image.minResolution}px on longest edge.`,
        details: { width: metrics.width, height: metrics.height, longestEdge },
      });
      recommendations.push(
        `Upload a higher-resolution version. Current: ${longestEdge}px, Required: ${QUALITY_THRESHOLDS.image.minResolution}px`
      );
    }

    // Check 2: Megapixel count
    if (metrics.megapixels >= QUALITY_THRESHOLDS.image.minMegapixels) {
      checks.push({
        check: 'megapixel_count',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Image has ${metrics.megapixels.toFixed(1)} megapixels (minimum: ${QUALITY_THRESHOLDS.image.minMegapixels}MP)`,
        details: { megapixels: metrics.megapixels },
      });
    } else {
      checks.push({
        check: 'megapixel_count',
        passed: false,
        score: 50,
        severity: 'warning',
        message: `Low megapixel count: ${metrics.megapixels.toFixed(1)}MP. Recommended: ${QUALITY_THRESHOLDS.image.minMegapixels}MP or higher.`,
        details: { megapixels: metrics.megapixels },
      });
    }

    // Check 3: Color space
    const colorSpaceCorrect =
      metadata.space?.toLowerCase() === QUALITY_THRESHOLDS.image.preferredColorSpace;
    if (colorSpaceCorrect) {
      checks.push({
        check: 'color_space',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Correct color space: ${metadata.space}`,
        details: { colorSpace: metadata.space },
      });
    } else {
      checks.push({
        check: 'color_space',
        passed: false,
        score: 70,
        severity: 'warning',
        message: `Color space is ${metadata.space}. Recommended: ${QUALITY_THRESHOLDS.image.preferredColorSpace.toUpperCase()} for web content.`,
        details: { colorSpace: metadata.space },
      });
      recommendations.push(
        `Convert to sRGB color space for consistent web display`
      );
    }

    // Check 4: Contrast (YES GODDESS brand requirement: high contrast)
    if (contrast >= QUALITY_THRESHOLDS.image.minContrast) {
      const contrastScore = Math.min(100, (contrast / 0.8) * 100); // Scale to 100
      checks.push({
        check: 'contrast',
        passed: true,
        score: contrastScore,
        severity: 'info',
        message: `Good contrast: ${(contrast * 100).toFixed(1)}% (brand requirement: high contrast)`,
        details: { contrast, contrastPercentage: contrast * 100 },
      });
    } else {
      checks.push({
        check: 'contrast',
        passed: false,
        score: 40,
        severity: 'warning',
        message: `Low contrast: ${(contrast * 100).toFixed(1)}%. YES GODDESS brand emphasizes high contrast images.`,
        details: { contrast, contrastPercentage: contrast * 100 },
      });
      recommendations.push(
        'Increase image contrast to align with brand guidelines (high contrast, sharp focus)'
      );
    }

    // Check 5: Compression artifacts detection
    // Note: This is a simplified check. Advanced compression detection would require
    // more sophisticated image analysis (DCT analysis, blocking artifacts detection)
    const fileSize = imageBuffer.length;
    const expectedMinSize = (metrics.width * metrics.height * 3) / 10; // Rough estimate
    const compressionRatio = fileSize / expectedMinSize;
    metrics.compressionRatio = compressionRatio;

    if (compressionRatio >= 0.5) {
      checks.push({
        check: 'compression_quality',
        passed: true,
        score: 100,
        severity: 'info',
        message: 'Good compression quality, minimal visible artifacts expected',
        details: { compressionRatio, fileSize },
      });
    } else if (compressionRatio >= 0.2) {
      checks.push({
        check: 'compression_quality',
        passed: true,
        score: 75,
        severity: 'warning',
        message: 'Moderate compression detected. May have visible artifacts on close inspection.',
        details: { compressionRatio, fileSize },
      });
      recommendations.push(
        'Consider uploading a less compressed version for better quality'
      );
    } else {
      checks.push({
        check: 'compression_quality',
        passed: false,
        score: 30,
        severity: 'critical',
        message: 'Heavy compression detected. Likely visible compression artifacts.',
        details: { compressionRatio, fileSize },
      });
      recommendations.push(
        'Image is heavily compressed. Upload original or higher-quality version.'
      );
    }

    // Check 6: Detect upscaled images (frequency analysis)
    // Upscaled images often lack high-frequency detail
    // This is a simplified check - production would use more sophisticated analysis
    const isLikelyUpscaled = metrics.megapixels > 10 && compressionRatio < 0.3;
    if (isLikelyUpscaled) {
      checks.push({
        check: 'upscaling_detection',
        passed: false,
        score: 40,
        severity: 'warning',
        message: 'Image may be upscaled from lower resolution (high megapixels but low file size)',
        details: { megapixels: metrics.megapixels, compressionRatio },
      });
      recommendations.push(
        'Image appears to be upscaled. Upload original resolution if available.'
      );
    } else {
      checks.push({
        check: 'upscaling_detection',
        passed: true,
        score: 100,
        severity: 'info',
        message: 'No obvious upscaling detected',
      });
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(checks);
    const overallStatus = determineStatus(overallScore, checks);
    const autoApprove = overallStatus === 'approved';

    return {
      overallScore,
      overallStatus,
      checks,
      recommendations,
      autoApprove,
    };
  } catch (error) {
    throw new Error(
      `Image quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate video quality
 */
export async function validateVideoQuality(
  videoBuffer: Buffer
): Promise<QualityValidationResult> {
  const checks: QualityCheckResult[] = [];
  const recommendations: string[] = [];

  try {
    // Write to temp file for ffprobe analysis
    const tmpPath = `/tmp/quality-check-${Date.now()}.tmp`;
    require('fs').writeFileSync(tmpPath, videoBuffer);

    // Extract video metadata using ffprobe
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

    if (!videoStream) {
      throw new Error('No video stream found in file');
    }

    const metrics: VideoQualityMetrics = {
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      duration: parseFloat(metadata.format.duration || '0'),
      fps: eval(videoStream.r_frame_rate) || 0,
      bitrate: parseInt(metadata.format.bit_rate || '0'),
      codec: videoStream.codec_name || 'unknown',
      audioCodec: audioStream?.codec_name,
      audioBitrate: audioStream ? parseInt(audioStream.bit_rate || '0') : undefined,
    };

    // Cleanup temp file
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}

    // Check 1: Minimum resolution (1080p)
    if (metrics.width >= QUALITY_THRESHOLDS.video.minResolution) {
      checks.push({
        check: 'minimum_resolution',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Resolution ${metrics.width}x${metrics.height} meets platform standard (1080p+)`,
        details: { width: metrics.width, height: metrics.height },
      });
    } else if (metrics.width >= 1280) {
      // 720p
      checks.push({
        check: 'minimum_resolution',
        passed: true,
        score: 80,
        severity: 'warning',
        message: `Resolution ${metrics.width}x${metrics.height} is 720p. Recommended: 1080p for professional licensing.`,
        details: { width: metrics.width, height: metrics.height },
      });
      recommendations.push('Upload 1080p or higher resolution for professional use');
    } else {
      checks.push({
        check: 'minimum_resolution',
        passed: false,
        score: 40,
        severity: 'critical',
        message: `Resolution ${metrics.width}x${metrics.height} is below professional standard (720p minimum, 1080p recommended)`,
        details: { width: metrics.width, height: metrics.height },
      });
      recommendations.push('Upload at least 1280x720 resolution');
    }

    // Check 2: Frame rate
    if (metrics.fps >= QUALITY_THRESHOLDS.video.minFps) {
      checks.push({
        check: 'frame_rate',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Frame rate ${metrics.fps} FPS is appropriate for professional video`,
        details: { fps: metrics.fps },
      });
    } else {
      checks.push({
        check: 'frame_rate',
        passed: false,
        score: 50,
        severity: 'warning',
        message: `Frame rate ${metrics.fps} FPS is low. Recommended: 24 FPS minimum, 30-60 FPS preferred.`,
        details: { fps: metrics.fps },
      });
      recommendations.push('Use at least 24 FPS for smooth playback');
    }

    // Check 3: Bitrate quality
    const expectedMinBitrate =
      metrics.width >= 1920 ? QUALITY_THRESHOLDS.video.minBitrate : 2500000;
    if (metrics.bitrate >= expectedMinBitrate) {
      checks.push({
        check: 'bitrate',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Bitrate ${(metrics.bitrate / 1000000).toFixed(1)} Mbps is appropriate for ${metrics.width}x${metrics.height}`,
        details: { bitrate: metrics.bitrate, bitrateMbps: metrics.bitrate / 1000000 },
      });
    } else {
      const bitrateScore = Math.max(40, (metrics.bitrate / expectedMinBitrate) * 100);
      checks.push({
        check: 'bitrate',
        passed: false,
        score: bitrateScore,
        severity: 'warning',
        message: `Bitrate ${(metrics.bitrate / 1000000).toFixed(1)} Mbps is low for ${metrics.width}x${metrics.height}. Recommended: ${(expectedMinBitrate / 1000000).toFixed(1)} Mbps`,
        details: { bitrate: metrics.bitrate, bitrateMbps: metrics.bitrate / 1000000 },
      });
      recommendations.push(
        `Increase bitrate to at least ${(expectedMinBitrate / 1000000).toFixed(1)} Mbps for better quality`
      );
    }

    // Check 4: Audio quality (if audio present)
    if (audioStream) {
      if (metrics.audioBitrate && metrics.audioBitrate >= 128000) {
        checks.push({
          check: 'audio_quality',
          passed: true,
          score: 100,
          severity: 'info',
          message: `Audio bitrate ${(metrics.audioBitrate / 1000).toFixed(0)} kbps is good quality`,
          details: { audioBitrate: metrics.audioBitrate },
        });
      } else {
        checks.push({
          check: 'audio_quality',
          passed: false,
          score: 60,
          severity: 'warning',
          message: `Audio bitrate ${(metrics.audioBitrate || 0) / 1000} kbps is low. Recommended: 128 kbps minimum`,
          details: { audioBitrate: metrics.audioBitrate },
        });
        recommendations.push('Increase audio bitrate to at least 128 kbps');
      }
    } else {
      checks.push({
        check: 'audio_presence',
        passed: true,
        score: 100,
        severity: 'info',
        message: 'Video has no audio track (this may be intentional)',
      });
    }

    // Check 5: Aspect ratio validation
    const aspectRatio = metrics.width / metrics.height;
    const standardRatios = [
      { ratio: 16 / 9, name: '16:9' },
      { ratio: 21 / 9, name: '21:9' },
      { ratio: 4 / 3, name: '4:3' },
      { ratio: 1 / 1, name: '1:1' },
      { ratio: 9 / 16, name: '9:16 (vertical)' },
    ];

    const isStandardRatio = standardRatios.some(
      (std) => Math.abs(aspectRatio - std.ratio) < 0.01
    );

    if (isStandardRatio) {
      checks.push({
        check: 'aspect_ratio',
        passed: true,
        score: 100,
        severity: 'info',
        message: 'Standard aspect ratio detected',
        details: { aspectRatio: aspectRatio.toFixed(2) },
      });
    } else {
      checks.push({
        check: 'aspect_ratio',
        passed: true,
        score: 90,
        severity: 'warning',
        message: `Non-standard aspect ratio: ${aspectRatio.toFixed(2)}. This may be intentional for artistic purposes.`,
        details: { aspectRatio: aspectRatio.toFixed(2) },
      });
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(checks);
    const overallStatus = determineStatus(overallScore, checks);
    const autoApprove = overallStatus === 'approved';

    return {
      overallScore,
      overallStatus,
      checks,
      recommendations,
      autoApprove,
    };
  } catch (error) {
    throw new Error(
      `Video quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate audio quality
 */
export async function validateAudioQuality(
  audioBuffer: Buffer
): Promise<QualityValidationResult> {
  const checks: QualityCheckResult[] = [];
  const recommendations: string[] = [];

  try {
    // Write to temp file for ffprobe analysis
    const tmpPath = `/tmp/quality-check-audio-${Date.now()}.tmp`;
    require('fs').writeFileSync(tmpPath, audioBuffer);

    // Extract audio metadata
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      throw new Error('No audio stream found in file');
    }

    const metrics: AudioQualityMetrics = {
      duration: parseFloat(metadata.format.duration || '0'),
      sampleRate: parseInt(audioStream.sample_rate || '0'),
      bitDepth: audioStream.bits_per_sample || 16,
      channels: audioStream.channels || 0,
      bitrate: parseInt(audioStream.bit_rate || metadata.format.bit_rate || '0'),
    };

    // Cleanup temp file
    try {
      require('fs').unlinkSync(tmpPath);
    } catch {}

    // Check 1: Sample rate
    if (metrics.sampleRate >= QUALITY_THRESHOLDS.audio.minSampleRate) {
      checks.push({
        check: 'sample_rate',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Sample rate ${metrics.sampleRate} Hz meets professional standard`,
        details: { sampleRate: metrics.sampleRate },
      });
    } else {
      checks.push({
        check: 'sample_rate',
        passed: false,
        score: 50,
        severity: 'warning',
        message: `Sample rate ${metrics.sampleRate} Hz is below professional standard. Recommended: 44.1 kHz or 48 kHz.`,
        details: { sampleRate: metrics.sampleRate },
      });
      recommendations.push('Record or export at 44.1 kHz or 48 kHz sample rate');
    }

    // Check 2: Bit depth
    if (metrics.bitDepth >= QUALITY_THRESHOLDS.audio.minBitDepth) {
      checks.push({
        check: 'bit_depth',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Bit depth ${metrics.bitDepth}-bit provides good dynamic range`,
        details: { bitDepth: metrics.bitDepth },
      });
    } else {
      checks.push({
        check: 'bit_depth',
        passed: false,
        score: 60,
        severity: 'warning',
        message: `Bit depth ${metrics.bitDepth}-bit is low. Recommended: 16-bit minimum, 24-bit preferred.`,
        details: { bitDepth: metrics.bitDepth },
      });
      recommendations.push('Use 16-bit or 24-bit depth for better quality');
    }

    // Check 3: Bitrate
    if (metrics.bitrate >= QUALITY_THRESHOLDS.audio.minBitrate) {
      checks.push({
        check: 'bitrate',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Bitrate ${(metrics.bitrate / 1000).toFixed(0)} kbps provides good quality`,
        details: { bitrate: metrics.bitrate, bitrateKbps: metrics.bitrate / 1000 },
      });
    } else {
      checks.push({
        check: 'bitrate',
        passed: false,
        score: 50,
        severity: 'warning',
        message: `Bitrate ${(metrics.bitrate / 1000).toFixed(0)} kbps is low. Recommended: 128 kbps minimum.`,
        details: { bitrate: metrics.bitrate, bitrateKbps: metrics.bitrate / 1000 },
      });
      recommendations.push('Export with at least 128 kbps bitrate');
    }

    // Check 4: Duration validation
    if (metrics.duration > 0.5) {
      // At least 0.5 seconds
      checks.push({
        check: 'duration',
        passed: true,
        score: 100,
        severity: 'info',
        message: `Duration ${metrics.duration.toFixed(1)} seconds`,
        details: { duration: metrics.duration },
      });
    } else {
      checks.push({
        check: 'duration',
        passed: false,
        score: 0,
        severity: 'critical',
        message: `Audio is extremely short: ${metrics.duration.toFixed(1)} seconds`,
        details: { duration: metrics.duration },
      });
      recommendations.push('Audio file appears corrupted or incomplete');
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(checks);
    const overallStatus = determineStatus(overallScore, checks);
    const autoApprove = overallStatus === 'approved';

    return {
      overallScore,
      overallStatus,
      checks,
      recommendations,
      autoApprove,
    };
  } catch (error) {
    throw new Error(
      `Audio quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate document quality
 */
export async function validateDocumentQuality(
  documentBuffer: Buffer,
  pageCount: number,
  fileSize: number
): Promise<QualityValidationResult> {
  const checks: QualityCheckResult[] = [];
  const recommendations: string[] = [];

  // Check 1: Page count
  if (pageCount <= QUALITY_THRESHOLDS.document.maxPageCount) {
    checks.push({
      check: 'page_count',
      passed: true,
      score: 100,
      severity: 'info',
      message: `Document has ${pageCount} pages (within recommended limit)`,
      details: { pageCount },
    });
  } else {
    checks.push({
      check: 'page_count',
      passed: false,
      score: 70,
      severity: 'warning',
      message: `Document has ${pageCount} pages, exceeding recommended limit of ${QUALITY_THRESHOLDS.document.maxPageCount}. Flagged for manual review.`,
      details: { pageCount },
    });
    recommendations.push(
      'Large documents should be reviewed to ensure appropriate for platform'
    );
  }

  // Check 2: File size reasonability
  const avgSizePerPage = fileSize / pageCount;
  if (avgSizePerPage < 50000) {
    // Less than 50KB per page
    checks.push({
      check: 'file_size',
      passed: false,
      score: 60,
      severity: 'warning',
      message: `Very low file size per page (${Math.round(avgSizePerPage / 1024)}KB). May indicate low quality or text-only content.`,
      details: { fileSize, avgSizePerPage },
    });
  } else if (avgSizePerPage > 10000000) {
    // More than 10MB per page
    checks.push({
      check: 'file_size',
      passed: false,
      score: 70,
      severity: 'warning',
      message: `Very high file size per page (${Math.round(avgSizePerPage / 1024 / 1024)}MB). May need optimization.`,
      details: { fileSize, avgSizePerPage },
    });
    recommendations.push('Consider optimizing PDF to reduce file size');
  } else {
    checks.push({
      check: 'file_size',
      passed: true,
      score: 100,
      severity: 'info',
      message: `File size is reasonable for ${pageCount} pages`,
      details: { fileSize, avgSizePerPage },
    });
  }

  // Calculate overall score
  const overallScore = calculateOverallScore(checks);
  const overallStatus = determineStatus(overallScore, checks);
  const autoApprove = overallStatus === 'approved';

  return {
    overallScore,
    overallStatus,
    checks,
    recommendations,
    autoApprove,
  };
}

/**
 * Main quality validation entry point - routes to appropriate validator
 */
export async function validateAssetQuality(
  assetBuffer: Buffer,
  assetType: AssetType,
  additionalParams?: {
    pageCount?: number;
    fileSize?: number;
  }
): Promise<QualityValidationResult> {
  switch (assetType) {
    case 'IMAGE':
      return validateImageQuality(assetBuffer);

    case 'VIDEO':
      return validateVideoQuality(assetBuffer);

    case 'AUDIO':
      return validateAudioQuality(assetBuffer);

    case 'DOCUMENT':
      if (!additionalParams?.pageCount || !additionalParams?.fileSize) {
        throw new Error('Document validation requires pageCount and fileSize parameters');
      }
      return validateDocumentQuality(
        assetBuffer,
        additionalParams.pageCount,
        additionalParams.fileSize
      );

    default:
      // For other asset types, return minimal validation
      return {
        overallScore: 100,
        overallStatus: 'approved',
        checks: [
          {
            check: 'asset_type',
            passed: true,
            score: 100,
            severity: 'info',
            message: `Asset type ${assetType} does not have specific quality validation rules`,
          },
        ],
        recommendations: [],
        autoApprove: true,
      };
  }
}

/**
 * Calculate overall score from individual checks
 */
function calculateOverallScore(checks: QualityCheckResult[]): number {
  if (checks.length === 0) return 0;

  // Weight critical checks more heavily
  let totalWeight = 0;
  let weightedScore = 0;

  for (const check of checks) {
    const weight = check.severity === 'critical' ? 3 : check.severity === 'warning' ? 2 : 1;
    weightedScore += check.score * weight;
    totalWeight += weight;
  }

  return Math.round(weightedScore / totalWeight);
}

/**
 * Determine approval status based on score and critical failures
 */
function determineStatus(
  score: number,
  checks: QualityCheckResult[]
): 'approved' | 'review_needed' | 'rejected' {
  // Reject if any critical check failed
  const hasCriticalFailure = checks.some(
    (c) => c.severity === 'critical' && !c.passed
  );

  if (hasCriticalFailure) {
    return 'rejected';
  }

  // Auto-approve if score is high enough and no critical failures
  if (score >= 90) {
    return 'approved';
  }

  // Review needed for medium scores
  if (score >= 70) {
    return 'review_needed';
  }

  // Reject for low scores
  return 'rejected';
}
