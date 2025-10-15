/**
 * SEO Metadata Service
 * Comprehensive SEO metadata generation and management
 * Supports Open Graph, Twitter Cards, JSON-LD, canonical URLs, and robots meta tags
 */

import { prisma } from '@/lib/db';
import { APP_NAME } from '@/lib/constants';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SEOContent {
  id?: string;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  featuredImageUrl?: string;
  tags?: string[];
  publishedAt?: Date;
  updatedAt?: Date;
  author?: {
    id: string;
    name: string;
    slug?: string;
    avatar?: string;
    bio?: string;
    socialLinks?: Record<string, string>;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  type?: 'article' | 'website' | 'profile' | 'product';
}

export interface SEOConfig {
  siteTitle: string;
  siteDomain: string;
  siteUrl: string;
  defaultDescription: string;
  defaultImage: string;
  twitterHandle?: string;
  facebookAppId?: string;
  organizationName: string;
  organizationLogo: string;
  organizationUrl: string;
  locale: string;
  alternateLocales?: string[];
}

export interface OpenGraphTags {
  'og:title': string;
  'og:description': string;
  'og:url': string;
  'og:type': string;
  'og:image': string;
  'og:image:width'?: string;
  'og:image:height'?: string;
  'og:image:alt'?: string;
  'og:site_name': string;
  'og:locale': string;
  'og:locale:alternate'?: string[];
  'article:published_time'?: string;
  'article:modified_time'?: string;
  'article:author'?: string;
  'article:section'?: string;
  'article:tag'?: string[];
}

export interface TwitterCardTags {
  'twitter:card': 'summary' | 'summary_large_image' | 'app' | 'player';
  'twitter:site'?: string;
  'twitter:creator'?: string;
  'twitter:title': string;
  'twitter:description': string;
  'twitter:image': string;
  'twitter:image:alt'?: string;
}

export interface RobotsDirectives {
  index?: boolean;
  follow?: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
  noimageindex?: boolean;
  'max-snippet'?: number;
  'max-image-preview'?: 'none' | 'standard' | 'large';
  'max-video-preview'?: number;
  'unavailable_after'?: string;
}

export interface StructuredData {
  '@context': string;
  '@type': string;
  [key: string]: any;
}

export interface SEOMetadata {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  openGraph: OpenGraphTags;
  twitterCard: TwitterCardTags;
  structuredData: StructuredData[];
  alternateUrls?: Array<{
    hreflang: string;
    href: string;
  }>;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class SEOMetadataService {
  private static readonly DEFAULT_CONFIG: SEOConfig = {
    siteTitle: APP_NAME,
    siteDomain: 'yesgoddess.com',
    siteUrl: process.env.FRONTEND_URL || 'https://yesgoddess.com',
    defaultDescription: 'IP Licensing Platform for Creators and Brands - Revolutionizing intellectual property licensing through authentic creator-brand partnerships.',
    defaultImage: `${process.env.FRONTEND_URL || 'https://yesgoddess.com'}/images/og-default.jpg`,
    twitterHandle: '@yesgoddessio',
    organizationName: 'YesGoddess',
    organizationLogo: `${process.env.FRONTEND_URL || 'https://yesgoddess.com'}/images/logo.png`,
    organizationUrl: process.env.FRONTEND_URL || 'https://yesgoddess.com',
    locale: 'en_US',
  };

  /**
   * Generate comprehensive SEO metadata for content
   */
  static generateMetadata(
    content: SEOContent,
    path: string,
    config: Partial<SEOConfig> = {}
  ): SEOMetadata {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Generate base metadata
    const title = this.generateTitle(content, finalConfig);
    const description = this.generateDescription(content, finalConfig);
    const canonical = this.generateCanonicalUrl(path, finalConfig);
    const robots = this.generateRobotsMeta(content);
    const imageUrl = this.selectOptimalImage(content, finalConfig);

    // Generate Open Graph tags
    const openGraph = this.generateOpenGraphTags(content, title, description, canonical, imageUrl, finalConfig);
    
    // Generate Twitter Card tags
    const twitterCard = this.generateTwitterCardTags(content, title, description, imageUrl, finalConfig);
    
    // Generate structured data
    const structuredData = this.generateStructuredData(content, finalConfig);

    return {
      title,
      description,
      canonical,
      robots,
      openGraph,
      twitterCard,
      structuredData,
    };
  }

  /**
   * Generate optimized page title
   */
  private static generateTitle(content: SEOContent, config: SEOConfig): string {
    const seoTitle = content.seoTitle || content.title;
    
    // Ensure title is within optimal length (50-60 characters)
    let title = seoTitle;
    if (title.length > 60) {
      title = this.truncateText(title, 57) + '...';
    }

    // Add site name if not already present and there's room
    const titleWithSite = `${title} | ${config.siteTitle}`;
    if (!title.toLowerCase().includes(config.siteTitle.toLowerCase()) && 
        titleWithSite.length <= 60) {
      return titleWithSite;
    }

    return title;
  }

  /**
   * Generate optimized meta description
   */
  private static generateDescription(content: SEOContent, config: SEOConfig): string {
    let description = content.seoDescription || content.excerpt || '';
    
    // Generate description from content if none provided
    if (!description && content.content) {
      description = this.extractTextFromContent(content.content);
    }
    
    // Fallback to default description
    if (!description) {
      description = config.defaultDescription;
    }

    // Ensure description is within optimal length (150-160 characters)
    if (description.length > 160) {
      description = this.truncateText(description, 157) + '...';
    }

    // Ensure minimum length
    if (description.length < 120 && description !== config.defaultDescription) {
      description = config.defaultDescription;
    }

    return description;
  }

  /**
   * Generate canonical URL
   */
  private static generateCanonicalUrl(path: string, config: SEOConfig): string {
    // Remove query parameters and fragments
    const cleanPath = path.split('?')[0].split('#')[0];
    
    // Ensure path starts with /
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    
    // Remove trailing slash except for root
    const finalPath = normalizedPath.length > 1 ? normalizedPath.replace(/\/$/, '') : normalizedPath;
    
    return `${config.siteUrl}${finalPath}`;
  }

  /**
   * Generate robots meta directive
   */
  private static generateRobotsMeta(content: SEOContent): string {
    const directives: string[] = [];

    // Determine if content should be indexed
    const shouldIndex = content.publishedAt && content.publishedAt <= new Date();
    directives.push(shouldIndex ? 'index' : 'noindex');
    
    // Always allow following links unless specifically restricted
    directives.push('follow');

    // Add additional directives based on content type
    if (content.type === 'article') {
      directives.push('max-snippet:200');
      directives.push('max-image-preview:large');
    }

    return directives.join(', ');
  }

  /**
   * Select optimal image for social sharing
   */
  private static selectOptimalImage(content: SEOContent, config: SEOConfig): string {
    // 1. Use featured image if available
    if (content.featuredImageUrl) {
      return this.ensureAbsoluteUrl(content.featuredImageUrl, config.siteUrl);
    }

    // 2. Extract first image from content
    if (content.content) {
      const imageMatch = content.content.match(/<img[^>]+src="([^"]+)"/i);
      if (imageMatch) {
        return this.ensureAbsoluteUrl(imageMatch[1], config.siteUrl);
      }
    }

    // 3. Fallback to default image
    return config.defaultImage;
  }

  /**
   * Generate Open Graph tags
   */
  private static generateOpenGraphTags(
    content: SEOContent,
    title: string,
    description: string,
    canonical: string,
    imageUrl: string,
    config: SEOConfig
  ): OpenGraphTags {
    const ogTags: OpenGraphTags = {
      'og:title': content.title, // Use original title for OG, not the truncated one
      'og:description': description,
      'og:url': canonical,
      'og:type': content.type || 'article',
      'og:image': imageUrl,
      'og:site_name': config.siteTitle,
      'og:locale': config.locale,
    };

    // Add image dimensions if possible (recommended for better performance)
    ogTags['og:image:width'] = '1200';
    ogTags['og:image:height'] = '630';
    ogTags['og:image:alt'] = content.title;

    // Add alternate locales if configured
    if (config.alternateLocales) {
      ogTags['og:locale:alternate'] = config.alternateLocales;
    }

    // Add article-specific properties
    if (content.type === 'article' || content.publishedAt) {
      if (content.publishedAt) {
        ogTags['article:published_time'] = content.publishedAt.toISOString();
      }
      if (content.updatedAt) {
        ogTags['article:modified_time'] = content.updatedAt.toISOString();
      }
      if (content.author?.name) {
        ogTags['article:author'] = content.author.name;
      }
      if (content.category?.name) {
        ogTags['article:section'] = content.category.name;
      }
      if (content.tags && content.tags.length > 0) {
        ogTags['article:tag'] = content.tags;
      }
    }

    return ogTags;
  }

  /**
   * Generate Twitter Card tags
   */
  private static generateTwitterCardTags(
    content: SEOContent,
    title: string,
    description: string,
    imageUrl: string,
    config: SEOConfig
  ): TwitterCardTags {
    // Determine card type based on content
    const cardType = imageUrl && imageUrl !== config.defaultImage ? 
      'summary_large_image' : 'summary';

    const twitterTags: TwitterCardTags = {
      'twitter:card': cardType,
      'twitter:title': content.title,
      'twitter:description': description,
      'twitter:image': imageUrl,
    };

    // Add site handle if configured
    if (config.twitterHandle) {
      twitterTags['twitter:site'] = config.twitterHandle;
    }

    // Add creator handle if available
    if (content.author?.socialLinks?.twitter) {
      twitterTags['twitter:creator'] = content.author.socialLinks.twitter;
    }

    // Add image alt text
    twitterTags['twitter:image:alt'] = content.title;

    return twitterTags;
  }

  /**
   * Generate structured data (JSON-LD)
   */
  private static generateStructuredData(content: SEOContent, config: SEOConfig): StructuredData[] {
    const structuredData: StructuredData[] = [];

    // Add Organization schema
    structuredData.push(this.generateOrganizationSchema(config));

    // Add Article schema for blog posts
    if (content.type === 'article' || content.publishedAt) {
      structuredData.push(this.generateArticleSchema(content, config));
    }

    // Add WebPage schema for non-article content
    if (!content.publishedAt) {
      structuredData.push(this.generateWebPageSchema(content, config));
    }

    // Add Person schema for author profiles
    if (content.author && content.type === 'profile') {
      structuredData.push(this.generatePersonSchema(content.author, config));
    }

    return structuredData;
  }

  /**
   * Generate Organization structured data
   */
  private static generateOrganizationSchema(config: SEOConfig): StructuredData {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: config.organizationName,
      url: config.organizationUrl,
      logo: {
        '@type': 'ImageObject',
        url: config.organizationLogo,
        width: 512,
        height: 512,
      },
      description: config.defaultDescription,
      foundingDate: '2024',
      sameAs: [
        'https://twitter.com/yesgoddessio',
        'https://linkedin.com/company/yesgoddess',
      ],
    };
  }

  /**
   * Generate Article structured data
   */
  private static generateArticleSchema(content: SEOContent, config: SEOConfig): StructuredData {
    const articleSchema: StructuredData = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: content.title,
      description: content.excerpt || content.seoDescription || '',
      url: `${config.siteUrl}/blog/${content.slug}`,
      datePublished: content.publishedAt?.toISOString(),
      dateModified: content.updatedAt?.toISOString() || content.publishedAt?.toISOString(),
      author: {
        '@type': 'Person',
        name: content.author?.name || 'YesGoddess Team',
        url: content.author?.slug ? `${config.siteUrl}/authors/${content.author.slug}` : config.organizationUrl,
      },
      publisher: {
        '@type': 'Organization',
        name: config.organizationName,
        logo: {
          '@type': 'ImageObject',
          url: config.organizationLogo,
          width: 512,
          height: 512,
        },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${config.siteUrl}/blog/${content.slug}`,
      },
    };

    // Add image if available
    if (content.featuredImageUrl) {
      articleSchema.image = {
        '@type': 'ImageObject',
        url: this.ensureAbsoluteUrl(content.featuredImageUrl, config.siteUrl),
        width: 1200,
        height: 630,
      };
    }

    // Add article section (category)
    if (content.category) {
      articleSchema.articleSection = content.category.name;
    }

    // Add keywords
    if (content.tags && content.tags.length > 0) {
      articleSchema.keywords = content.tags.join(', ');
    }

    // Add word count if content is available
    if (content.content) {
      const wordCount = this.calculateWordCount(content.content);
      if (wordCount > 0) {
        articleSchema.wordCount = wordCount;
      }
    }

    return articleSchema;
  }

  /**
   * Generate WebPage structured data
   */
  private static generateWebPageSchema(content: SEOContent, config: SEOConfig): StructuredData {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: content.title,
      description: content.excerpt || content.seoDescription || config.defaultDescription,
      url: `${config.siteUrl}/${content.slug}`,
      isPartOf: {
        '@type': 'WebSite',
        name: config.siteTitle,
        url: config.siteUrl,
      },
      about: {
        '@type': 'Organization',
        name: config.organizationName,
      },
    };
  }

  /**
   * Generate Person structured data
   */
  private static generatePersonSchema(author: NonNullable<SEOContent['author']>, config: SEOConfig): StructuredData {
    const personSchema: StructuredData = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: author.name,
      url: author.slug ? `${config.siteUrl}/authors/${author.slug}` : undefined,
      description: author.bio,
    };

    // Add image if available
    if (author.avatar) {
      personSchema.image = this.ensureAbsoluteUrl(author.avatar, config.siteUrl);
    }

    // Add social media profiles
    if (author.socialLinks) {
      const sameAs = Object.values(author.socialLinks).filter(Boolean);
      if (sameAs.length > 0) {
        personSchema.sameAs = sameAs;
      }
    }

    return personSchema;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Truncate text intelligently at word boundaries
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    // If no space found, return truncated text as is
    if (lastSpace === -1) return truncated;
    
    return truncated.slice(0, lastSpace);
  }

  /**
   * Extract plain text from HTML content
   */
  private static extractTextFromContent(html: string): string {
    // Remove HTML tags
    const text = html.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Calculate word count from text content
   */
  private static calculateWordCount(content: string): number {
    const text = this.extractTextFromContent(content);
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Ensure URL is absolute
   */
  private static ensureAbsoluteUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    
    if (url.startsWith('/')) {
      return `${baseUrl}${url}`;
    }
    
    return `${baseUrl}/${url}`;
  }

  /**
   * Generate robots meta tag string from directives object
   */
  static generateRobotsString(directives: RobotsDirectives): string {
    const parts: string[] = [];

    // Index/noindex
    if (directives.index === false) {
      parts.push('noindex');
    } else {
      parts.push('index');
    }

    // Follow/nofollow
    if (directives.follow === false) {
      parts.push('nofollow');
    } else {
      parts.push('follow');
    }

    // Additional directives
    if (directives.noarchive) parts.push('noarchive');
    if (directives.nosnippet) parts.push('nosnippet');
    if (directives.noimageindex) parts.push('noimageindex');
    if (directives['max-snippet']) parts.push(`max-snippet:${directives['max-snippet']}`);
    if (directives['max-image-preview']) parts.push(`max-image-preview:${directives['max-image-preview']}`);
    if (directives['max-video-preview']) parts.push(`max-video-preview:${directives['max-video-preview']}`);
    if (directives['unavailable_after']) parts.push(`unavailable_after:${directives['unavailable_after']}`);

    return parts.join(', ');
  }

  /**
   * Validate and sanitize SEO content
   */
  static validateContent(content: SEOContent): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields validation
    if (!content.title || content.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!content.slug || content.slug.trim().length === 0) {
      errors.push('Slug is required');
    }

    // Title length validation
    if (content.title && content.title.length > 100) {
      errors.push('Title should be under 100 characters');
    }

    // Description length validation
    if (content.seoDescription && content.seoDescription.length > 200) {
      errors.push('SEO description should be under 200 characters');
    }

    // Slug format validation
    if (content.slug && !/^[a-z0-9-]+$/.test(content.slug)) {
      errors.push('Slug should only contain lowercase letters, numbers, and hyphens');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// Default Export
// ============================================================================

export const seoMetadataService = SEOMetadataService;
