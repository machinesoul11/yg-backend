/**
 * Pagination SEO Service
 * Handles SEO optimization for paginated blog content
 */

export interface PaginationMetadata {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationSEOTags {
  canonical: string;
  relNext?: string;
  relPrev?: string;
  metaRobots?: string;
  title: string;
  description: string;
}

export interface PaginationConfig {
  baseUrl: string;
  basePath: string;
  pageParam?: string;
  noIndexThreshold?: number; // Page number after which to noindex
  titleTemplate?: string;
  descriptionTemplate?: string;
}

export class PaginationSEOService {
  private readonly defaultConfig: Required<Omit<PaginationConfig, 'baseUrl' | 'basePath'>> = {
    pageParam: 'page',
    noIndexThreshold: 10,
    titleTemplate: '{baseTitle} - Page {page}',
    descriptionTemplate: '{baseDescription} Browse page {page} of {totalPages}.',
  };

  /**
   * Generate SEO tags for paginated content
   */
  generatePaginationSEO(
    metadata: PaginationMetadata,
    config: PaginationConfig,
    baseTitle: string,
    baseDescription: string
  ): PaginationSEOTags {
    const { currentPage, totalPages, hasNextPage, hasPreviousPage } = metadata;
    const finalConfig = { ...this.defaultConfig, ...config };

    // Generate canonical URL (always point to the current page)
    const canonical = this.buildPageUrl(config.baseUrl, config.basePath, currentPage, finalConfig.pageParam);

    // Generate rel=next and rel=prev links
    const relNext = hasNextPage 
      ? this.buildPageUrl(config.baseUrl, config.basePath, currentPage + 1, finalConfig.pageParam)
      : undefined;

    const relPrev = hasPreviousPage && currentPage > 2
      ? this.buildPageUrl(config.baseUrl, config.basePath, currentPage - 1, finalConfig.pageParam)
      : hasPreviousPage && currentPage === 2
      ? this.buildPageUrl(config.baseUrl, config.basePath, 1, finalConfig.pageParam, true) // First page without page param
      : undefined;

    // Generate meta robots directive
    const metaRobots = this.generateMetaRobots(currentPage, finalConfig.noIndexThreshold);

    // Generate title and description
    const title = this.generatePaginatedTitle(baseTitle, currentPage, finalConfig.titleTemplate);
    const description = this.generatePaginatedDescription(
      baseDescription, 
      currentPage, 
      totalPages, 
      finalConfig.descriptionTemplate
    );

    return {
      canonical,
      relNext,
      relPrev,
      metaRobots,
      title,
      description,
    };
  }

  /**
   * Build paginated URL
   */
  private buildPageUrl(
    baseUrl: string, 
    basePath: string, 
    page: number, 
    pageParam: string,
    omitPageParam = false
  ): string {
    const cleanPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    if (page === 1 || omitPageParam) {
      return `${cleanBaseUrl}${cleanPath}`;
    }

    const separator = cleanPath.includes('?') ? '&' : '?';
    return `${cleanBaseUrl}${cleanPath}${separator}${pageParam}=${page}`;
  }

  /**
   * Generate meta robots directive for pagination
   */
  private generateMetaRobots(currentPage: number, noIndexThreshold: number): string | undefined {
    if (currentPage > noIndexThreshold) {
      return 'noindex,follow';
    }
    
    // First page gets normal indexing, subsequent pages get noindex but follow
    if (currentPage > 1) {
      return 'noindex,follow';
    }
    
    return undefined; // Let default robots behavior apply for first page
  }

  /**
   * Generate paginated title
   */
  private generatePaginatedTitle(baseTitle: string, currentPage: number, template: string): string {
    if (currentPage === 1) {
      return baseTitle;
    }

    return template
      .replace('{baseTitle}', baseTitle)
      .replace('{page}', currentPage.toString());
  }

  /**
   * Generate paginated description
   */
  private generatePaginatedDescription(
    baseDescription: string, 
    currentPage: number, 
    totalPages: number, 
    template: string
  ): string {
    if (currentPage === 1) {
      return baseDescription;
    }

    return template
      .replace('{baseDescription}', baseDescription)
      .replace('{page}', currentPage.toString())
      .replace('{totalPages}', totalPages.toString());
  }

  /**
   * Generate HTML meta tags for pagination
   */
  generatePaginationHTML(tags: PaginationSEOTags): string {
    const htmlTags: string[] = [];

    // Canonical link
    htmlTags.push(`<link rel="canonical" href="${tags.canonical}" />`);

    // Rel next/prev
    if (tags.relNext) {
      htmlTags.push(`<link rel="next" href="${tags.relNext}" />`);
    }
    if (tags.relPrev) {
      htmlTags.push(`<link rel="prev" href="${tags.relPrev}" />`);
    }

    // Meta robots
    if (tags.metaRobots) {
      htmlTags.push(`<meta name="robots" content="${tags.metaRobots}" />`);
    }

    // Title and description
    htmlTags.push(`<title>${this.escapeHtml(tags.title)}</title>`);
    htmlTags.push(`<meta name="description" content="${this.escapeHtml(tags.description)}" />`);

    return htmlTags.join('\n');
  }

  /**
   * Generate Next.js metadata object for pagination
   */
  generateNextJSPaginationMetadata(tags: PaginationSEOTags): object {
    const metadata: any = {
      title: tags.title,
      description: tags.description,
      alternates: {
        canonical: tags.canonical,
      },
    };

    // Add robots directive if specified
    if (tags.metaRobots) {
      metadata.robots = tags.metaRobots;
    }

    // Add rel next/prev
    const links: any[] = [];
    if (tags.relNext) {
      links.push({ rel: 'next', href: tags.relNext });
    }
    if (tags.relPrev) {
      links.push({ rel: 'prev', href: tags.relPrev });
    }

    if (links.length > 0) {
      metadata.other = {
        'link': links.map(link => `<${link.href}>; rel="${link.rel}"`).join(', ')
      };
    }

    return metadata;
  }

  /**
   * Validate pagination parameters
   */
  validatePaginationParams(page: number, totalPages: number): {
    isValid: boolean;
    errors: string[];
    sanitizedPage: number;
  } {
    const errors: string[] = [];
    let sanitizedPage = page;

    // Check if page is a positive integer
    if (!Number.isInteger(page) || page < 1) {
      errors.push('Page must be a positive integer');
      sanitizedPage = 1;
    }

    // Check if page exceeds total pages
    if (totalPages > 0 && page > totalPages) {
      errors.push(`Page ${page} exceeds total pages (${totalPages})`);
      sanitizedPage = totalPages;
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedPage,
    };
  }

  /**
   * Calculate pagination metadata from total items
   */
  calculatePaginationMetadata(
    currentPage: number, 
    totalItems: number, 
    itemsPerPage: number
  ): PaginationMetadata {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const hasNextPage = currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;

    return {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage,
      hasNextPage,
      hasPreviousPage,
    };
  }

  /**
   * Escape HTML entities in strings
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

// Export singleton instance
export const paginationSEOService = new PaginationSEOService();
