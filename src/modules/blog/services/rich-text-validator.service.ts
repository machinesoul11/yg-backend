/**
 * Rich Text Content Validation Service
 * Comprehensive validation and sanitization for rich text content
 */

import DOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';

// Content validation configuration
interface ContentValidationConfig {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  maxLength: number;
  minLength: number;
  requireHeadings: boolean;
  maxImageCount: number;
  validateLinks: boolean;
}

interface ContentValidationResult {
  isValid: boolean;
  sanitizedContent: string;
  errors: ContentValidationError[];
  warnings: ContentValidationWarning[];
  recommendations: ContentValidationRecommendation[];
}

interface ContentValidationError {
  type: 'SECURITY' | 'STRUCTURE' | 'CONTENT' | 'LENGTH';
  message: string;
  location?: string;
  severity: 'error' | 'warning';
}

interface ContentValidationWarning extends ContentValidationError {
  severity: 'warning';
}

interface ContentValidationRecommendation extends ContentValidationError {
  severity: 'info';
}

export class RichTextContentValidator {
  private static readonly DEFAULT_CONFIG: ContentValidationConfig = {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 'strike', 'del', 'ins',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span'
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'blockquote': ['cite'],
      'div': ['class'],
      'span': ['class'],
      'h1': ['id'],
      'h2': ['id'],
      'h3': ['id'],
      'h4': ['id'],
      'h5': ['id'],
      'h6': ['id']
    },
    maxLength: 100000, // 100K characters
    minLength: 50,
    requireHeadings: true,
    maxImageCount: 20,
    validateLinks: true
  };

  /**
   * Validate and sanitize rich text content
   */
  static validateContent(
    content: string,
    config: Partial<ContentValidationConfig> = {}
  ): ContentValidationResult {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const result: ContentValidationResult = {
      isValid: true,
      sanitizedContent: '',
      errors: [],
      warnings: [],
      recommendations: []
    };

    try {
      // 1. Basic length validation
      if (content.length < finalConfig.minLength) {
        result.errors.push({
          type: 'LENGTH',
          message: `Content is too short. Minimum ${finalConfig.minLength} characters required.`,
          severity: 'error'
        });
        result.isValid = false;
      }

      if (content.length > finalConfig.maxLength) {
        result.errors.push({
          type: 'LENGTH',
          message: `Content is too long. Maximum ${finalConfig.maxLength} characters allowed.`,
          severity: 'error'
        });
        result.isValid = false;
      }

      // 2. HTML sanitization
      const window = new JSDOM('').window;
      const purify = DOMPurify(window);

      purify.addHook('beforeSanitizeElements', (node) => {
        // Track removed elements for warnings
        if (node.nodeType === 1 && !finalConfig.allowedTags.includes(node.nodeName.toLowerCase())) {
          result.warnings.push({
            type: 'SECURITY',
            message: `Removed disallowed tag: ${node.nodeName}`,
            severity: 'warning'
          });
        }
      });

      const sanitizedContent = purify.sanitize(content, {
        ALLOWED_TAGS: finalConfig.allowedTags,
        ALLOWED_ATTR: Object.values(finalConfig.allowedAttributes).flat(),
        KEEP_CONTENT: true,
        RETURN_DOM: false
      });

      result.sanitizedContent = sanitizedContent;

      // 3. Structure validation
      this.validateStructure(sanitizedContent, finalConfig, result);

      // 4. Content quality validation
      this.validateContentQuality(sanitizedContent, finalConfig, result);

      // 5. Link validation
      if (finalConfig.validateLinks) {
        this.validateLinks(sanitizedContent, result);
      }

      // 6. Image validation
      this.validateImages(sanitizedContent, finalConfig, result);

    } catch (error) {
      result.errors.push({
        type: 'SECURITY',
        message: `Content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate content structure (headings, hierarchy, etc.)
   */
  private static validateStructure(
    content: string,
    config: ContentValidationConfig,
    result: ContentValidationResult
  ): void {
    const window = new JSDOM(content).window;
    const document = window.document;

    // Check for heading structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    if (config.requireHeadings && headings.length === 0) {
      result.warnings.push({
        type: 'STRUCTURE',
        message: 'No headings found. Consider adding headings to improve content structure.',
        severity: 'warning'
      });
    }

    // Validate heading hierarchy
    let previousLevel = 0;
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      
      if (index > 0 && level - previousLevel > 1) {
        result.warnings.push({
          type: 'STRUCTURE',
          message: `Heading hierarchy skip detected: ${heading.tagName} follows H${previousLevel}`,
          location: heading.textContent?.substring(0, 50) || '',
          severity: 'warning'
        });
      }
      previousLevel = level;
    });

    // Check for multiple H1 tags
    const h1Tags = document.querySelectorAll('h1');
    if (h1Tags.length > 1) {
      result.warnings.push({
        type: 'STRUCTURE',
        message: 'Multiple H1 tags found. Consider using H2-H6 for subheadings.',
        severity: 'warning'
      });
    }

    // Check for empty elements
    const emptyElements = document.querySelectorAll('p:empty, div:empty, span:empty');
    if (emptyElements.length > 0) {
      result.warnings.push({
        type: 'STRUCTURE',
        message: `${emptyElements.length} empty elements found and should be removed.`,
        severity: 'warning'
      });
    }

    // Check for nested block elements
    const nestedBlocks = document.querySelectorAll('p p, div p, blockquote p p');
    if (nestedBlocks.length > 0) {
      result.warnings.push({
        type: 'STRUCTURE',
        message: 'Nested block elements detected. This may cause rendering issues.',
        severity: 'warning'
      });
    }
  }

  /**
   * Validate content quality and accessibility
   */
  private static validateContentQuality(
    content: string,
    config: ContentValidationConfig,
    result: ContentValidationResult
  ): void {
    const window = new JSDOM(content).window;
    const document = window.document;

    // Check for alt text on images
    const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
    imagesWithoutAlt.forEach((img) => {
      result.errors.push({
        type: 'CONTENT',
        message: 'Image missing alt text for accessibility',
        location: (img as HTMLImageElement).src || 'Unknown image',
        severity: 'error'
      });
    });

    // Check for empty alt text
    const imagesWithEmptyAlt = document.querySelectorAll('img[alt=""]');
    if (imagesWithEmptyAlt.length > 0) {
      result.warnings.push({
        type: 'CONTENT',
        message: `${imagesWithEmptyAlt.length} images have empty alt text. Consider descriptive alt text.`,
        severity: 'warning'
      });
    }

    // Check for long alt text
    const imagesWithLongAlt = document.querySelectorAll('img[alt]');
    imagesWithLongAlt.forEach((img) => {
      const altText = (img as HTMLImageElement).alt;
      if (altText && altText.length > 125) {
        result.warnings.push({
          type: 'CONTENT',
          message: 'Alt text is too long (>125 characters). Consider shorter, more descriptive text.',
          location: altText.substring(0, 50) + '...',
          severity: 'warning'
        });
      }
    });

    // Check for very long paragraphs
    const longParagraphs = document.querySelectorAll('p');
    longParagraphs.forEach((p) => {
      const textLength = p.textContent?.length || 0;
      if (textLength > 300) {
        result.recommendations.push({
          type: 'CONTENT',
          message: 'Long paragraph detected. Consider breaking into smaller paragraphs for readability.',
          location: p.textContent?.substring(0, 50) + '...' || '',
          severity: 'info'
        });
      }
    });

    // Check for heading content quality
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      const text = heading.textContent || '';
      if (text.length < 3) {
        result.warnings.push({
          type: 'CONTENT',
          message: 'Heading text is too short to be descriptive.',
          location: text,
          severity: 'warning'
        });
      }
      if (text.length > 70) {
        result.warnings.push({
          type: 'CONTENT',
          message: 'Heading text is too long. Consider shortening for better readability.',
          location: text.substring(0, 50) + '...',
          severity: 'warning'
        });
      }
    });
  }

  /**
   * Validate links in content
   */
  private static validateLinks(
    content: string,
    result: ContentValidationResult
  ): void {
    const window = new JSDOM(content).window;
    const document = window.document;
    const links = document.querySelectorAll('a[href]');

    links.forEach((link) => {
      const href = (link as HTMLAnchorElement).href;
      const linkText = link.textContent || '';

      // Check for empty link text
      if (!linkText.trim()) {
        result.errors.push({
          type: 'CONTENT',
          message: 'Link has no text content',
          location: href,
          severity: 'error'
        });
      }

      // Check for non-descriptive link text
      const nonDescriptiveTexts = ['click here', 'read more', 'here', 'link'];
      if (nonDescriptiveTexts.includes(linkText.toLowerCase().trim())) {
        result.warnings.push({
          type: 'CONTENT',
          message: 'Link text is not descriptive. Consider more meaningful text.',
          location: `"${linkText}" -> ${href}`,
          severity: 'warning'
        });
      }

      // Check for suspicious URLs
      if (href.includes('javascript:') || href.includes('data:')) {
        result.errors.push({
          type: 'SECURITY',
          message: 'Potentially unsafe link protocol detected',
          location: href,
          severity: 'error'
        });
      }

      // Check for external links without proper attributes
      if (href.startsWith('http') && !href.includes(process.env.FRONTEND_URL || '')) {
        const rel = (link as HTMLAnchorElement).rel;
        if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
          result.recommendations.push({
            type: 'SECURITY',
            message: 'External link should include rel="noopener noreferrer" for security.',
            location: href,
            severity: 'info'
          });
        }
      }
    });
  }

  /**
   * Validate images in content
   */
  private static validateImages(
    content: string,
    config: ContentValidationConfig,
    result: ContentValidationResult
  ): void {
    const window = new JSDOM(content).window;
    const document = window.document;
    const images = document.querySelectorAll('img');

    if (images.length > config.maxImageCount) {
      result.warnings.push({
        type: 'CONTENT',
        message: `Too many images (${images.length}). Consider reducing to ${config.maxImageCount} or fewer.`,
        severity: 'warning'
      });
    }

    images.forEach((img) => {
      const src = (img as HTMLImageElement).src;
      
      // Check for missing src
      if (!src) {
        result.errors.push({
          type: 'CONTENT',
          message: 'Image missing src attribute',
          severity: 'error'
        });
      }

      // Check for data URLs (embedded images)
      if (src && src.startsWith('data:')) {
        result.warnings.push({
          type: 'CONTENT',
          message: 'Embedded image detected. Consider using external image references for better performance.',
          location: src.substring(0, 50) + '...',
          severity: 'warning'
        });
      }

      // Check for width/height attributes for layout stability
      const width = (img as HTMLImageElement).width;
      const height = (img as HTMLImageElement).height;
      if (!width || !height) {
        result.recommendations.push({
          type: 'CONTENT',
          message: 'Image missing width/height attributes. This may cause layout shift.',
          location: src || 'Unknown image',
          severity: 'info'
        });
      }
    });
  }

  /**
   * Get plain text from HTML content
   */
  static extractPlainText(htmlContent: string): string {
    const window = new JSDOM(htmlContent).window;
    const document = window.document;
    return document.body.textContent || '';
  }

  /**
   * Count words in HTML content
   */
  static countWords(htmlContent: string): number {
    const plainText = this.extractPlainText(htmlContent);
    return plainText.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Validate content before saving
   */
  static async validateBeforeSave(content: string): Promise<ContentValidationResult> {
    return this.validateContent(content, {
      requireHeadings: true,
      validateLinks: true,
      minLength: 100
    });
  }
}
