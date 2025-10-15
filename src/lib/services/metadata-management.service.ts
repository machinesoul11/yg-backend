/**
 * Metadata Management Service
 * Central service for managing all types of metadata including SEO, Open Graph, Twitter Cards, etc.
 */

import { seoMetadataService, SEOContent, SEOConfig, SEOMetadata } from './seo-metadata.service';
import { APP_NAME } from '@/lib/constants';

// ============================================================================
// Extended Types
// ============================================================================

export interface PageMetadata extends SEOMetadata {
  viewport: string;
  charset: string;
  themeColor: string;
  appleTouchIcon: string;
  manifest: string;
  generator: string;
}

export interface MetadataContext {
  path: string;
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
  userAgent?: string;
  referer?: string;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
  position: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ProductInfo {
  name: string;
  description: string;
  price: number;
  currency: string;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder';
  brand: string;
  sku?: string;
  image?: string;
}

// ============================================================================
// Metadata Management Service
// ============================================================================

export class MetadataManagementService {
  private static readonly DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1';
  private static readonly DEFAULT_CHARSET = 'UTF-8';
  private static readonly DEFAULT_THEME_COLOR = '#000000';
  
  /**
   * Generate complete page metadata including SEO, technical, and social tags
   */
  static generatePageMetadata(
    content: SEOContent,
    context: MetadataContext,
    config?: Partial<SEOConfig>
  ): PageMetadata {
    // Generate base SEO metadata
    const seoMetadata = seoMetadataService.generateMetadata(content, context.path, config);
    
    // Extend with technical metadata
    return {
      ...seoMetadata,
      viewport: this.DEFAULT_VIEWPORT,
      charset: this.DEFAULT_CHARSET,
      themeColor: this.DEFAULT_THEME_COLOR,
      appleTouchIcon: '/apple-touch-icon.png',
      manifest: '/site.webmanifest',
      generator: `${APP_NAME} CMS`,
    };
  }

  /**
   * Generate metadata for blog post
   */
  static generateBlogPostMetadata(
    post: {
      id: string;
      title: string;
      slug: string;
      content: string;
      excerpt?: string;
      seoTitle?: string;
      seoDescription?: string;
      seoKeywords?: string;
      featuredImageUrl?: string;
      tags?: string[];
      publishedAt: Date;
      updatedAt: Date;
      author: {
        id: string;
        name: string;
        slug?: string;
        avatar?: string;
        bio?: string;
      };
      category?: {
        id: string;
        name: string;
        slug: string;
      };
    },
    config?: Partial<SEOConfig>
  ): PageMetadata {
    const content: SEOContent = {
      ...post,
      type: 'article',
    };

    const context: MetadataContext = {
      path: `/blog/${post.slug}`,
    };

    return this.generatePageMetadata(content, context, config);
  }

  /**
   * Generate metadata for category pages
   */
  static generateCategoryMetadata(
    category: {
      name: string;
      slug: string;
      description?: string;
      postCount?: number;
    },
    config?: Partial<SEOConfig>
  ): PageMetadata {
    const content: SEOContent = {
      title: `${category.name} - ${APP_NAME} Blog`,
      slug: category.slug,
      excerpt: category.description || `Browse all ${category.name} articles and insights.`,
      type: 'website',
    };

    const context: MetadataContext = {
      path: `/blog/category/${category.slug}`,
    };

    return this.generatePageMetadata(content, context, config);
  }

  /**
   * Generate metadata for author pages
   */
  static generateAuthorMetadata(
    author: {
      name: string;
      slug: string;
      bio?: string;
      avatar?: string;
      socialLinks?: Record<string, string>;
      postCount?: number;
    },
    config?: Partial<SEOConfig>
  ): PageMetadata {
    const content: SEOContent = {
      title: `${author.name} - Author at ${APP_NAME}`,
      slug: author.slug,
      excerpt: author.bio || `Articles and insights by ${author.name}.`,
      type: 'profile',
      author: {
        id: author.slug,
        name: author.name,
        slug: author.slug,
        avatar: author.avatar,
        bio: author.bio,
        socialLinks: author.socialLinks,
      },
    };

    const context: MetadataContext = {
      path: `/blog/author/${author.slug}`,
    };

    return this.generatePageMetadata(content, context, config);
  }

  /**
   * Generate metadata for search results pages
   */
  static generateSearchMetadata(
    query: string,
    resultCount: number,
    config?: Partial<SEOConfig>
  ): PageMetadata {
    const content: SEOContent = {
      title: `Search Results for "${query}" - ${APP_NAME}`,
      slug: 'search',
      excerpt: `Found ${resultCount} results for "${query}". Discover articles, insights, and resources.`,
      type: 'website',
    };

    const context: MetadataContext = {
      path: '/search',
      searchParams: { q: query },
    };

    const metadata = this.generatePageMetadata(content, context, config);
    
    // Prevent search pages from being indexed
    metadata.robots = 'noindex, follow';
    
    return metadata;
  }

  /**
   * Generate breadcrumb structured data
   */
  static generateBreadcrumbStructuredData(
    breadcrumbs: BreadcrumbItem[],
    baseUrl: string
  ): any {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: item.position || index + 1,
        name: item.name,
        item: this.ensureAbsoluteUrl(item.url, baseUrl),
      })),
    };
  }

  /**
   * Generate FAQ structured data
   */
  static generateFAQStructuredData(faqs: FAQItem[]): any {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };
  }

  /**
   * Generate product structured data
   */
  static generateProductStructuredData(
    product: ProductInfo,
    baseUrl: string
  ): any {
    const productSchema: any = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description,
      brand: {
        '@type': 'Brand',
        name: product.brand,
      },
      offers: {
        '@type': 'Offer',
        price: product.price,
        priceCurrency: product.currency,
        availability: `https://schema.org/${product.availability}`,
      },
    };

    if (product.sku) {
      productSchema.sku = product.sku;
    }

    if (product.image) {
      productSchema.image = this.ensureAbsoluteUrl(product.image, baseUrl);
    }

    return productSchema;
  }

  /**
   * Generate hreflang tags for multilingual content
   */
  static generateHreflangTags(
    currentPath: string,
    locales: Array<{ locale: string; url: string }>
  ): Array<{ hreflang: string; href: string }> {
    return locales.map(({ locale, url }) => ({
      hreflang: locale,
      href: url,
    }));
  }

  /**
   * Generate meta tags for specific content types
   */
  static generateContentTypeMetaTags(contentType: string): Record<string, string> {
    const baseTags: Record<string, string> = {};

    switch (contentType) {
      case 'article':
        baseTags['article:publisher'] = 'https://www.facebook.com/yesgoddess';
        break;
        
      case 'product':
        baseTags['product:availability'] = 'in stock';
        baseTags['product:condition'] = 'new';
        break;
        
      case 'profile':
        baseTags['profile:first_name'] = '';
        baseTags['profile:last_name'] = '';
        break;
        
      default:
        break;
    }

    return baseTags;
  }

  /**
   * Validate metadata completeness and quality
   */
  static validateMetadata(metadata: SEOMetadata): {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Title validation
    if (metadata.title.length < 30) {
      warnings.push('Title is shorter than recommended (30+ characters)');
    }
    if (metadata.title.length > 60) {
      warnings.push('Title exceeds recommended length (60 characters)');
    }

    // Description validation
    if (metadata.description.length < 120) {
      warnings.push('Description is shorter than recommended (120+ characters)');
    }
    if (metadata.description.length > 160) {
      warnings.push('Description exceeds recommended length (160 characters)');
    }

    // Open Graph validation
    if (!metadata.openGraph['og:image']) {
      warnings.push('Missing Open Graph image');
    }
    if (!metadata.openGraph['og:image:alt']) {
      suggestions.push('Add alt text for Open Graph image');
    }

    // Twitter Card validation
    if (metadata.twitterCard['twitter:card'] === 'summary_large_image' && 
        !metadata.twitterCard['twitter:image']) {
      warnings.push('Large image card specified but no image provided');
    }

    // Structured data validation
    if (!metadata.structuredData || metadata.structuredData.length === 0) {
      suggestions.push('Add structured data for better search results');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions,
    };
  }

  /**
   * Convert metadata to HTML meta tags
   */
  static generateMetaTagsHTML(metadata: PageMetadata): string {
    const tags: string[] = [];

    // Basic meta tags
    tags.push(`<meta charset="${metadata.charset}">`);
    tags.push(`<meta name="viewport" content="${metadata.viewport}">`);
    tags.push(`<meta name="generator" content="${metadata.generator}">`);
    tags.push(`<meta name="theme-color" content="${metadata.themeColor}">`);
    
    // SEO meta tags
    tags.push(`<title>${metadata.title}</title>`);
    tags.push(`<meta name="description" content="${metadata.description}">`);
    tags.push(`<meta name="robots" content="${metadata.robots}">`);
    tags.push(`<link rel="canonical" href="${metadata.canonical}">`);

    // Open Graph tags
    Object.entries(metadata.openGraph).forEach(([property, content]) => {
      if (Array.isArray(content)) {
        content.forEach(item => {
          tags.push(`<meta property="${property}" content="${item}">`);
        });
      } else {
        tags.push(`<meta property="${property}" content="${content}">`);
      }
    });

    // Twitter Card tags
    Object.entries(metadata.twitterCard).forEach(([name, content]) => {
      tags.push(`<meta name="${name}" content="${content}">`);
    });

    // Structured data
    metadata.structuredData.forEach(data => {
      tags.push(`<script type="application/ld+json">${JSON.stringify(data)}</script>`);
    });

    // Additional tags
    tags.push(`<link rel="apple-touch-icon" href="${metadata.appleTouchIcon}">`);
    tags.push(`<link rel="manifest" href="${metadata.manifest}">`);

    // Alternate URLs
    if (metadata.alternateUrls) {
      metadata.alternateUrls.forEach(({ hreflang, href }) => {
        tags.push(`<link rel="alternate" hreflang="${hreflang}" href="${href}">`);
      });
    }

    return tags.join('\n');
  }

  /**
   * Generate Next.js metadata object
   */
  static generateNextJSMetadata(metadata: PageMetadata): any {
    return {
      title: metadata.title,
      description: metadata.description,
      keywords: metadata.openGraph['article:tag'],
      authors: metadata.openGraph['article:author'] ? 
        [{ name: metadata.openGraph['article:author'] }] : undefined,
      generator: metadata.generator,
      applicationName: APP_NAME,
      referrer: 'origin-when-cross-origin',
      formatDetection: {
        email: false,
        address: false,
        telephone: false,
      },
      metadataBase: new URL(process.env.FRONTEND_URL || 'https://yesgoddess.com'),
      alternates: {
        canonical: metadata.canonical,
        languages: metadata.alternateUrls ? 
          Object.fromEntries(
            metadata.alternateUrls.map(({ hreflang, href }) => [hreflang, href])
          ) : undefined,
      },
      openGraph: {
        title: metadata.openGraph['og:title'],
        description: metadata.openGraph['og:description'],
        url: metadata.openGraph['og:url'],
        siteName: metadata.openGraph['og:site_name'],
        images: [
          {
            url: metadata.openGraph['og:image'],
            width: parseInt(metadata.openGraph['og:image:width'] || '1200'),
            height: parseInt(metadata.openGraph['og:image:height'] || '630'),
            alt: metadata.openGraph['og:image:alt'],
          },
        ],
        locale: metadata.openGraph['og:locale'],
        type: metadata.openGraph['og:type'],
        publishedTime: metadata.openGraph['article:published_time'],
        modifiedTime: metadata.openGraph['article:modified_time'],
        authors: metadata.openGraph['article:author'] ? 
          [metadata.openGraph['article:author']] : undefined,
        section: metadata.openGraph['article:section'],
        tags: metadata.openGraph['article:tag'],
      },
      twitter: {
        card: metadata.twitterCard['twitter:card'],
        title: metadata.twitterCard['twitter:title'],
        description: metadata.twitterCard['twitter:description'],
        site: metadata.twitterCard['twitter:site'],
        creator: metadata.twitterCard['twitter:creator'],
        images: [
          {
            url: metadata.twitterCard['twitter:image'],
            alt: metadata.twitterCard['twitter:image:alt'],
          },
        ],
      },
      robots: {
        index: !metadata.robots.includes('noindex'),
        follow: !metadata.robots.includes('nofollow'),
        nocache: metadata.robots.includes('noarchive'),
        googleBot: {
          index: !metadata.robots.includes('noindex'),
          follow: !metadata.robots.includes('nofollow'),
          noimageindex: metadata.robots.includes('noimageindex'),
          'max-video-preview': metadata.robots.includes('max-video-preview') ? 
            parseInt(metadata.robots.split('max-video-preview:')[1]) : -1,
          'max-image-preview': metadata.robots.includes('max-image-preview') ? 
            metadata.robots.split('max-image-preview:')[1] as 'none' | 'standard' | 'large' : 'large',
          'max-snippet': metadata.robots.includes('max-snippet') ? 
            parseInt(metadata.robots.split('max-snippet:')[1]) : -1,
        },
      },
      other: {
        // Structured data as script tags
        ...Object.fromEntries(
          metadata.structuredData.map((data, index) => [
            `structured-data-${index}`,
            JSON.stringify(data),
          ])
        ),
      },
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

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
}

// ============================================================================
// Default Export
// ============================================================================

export const metadataManagementService = MetadataManagementService;
