/**
 * Search Engine Submission Service
 * Handles automatic sitemap submission to search engines
 */

export interface SitemapSubmissionResult {
  success: boolean;
  searchEngine: string;
  statusCode?: number;
  error?: string;
  submissionTime: Date;
}

export interface SitemapSubmissionSummary {
  totalSubmissions: number;
  successfulSubmissions: number;
  failedSubmissions: number;
  results: SitemapSubmissionResult[];
}

export class SearchEngineSubmissionService {
  private readonly sitemapUrl: string;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(baseUrl?: string) {
    const domain = baseUrl || process.env.FRONTEND_URL || 'https://yesgoddess.agency';
    this.sitemapUrl = `${domain}/api/blog/sitemap.xml`;
  }

  /**
   * Submit sitemap to all major search engines
   */
  async submitToAllSearchEngines(): Promise<SitemapSubmissionSummary> {
    console.log(`Starting sitemap submission for: ${this.sitemapUrl}`);
    
    const results: SitemapSubmissionResult[] = [];

    // Submit to Google
    try {
      const googleResult = await this.submitToGoogle();
      results.push(googleResult);
    } catch (error) {
      console.error('Google submission failed:', error);
      results.push({
        success: false,
        searchEngine: 'Google',
        error: error instanceof Error ? error.message : 'Unknown error',
        submissionTime: new Date(),
      });
    }

    // Submit to Bing
    try {
      const bingResult = await this.submitToBing();
      results.push(bingResult);
    } catch (error) {
      console.error('Bing submission failed:', error);
      results.push({
        success: false,
        searchEngine: 'Bing',
        error: error instanceof Error ? error.message : 'Unknown error',
        submissionTime: new Date(),
      });
    }

    const successfulSubmissions = results.filter(r => r.success).length;
    const failedSubmissions = results.filter(r => !r.success).length;

    console.log(`Sitemap submission completed: ${successfulSubmissions} successful, ${failedSubmissions} failed`);

    return {
      totalSubmissions: results.length,
      successfulSubmissions,
      failedSubmissions,
      results,
    };
  }

  /**
   * Submit sitemap to Google Search Console
   */
  private async submitToGoogle(): Promise<SitemapSubmissionResult> {
    const submissionTime = new Date();
    const endpoint = `https://www.google.com/ping?sitemap=${encodeURIComponent(this.sitemapUrl)}`;

    try {
      const response = await this.makeRequest(endpoint);
      
      // Google returns 200 for successful submissions
      const success = response.status === 200;
      
      if (success) {
        console.log('✅ Google sitemap submission successful');
      } else {
        console.warn(`⚠️ Google sitemap submission returned status: ${response.status}`);
      }

      return {
        success,
        searchEngine: 'Google',
        statusCode: response.status,
        submissionTime,
      };
    } catch (error) {
      console.error('❌ Google sitemap submission failed:', error);
      throw error;
    }
  }

  /**
   * Submit sitemap to Bing Webmaster Tools
   */
  private async submitToBing(): Promise<SitemapSubmissionResult> {
    const submissionTime = new Date();
    const endpoint = `https://www.bing.com/ping?sitemap=${encodeURIComponent(this.sitemapUrl)}`;

    try {
      const response = await this.makeRequest(endpoint);
      
      // Bing returns 200 for successful submissions
      const success = response.status === 200;
      
      if (success) {
        console.log('✅ Bing sitemap submission successful');
      } else {
        console.warn(`⚠️ Bing sitemap submission returned status: ${response.status}`);
      }

      return {
        success,
        searchEngine: 'Bing',
        statusCode: response.status,
        submissionTime,
      };
    } catch (error) {
      console.error('❌ Bing sitemap submission failed:', error);
      throw error;
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(url: string): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Attempting sitemap submission (${attempt}/${this.maxRetries}): ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'YesGoddess-Bot/1.0 (https://yesgoddess.agency)',
          },
          // Set timeout to 10 seconds
          signal: AbortSignal.timeout(10000),
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown request error');
        console.warn(`Attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff: wait longer between retries
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Validate sitemap URL accessibility before submission
   */
  async validateSitemapAccessibility(): Promise<boolean> {
    try {
      console.log(`Validating sitemap accessibility: ${this.sitemapUrl}`);
      
      const response = await fetch(this.sitemapUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const isAccessible = response.status === 200;
      
      if (isAccessible) {
        console.log('✅ Sitemap is accessible');
      } else {
        console.warn(`⚠️ Sitemap returned status: ${response.status}`);
      }

      return isAccessible;
    } catch (error) {
      console.error('❌ Sitemap validation failed:', error);
      return false;
    }
  }

  /**
   * Get the sitemap URL being used for submissions
   */
  getSitemapUrl(): string {
    return this.sitemapUrl;
  }
}
