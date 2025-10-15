/**
 * Post Analytics Client SDK
 * Frontend JavaScript/TypeScript library for tracking post analytics
 */

export interface PostAnalyticsConfig {
  apiBaseUrl: string;
  trackingEnabled?: boolean;
  batchSize?: number;
  flushInterval?: number;
  sessionTimeout?: number;
}

export interface TrackingEvent {
  type: 'view' | 'engagement' | 'scroll' | 'cta_click';
  postId: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
  data: Record<string, any>;
}

export class PostAnalyticsClient {
  private config: PostAnalyticsConfig;
  private sessionId: string;
  private userId?: string;
  private queue: TrackingEvent[] = [];
  private flushTimer?: number;
  private scrollObserver?: IntersectionObserver;
  private engagementStartTime: number = 0;
  private lastActivityTime: number = 0;
  private isPageVisible: boolean = true;
  private maxScrollDepth: number = 0;
  private scrollMilestones: Set<number> = new Set();

  constructor(config: PostAnalyticsConfig) {
    this.config = {
      trackingEnabled: true,
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      sessionTimeout: 1800000, // 30 minutes
      ...config,
    };

    this.sessionId = this.getOrCreateSessionId();
    this.setupGlobalEventListeners();
  }

  /**
   * Set up global event listeners for page visibility and user activity
   */
  private setupGlobalEventListeners(): void {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
    });

    // Track user activity for engagement calculations
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivityTime = Date.now();
      }, { passive: true });
    });
  }

  /**
   * Initialize tracking for a specific post
   */
  public initializePost(postId: string, userId?: string, experimentData?: any): void {
    if (!this.config.trackingEnabled) return;

    this.userId = userId;
    this.engagementStartTime = Date.now();
    this.lastActivityTime = Date.now();

    // Track initial post view
    this.trackPostView(postId, experimentData);

    // Set up scroll tracking
    this.initializeScrollTracking(postId);

    // Set up engagement time tracking
    this.initializeEngagementTracking(postId);

    // Set up CTA click tracking
    this.initializeCtaTracking(postId);

    console.log(`[PostAnalytics] Initialized tracking for post ${postId}`);
  }

  /**
   * Track post view event
   */
  private trackPostView(postId: string, experimentData?: any): void {
    const attribution = this.collectAttribution();
    
    this.addEvent({
      type: 'view',
      postId,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      data: {
        attribution,
        experimentId: experimentData?.experimentId,
        variantId: experimentData?.variantId,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        timestamp: new Date().toISOString(),
      },
    });

    this.flush(); // Send view events immediately
  }

  /**
   * Set up scroll depth tracking
   */
  private initializeScrollTracking(postId: string): void {
    let ticking = false;

    const trackScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
          const scrollPercentage = documentHeight > 0 ? Math.round((scrollTop / documentHeight) * 100) : 0;

          // Update max scroll depth
          if (scrollPercentage > this.maxScrollDepth) {
            this.maxScrollDepth = scrollPercentage;
          }

          // Track milestones (25%, 50%, 75%, 100%)
          const milestones = [25, 50, 75, 100];
          milestones.forEach(milestone => {
            if (scrollPercentage >= milestone && !this.scrollMilestones.has(milestone)) {
              this.scrollMilestones.add(milestone);
              
              this.addEvent({
                type: 'scroll',
                postId,
                sessionId: this.sessionId,
                userId: this.userId,
                timestamp: Date.now(),
                data: {
                  scrollDepthPercentage: scrollPercentage,
                  maxScrollDepth: this.maxScrollDepth,
                  milestone: milestone.toString(),
                  timestamp: new Date().toISOString(),
                },
              });
            }
          });

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', trackScroll, { passive: true });
  }

  /**
   * Set up engagement time tracking
   */
  private initializeEngagementTracking(postId: string): void {
    let engagementTimer: number;

    const sendEngagementUpdate = () => {
      if (this.isPageVisible && this.isUserActive()) {
        const now = Date.now();
        const engagementTime = Math.round((now - this.lastActivityTime) / 1000);
        const cumulativeTime = Math.round((now - this.engagementStartTime) / 1000);

        if (engagementTime >= 5) { // Only track significant engagement
          this.addEvent({
            type: 'engagement',
            postId,
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: now,
            data: {
              engagementTimeSeconds: engagementTime,
              cumulativeTime: cumulativeTime,
              isActiveTime: true,
              timestamp: new Date().toISOString(),
            },
          });

          this.lastActivityTime = now;
        }
      }
    };

    // Send engagement updates every 15 seconds
    engagementTimer = window.setInterval(sendEngagementUpdate, 15000);

    // Track page visibility
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      if (this.isPageVisible) {
        this.lastActivityTime = Date.now();
      }
    });

    // Track user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivityTime = Date.now();
      }, { passive: true });
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(engagementTimer);
      sendEngagementUpdate(); // Send final engagement update
      this.flush(); // Flush remaining events
    });
  }

  /**
   * Set up CTA click tracking
   */
  private initializeCtaTracking(postId: string): void {
    // Track clicks on elements with data-cta attributes
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const ctaElement = target.closest('[data-cta]') as HTMLElement;
      
      if (ctaElement) {
        const ctaId = ctaElement.getAttribute('data-cta') || 'unknown';
        const ctaType = ctaElement.getAttribute('data-cta-type') || 'button';
        const ctaText = ctaElement.textContent?.trim() || '';
        const ctaPosition = ctaElement.getAttribute('data-cta-position') || 'unknown';
        const destinationUrl = ctaElement.getAttribute('href') || ctaElement.getAttribute('data-url');

        this.addEvent({
          type: 'cta_click',
          postId,
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          data: {
            ctaId,
            ctaType,
            ctaText,
            ctaPosition,
            destinationUrl,
            timestamp: new Date().toISOString(),
          },
        });

        // Flush CTA clicks immediately for better conversion tracking
        this.flush();
      }
    });
  }

  /**
   * Add event to queue
   */
  private addEvent(event: TrackingEvent): void {
    if (!this.config.trackingEnabled) return;

    this.queue.push(event);

    // Auto-flush when batch size is reached
    if (this.queue.length >= this.config.batchSize!) {
      this.flush();
    }

    // Set up auto-flush timer
    if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(() => {
        this.flush();
      }, this.config.flushInterval);
    }
  }

  /**
   * Flush events to server
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    try {
      // Group events by type for batch processing
      const viewEvents = events.filter(e => e.type === 'view');
      const engagementEvents = events.filter(e => e.type === 'engagement');
      const scrollEvents = events.filter(e => e.type === 'scroll');
      const ctaEvents = events.filter(e => e.type === 'cta_click');

      // Send events to respective endpoints
      const promises = [];

      if (viewEvents.length > 0) {
        promises.push(...viewEvents.map(event => 
          this.sendEvent('trackView', {
            postId: event.postId,
            sessionId: event.sessionId,
            userId: event.userId,
            attribution: event.data.attribution,
            experimentId: event.data.experimentId,
            variantId: event.data.variantId,
            metadata: {
              referrer: event.data.referrer,
              userAgent: event.data.userAgent,
              viewport: event.data.viewport,
            },
          })
        ));
      }

      if (engagementEvents.length > 0) {
        promises.push(...engagementEvents.map(event =>
          this.sendEvent('trackEngagement', {
            postId: event.postId,
            sessionId: event.sessionId,
            userId: event.userId,
            engagementTimeSeconds: event.data.engagementTimeSeconds,
            cumulativeTime: event.data.cumulativeTime,
            isActiveTime: event.data.isActiveTime,
          })
        ));
      }

      if (scrollEvents.length > 0) {
        promises.push(...scrollEvents.map(event =>
          this.sendEvent('trackScrollDepth', {
            postId: event.postId,
            sessionId: event.sessionId,
            userId: event.userId,
            scrollDepthPercentage: event.data.scrollDepthPercentage,
            maxScrollDepth: event.data.maxScrollDepth,
            milestone: event.data.milestone,
          })
        ));
      }

      if (ctaEvents.length > 0) {
        promises.push(...ctaEvents.map(event =>
          this.sendEvent('trackCtaClick', {
            postId: event.postId,
            sessionId: event.sessionId,
            userId: event.userId,
            ctaId: event.data.ctaId,
            ctaType: event.data.ctaType,
            ctaText: event.data.ctaText,
            ctaPosition: event.data.ctaPosition,
            destinationUrl: event.data.destinationUrl,
          })
        ));
      }

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('[PostAnalytics] Failed to flush events:', error);
      
      // Re-queue events on failure (with limit to prevent infinite growth)
      if (this.queue.length < 100) {
        this.queue.unshift(...events);
      }
    }
  }

  /**
   * Send event to server
   */
  private async sendEvent(endpoint: string, data: any): Promise<void> {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/trpc/postAnalytics.${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        credentials: 'include', // Include cookies for session management
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`[PostAnalytics] Failed to send ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Collect attribution data from URL parameters and referrer
   */
  private collectAttribution() {
    const urlParams = new URLSearchParams(window.location.search);
    
    return {
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign'),
      utmTerm: urlParams.get('utm_term'),
      utmContent: urlParams.get('utm_content'),
      referrer: document.referrer || null,
      landingPage: window.location.href,
    };
  }

  /**
   * Get or create session ID
   */
  private getOrCreateSessionId(): string {
    const STORAGE_KEY = 'post_analytics_session';
    const STORAGE_TIMESTAMP_KEY = 'post_analytics_session_timestamp';

    try {
      const existingSession = localStorage.getItem(STORAGE_KEY);
      const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

      if (existingSession && timestamp) {
        const sessionAge = Date.now() - parseInt(timestamp, 10);
        if (sessionAge < this.config.sessionTimeout!) {
          // Update timestamp to extend session
          localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
          return existingSession;
        }
      }
    } catch (error) {
      console.warn('[PostAnalytics] Failed to access localStorage:', error);
    }

    // Create new session
    const sessionId = this.generateUUID();
    
    try {
      localStorage.setItem(STORAGE_KEY, sessionId);
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.warn('[PostAnalytics] Failed to save session to localStorage:', error);
    }

    return sessionId;
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Check if user is active (has interacted recently)
   */
  private isUserActive(): boolean {
    return Date.now() - this.lastActivityTime < 30000; // Active if interaction within last 30 seconds
  }

  /**
   * Clean up tracking
   */
  public destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
    }
    
    this.flush(); // Send any remaining events
  }
}

// Default instance for easy usage
let defaultClient: PostAnalyticsClient | null = null;

/**
 * Initialize default post analytics client
 */
export function initializePostAnalytics(config: PostAnalyticsConfig): PostAnalyticsClient {
  defaultClient = new PostAnalyticsClient(config);
  return defaultClient;
}

/**
 * Get default client instance
 */
export function getPostAnalyticsClient(): PostAnalyticsClient | null {
  return defaultClient;
}

/**
 * Track post for the current page
 */
export function trackPost(postId: string, userId?: string, experimentData?: any): void {
  if (defaultClient) {
    defaultClient.initializePost(postId, userId, experimentData);
  } else {
    console.warn('[PostAnalytics] Client not initialized. Call initializePostAnalytics() first.');
  }
}

// Global interface for browser usage
declare global {
  interface Window {
    PostAnalytics: {
      initializePostAnalytics: typeof initializePostAnalytics;
      getPostAnalyticsClient: typeof getPostAnalyticsClient;
      trackPost: typeof trackPost;
      PostAnalyticsClient: typeof PostAnalyticsClient;
    };
  }
}

// Expose to global scope for browser usage
if (typeof window !== 'undefined') {
  window.PostAnalytics = {
    initializePostAnalytics,
    getPostAnalyticsClient,
    trackPost,
    PostAnalyticsClient,
  };
}
