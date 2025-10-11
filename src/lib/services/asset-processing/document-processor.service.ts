/**
 * Document Processing Service
 * 
 * Handles comprehensive document processing includiexport async function extractDocumentText(
  inputBuffer: Buffer,
  options: { maxLength?: number } = {}
): Promise<string> {
  const { maxLength } = options;

  try {
    const data = await pdfParse(inputBuffer);PDF preview generation (first page/multiple pages)
 * - Text extraction for search indexing
 * - Page count extraction
 * - Document metadata extraction (author, title, creation date)
 */

import sharp from 'sharp';
import { THUMBNAIL_SIZES } from '@/lib/storage/thumbnail-generator';

// Use require for pdf-parse due to ESM compatibility issues
const pdfParse = require('pdf-parse');

export interface DocumentMetadata {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  keywords?: string;
  fileSize: number;
  version?: string;
}

export interface DocumentPreviewOptions {
  pageNumber?: number; // Page to render (default: 1)
  width?: number; // Width in pixels
  height?: number; // Height in pixels
  quality?: number; // JPEG quality
}

export interface ProcessedDocumentResult {
  thumbnails: Buffer[];
  previews: Buffer[];
  metadata: DocumentMetadata;
  textContent?: string;
}

/**
 * Extract document metadata from PDF
 */
export async function extractDocumentMetadata(
  inputBuffer: Buffer
): Promise<DocumentMetadata> {
  try {
    const data = await pdfParse(inputBuffer);

    const metadata: DocumentMetadata = {
      pageCount: data.numpages,
      fileSize: inputBuffer.length,
    };

    if (data.info) {
      metadata.title = data.info.Title || undefined;
      metadata.author = data.info.Author || undefined;
      metadata.subject = data.info.Subject || undefined;
      metadata.creator = data.info.Creator || undefined;
      metadata.producer = data.info.Producer || undefined;
      metadata.keywords = data.info.Keywords || undefined;
      metadata.version = data.info.PDFFormatVersion || undefined;

      // Parse dates
      if (data.info.CreationDate) {
        try {
          metadata.creationDate = parsePDFDate(data.info.CreationDate);
        } catch {}
      }
      if (data.info.ModDate) {
        try {
          metadata.modificationDate = parsePDFDate(data.info.ModDate);
        } catch {}
      }
    }

    return metadata;
  } catch (error) {
    throw new Error(
      `Failed to extract document metadata: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract text content from PDF for search indexing
 */
export async function extractDocumentText(
  inputBuffer: Buffer,
  options: { maxLength?: number } = {}
): Promise<string> {
  const { maxLength } = options;

  try {
    const data = await pdfParse(inputBuffer);
    let text = data.text;

    if (maxLength && text.length > maxLength) {
      text = text.substring(0, maxLength);
    }

    return text;
  } catch (error) {
    throw new Error(
      `Failed to extract document text: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse PDF date format to ISO string
 */
function parsePDFDate(pdfDate: string): string {
  // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
  // Example: D:20250101120000+00'00'
  if (!pdfDate || !pdfDate.startsWith('D:')) {
    return new Date().toISOString();
  }

  const dateStr = pdfDate.substring(2);
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10)) || 0;
  const minute = parseInt(dateStr.substring(10, 12)) || 0;
  const second = parseInt(dateStr.substring(12, 14)) || 0;

  const date = new Date(year, month, day, hour, minute, second);
  return date.toISOString();
}

/**
 * Generate document preview images from PDF
 * Note: This is a placeholder. Full PDF rendering requires additional dependencies
 * like pdf-poppler or a service like CloudConvert
 */
export async function generateDocumentPreview(
  inputBuffer: Buffer,
  options: DocumentPreviewOptions = {}
): Promise<Buffer> {
  const { pageNumber = 1, width = 1200, quality = 85 } = options;

  // For now, we'll create a placeholder implementation
  // In production, you would use pdf-poppler or a similar library
  // to render PDF pages as images

  throw new Error(
    'PDF preview generation requires additional setup. ' +
    'Please install and configure pdf-poppler or use a PDF rendering service.'
  );

  // Example implementation with pdf-poppler:
  // const poppler = require('pdf-poppler');
  // const opts = {
  //   format: 'jpeg',
  //   out_dir: '/tmp',
  //   out_prefix: `page-${Date.now()}`,
  //   page: pageNumber,
  //   scale: width / 612, // Standard PDF page width
  // };
  // await poppler.convert(inputBuffer, opts);
  // return readFileSync(`${opts.out_dir}/${opts.out_prefix}-${pageNumber}.jpg`);
}

/**
 * Generate thumbnail variants from document preview
 */
export async function generateDocumentThumbnailVariants(
  previewBuffer: Buffer
): Promise<Record<string, { buffer: Buffer; width: number; height: number; size: number }>> {
  const variants: Record<string, { buffer: Buffer; width: number; height: number; size: number }> = {};

  for (const [size, dimensions] of Object.entries(THUMBNAIL_SIZES)) {
    const processed = await sharp(previewBuffer)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({
        quality: 85,
        progressive: true,
      })
      .toBuffer({ resolveWithObject: false });

    const metadata = await sharp(processed).metadata();

    variants[size] = {
      buffer: processed,
      width: metadata.width || dimensions.width,
      height: metadata.height || dimensions.height,
      size: processed.length,
    };
  }

  return variants;
}

/**
 * Create a placeholder thumbnail for documents when rendering is not available
 */
export async function generateDocumentPlaceholderThumbnail(
  metadata: DocumentMetadata
): Promise<Buffer> {
  // Create a simple SVG-based placeholder
  const svg = `
    <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="400" fill="#f3f4f6"/>
      <text x="200" y="180" font-family="Arial" font-size="48" fill="#6b7280" text-anchor="middle">📄</text>
      <text x="200" y="240" font-family="Arial" font-size="16" fill="#374151" text-anchor="middle">
        ${metadata.title?.substring(0, 30) || 'Document'}
      </text>
      <text x="200" y="270" font-family="Arial" font-size="14" fill="#6b7280" text-anchor="middle">
        ${metadata.pageCount} page${metadata.pageCount !== 1 ? 's' : ''}
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Process document file completely
 */
export async function processDocument(
  inputBuffer: Buffer,
  options: {
    extractText?: boolean;
    generateThumbnails?: boolean;
    extractMetadata?: boolean;
    maxTextLength?: number;
  } = {}
): Promise<ProcessedDocumentResult> {
  const {
    extractText = true,
    generateThumbnails = true,
    extractMetadata = true,
    maxTextLength = 100000, // 100KB of text
  } = options;

  const result: ProcessedDocumentResult = {
    thumbnails: [],
    previews: [],
    metadata: {} as DocumentMetadata,
  };

  try {
    // Extract metadata first
    if (extractMetadata) {
      result.metadata = await extractDocumentMetadata(inputBuffer);
    } else {
      // Need at least basic metadata for placeholder
      result.metadata = {
        pageCount: 1,
        fileSize: inputBuffer.length,
      };
    }

    // Extract text
    if (extractText) {
      result.textContent = await extractDocumentText(inputBuffer, {
        maxLength: maxTextLength,
      });
    }

    // Generate thumbnails (using placeholder for now)
    if (generateThumbnails) {
      const placeholder = await generateDocumentPlaceholderThumbnail(result.metadata);
      const variants = await generateDocumentThumbnailVariants(placeholder);
      result.thumbnails = Object.values(variants).map((v) => v.buffer);
      
      // Also add placeholder to previews
      result.previews = [placeholder];
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to process document: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate document file
 */
export async function validateDocument(inputBuffer: Buffer): Promise<{
  isValid: boolean;
  error?: string;
  metadata?: DocumentMetadata;
}> {
  try {
    const metadata = await extractDocumentMetadata(inputBuffer);

    if (metadata.pageCount === 0) {
      return {
        isValid: false,
        error: 'Document has no pages',
      };
    }

    if (metadata.pageCount > 1000) {
      return {
        isValid: false,
        error: 'Document exceeds maximum page count (1000 pages)',
      };
    }

    return {
      isValid: true,
      metadata,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid document: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Convert document between formats (placeholder)
 */
export async function convertDocument(
  inputBuffer: Buffer,
  targetFormat: 'pdf' | 'docx' | 'html'
): Promise<Buffer> {
  throw new Error(
    'Document conversion requires additional setup. ' +
    'Consider using LibreOffice, Pandoc, or a conversion service.'
  );
}
