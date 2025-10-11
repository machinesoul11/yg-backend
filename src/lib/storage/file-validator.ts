/**
 * File Type Validation with Magic Number Verification
 * 
 * Provides comprehensive file validation including magic number (file signature) checking
 * to prevent malicious files disguised as legitimate types.
 */

/**
 * File signature database
 * Maps file types to their magic number signatures
 */
const FILE_SIGNATURES: Record<string, { 
  signature: number[][], 
  offset: number,
  mimeTypes: string[]
}> = {
  // Images
  JPEG: {
    signature: [[0xFF, 0xD8, 0xFF]],
    offset: 0,
    mimeTypes: ['image/jpeg', 'image/jpg'],
  },
  PNG: {
    signature: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    offset: 0,
    mimeTypes: ['image/png'],
  },
  GIF: {
    signature: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
    offset: 0,
    mimeTypes: ['image/gif'],
  },
  WEBP: {
    signature: [[0x52, 0x49, 0x46, 0x46]], // RIFF
    offset: 0,
    mimeTypes: ['image/webp'],
  },
  TIFF: {
    signature: [
      [0x49, 0x49, 0x2A, 0x00], // Little-endian
      [0x4D, 0x4D, 0x00, 0x2A], // Big-endian
    ],
    offset: 0,
    mimeTypes: ['image/tiff'],
  },

  // Videos
  MP4: {
    signature: [
      [0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
    ],
    offset: 4,
    mimeTypes: ['video/mp4'],
  },
  MOV: {
    signature: [
      [0x66, 0x74, 0x79, 0x70, 0x71, 0x74], // ftypqt
    ],
    offset: 4,
    mimeTypes: ['video/quicktime'],
  },

  // Documents
  PDF: {
    signature: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    offset: 0,
    mimeTypes: ['application/pdf'],
  },
  DOCX: {
    signature: [[0x50, 0x4B, 0x03, 0x04]], // PK (ZIP)
    offset: 0,
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  DOC: {
    signature: [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // OLE2
    offset: 0,
    mimeTypes: ['application/msword'],
  },

  // Audio
  MP3: {
    signature: [
      [0xFF, 0xFB], // MPEG-1 Layer 3
      [0xFF, 0xF3], // MPEG-2 Layer 3
      [0xFF, 0xF2], // MPEG-2.5 Layer 3
      [0x49, 0x44, 0x33], // ID3
    ],
    offset: 0,
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
  },
  WAV: {
    signature: [[0x52, 0x49, 0x46, 0x46]], // RIFF
    offset: 0,
    mimeTypes: ['audio/wav', 'audio/wave'],
  },
}

export interface FileValidationResult {
  isValid: boolean
  detectedMimeType?: string
  declaredMimeType: string
  extension: string
  errors: string[]
  warnings: string[]
}

/**
 * Comprehensive file validation
 * Validates extension, declared MIME type, and actual file signature
 */
export async function validateFile(params: {
  buffer: Buffer
  filename: string
  declaredMimeType: string
  allowedTypes: string[]
}): Promise<FileValidationResult> {
  const { buffer, filename, declaredMimeType, allowedTypes } = params
  const errors: string[] = []
  const warnings: string[] = []

  // Extract extension
  const extension = getFileExtension(filename)
  
  // Validate declared MIME type is allowed
  if (!isMimeTypeAllowed(declaredMimeType, allowedTypes)) {
    errors.push(`File type ${declaredMimeType} is not allowed`)
    return {
      isValid: false,
      declaredMimeType,
      extension,
      errors,
      warnings,
    }
  }

  // Detect actual file type from magic number
  const detectedMimeType = detectMimeTypeFromSignature(buffer)
  
  if (!detectedMimeType) {
    warnings.push('Could not detect file type from signature')
  } else if (detectedMimeType !== declaredMimeType) {
    // Check if they're compatible (e.g., image/jpg vs image/jpeg)
    if (!areCompatibleMimeTypes(detectedMimeType, declaredMimeType)) {
      errors.push(
        `File signature mismatch: declared ${declaredMimeType} but detected ${detectedMimeType}`
      )
    } else {
      warnings.push(
        `File type normalized from ${declaredMimeType} to ${detectedMimeType}`
      )
    }
  }

  // Validate extension matches MIME type
  if (!validateExtensionForMimeType(extension, declaredMimeType)) {
    warnings.push(
      `Extension ${extension} may not match declared type ${declaredMimeType}`
    )
  }

  // Additional security checks
  const securityIssues = performSecurityChecks(buffer, declaredMimeType)
  errors.push(...securityIssues)

  return {
    isValid: errors.length === 0,
    detectedMimeType,
    declaredMimeType,
    extension,
    errors,
    warnings,
  }
}

/**
 * Detect MIME type from file signature (magic number)
 */
function detectMimeTypeFromSignature(buffer: Buffer): string | undefined {
  for (const [fileType, config] of Object.entries(FILE_SIGNATURES)) {
    for (const signature of config.signature) {
      if (matchesSignature(buffer, signature, config.offset)) {
        // Return the first MIME type for this file type
        return config.mimeTypes[0]
      }
    }
  }
  return undefined
}

/**
 * Check if buffer matches signature at offset
 */
function matchesSignature(
  buffer: Buffer,
  signature: number[],
  offset: number
): boolean {
  if (buffer.length < offset + signature.length) {
    return false
  }

  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) {
      return false
    }
  }

  return true
}

/**
 * Check if MIME type is in allowed list
 */
function isMimeTypeAllowed(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.some(allowed => {
    // Support wildcard patterns like "image/*"
    if (allowed.endsWith('/*')) {
      const category = allowed.slice(0, -2)
      return mimeType.startsWith(`${category}/`)
    }
    return mimeType === allowed
  })
}

/**
 * Check if two MIME types are compatible
 * (e.g., image/jpg and image/jpeg are the same)
 */
function areCompatibleMimeTypes(mimeType1: string, mimeType2: string): boolean {
  // Normalize MIME types
  const normalized1 = normalizeMimeType(mimeType1)
  const normalized2 = normalizeMimeType(mimeType2)
  
  return normalized1 === normalized2
}

/**
 * Normalize MIME type (e.g., image/jpg -> image/jpeg)
 */
function normalizeMimeType(mimeType: string): string {
  const normalizations: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'audio/mp3': 'audio/mpeg',
  }
  
  return normalizations[mimeType] || mimeType
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : ''
}

/**
 * Validate extension matches MIME type
 */
function validateExtensionForMimeType(
  extension: string,
  mimeType: string
): boolean {
  const extensionMap: Record<string, string[]> = {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    gif: ['image/gif'],
    webp: ['image/webp'],
    tiff: ['image/tiff'],
    tif: ['image/tiff'],
    mp4: ['video/mp4'],
    mov: ['video/quicktime'],
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    mp3: ['audio/mpeg', 'audio/mp3'],
    wav: ['audio/wav', 'audio/wave'],
  }

  const expectedTypes = extensionMap[extension]
  if (!expectedTypes) return true // Unknown extension, allow

  return expectedTypes.includes(mimeType)
}

/**
 * Perform additional security checks
 */
function performSecurityChecks(
  buffer: Buffer,
  mimeType: string
): string[] {
  const errors: string[] = []

  // Check for SVG with embedded scripts
  if (mimeType === 'image/svg+xml') {
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000))
    if (
      content.includes('<script') ||
      content.includes('javascript:') ||
      content.includes('onload=')
    ) {
      errors.push('SVG files with embedded scripts are not allowed')
    }
  }

  // Check for executable content in documents
  if (mimeType.includes('application/') || mimeType.includes('text/')) {
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000))
    // Check for common executable patterns
    if (
      content.includes('<?php') ||
      content.includes('<%') ||
      content.includes('#!/')
    ) {
      errors.push('Files with executable content are not allowed')
    }
  }

  // Check file size is reasonable
  if (buffer.length === 0) {
    errors.push('File is empty')
  }

  return errors
}

/**
 * Get expected file size limits by MIME type category
 */
export function getMaxFileSizeForType(mimeType: string): number {
  const defaults = {
    image: 50 * 1024 * 1024, // 50MB
    video: 500 * 1024 * 1024, // 500MB
    audio: 100 * 1024 * 1024, // 100MB
    document: 50 * 1024 * 1024, // 50MB
    default: 50 * 1024 * 1024, // 50MB
  }

  if (mimeType.startsWith('image/')) return defaults.image
  if (mimeType.startsWith('video/')) return defaults.video
  if (mimeType.startsWith('audio/')) return defaults.audio
  if (mimeType.includes('document') || mimeType.includes('pdf'))
    return defaults.document

  return defaults.default
}
