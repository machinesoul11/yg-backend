/**
 * Event Tracking Utilities
 * Helper functions to make event tracking simple throughout the codebase
 */

import type { RequestContext } from '../types';
import type { TrackEventInput } from '@/lib/schemas/analytics.schema';
import { EVENT_TYPES, EVENT_SOURCES } from '@/lib/constants/event-types';

/**
 * Base event properties shared by all events
 */
interface BaseEventProps {
  sessionId?: string;
  attribution?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    referrer?: string;
  };
  props?: Record<string, any>;
  idempotencyKey?: string;
}

/**
 * Generic event tracking function
 */
export function buildTrackEventInput(
  eventType: string,
  source: string,
  entityId?: string,
  entityType?: string,
  additionalProps?: BaseEventProps
): TrackEventInput {
  return {
    eventType,
    source: source as any,
    entityId,
    entityType: entityType as any,
    sessionId: additionalProps?.sessionId,
    props: additionalProps?.props,
    attribution: additionalProps?.attribution,
    idempotencyKey: additionalProps?.idempotencyKey,
  };
}

/**
 * Track asset-related events
 */
export class AssetEventHelpers {
  /**
   * Track asset upload event
   */
  static trackAssetUpload(
    assetId: string,
    props: {
      fileSize: number;
      mimeType: string;
      assetType: string;
      projectId?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.ASSET_UPLOADED,
      EVENT_SOURCES.WEB,
      assetId,
      'asset',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track asset view event
   */
  static trackAssetView(
    assetId: string,
    props: {
      view_duration_ms?: number;
      referrer?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.ASSET_VIEWED,
      EVENT_SOURCES.WEB,
      assetId,
      'asset',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track asset download event
   */
  static trackAssetDownload(
    assetId: string,
    props: {
      fileSize: number;
      downloadMethod?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.ASSET_DOWNLOADED,
      EVENT_SOURCES.WEB,
      assetId,
      'asset',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track asset approval event
   */
  static trackAssetApproval(
    assetId: string,
    props: {
      approvedBy: string;
      comments?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.ASSET_APPROVED,
      EVENT_SOURCES.SYSTEM,
      assetId,
      'asset',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}

/**
 * Track license-related events
 */
export class LicenseEventHelpers {
  /**
   * Track license creation event
   */
  static trackLicenseCreate(
    licenseId: string,
    props: {
      licenseType: string;
      brandId: string;
      assetId: string;
      feeCents?: number;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.LICENSE_CREATED,
      EVENT_SOURCES.WEB,
      licenseId,
      'license',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track license signing event
   */
  static trackLicenseSigned(
    licenseId: string,
    props: {
      signedBy: string;
      signatureMethod: string;
      ipAddress?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.LICENSE_SIGNED,
      EVENT_SOURCES.WEB,
      licenseId,
      'license',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          license_id: licenseId,
          ...props,
        },
      }
    );
  }

  /**
   * Track license view event
   */
  static trackLicenseView(
    licenseId: string,
    props?: {
      viewDuration?: number;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.LICENSE_VIEWED,
      EVENT_SOURCES.WEB,
      licenseId,
      'license',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}

/**
 * Track project-related events
 */
export class ProjectEventHelpers {
  /**
   * Track project creation event
   */
  static trackProjectCreate(
    projectId: string,
    props: {
      projectType?: string;
      brandId?: string;
      creatorId?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.PROJECT_CREATED,
      EVENT_SOURCES.WEB,
      projectId,
      'project',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track project completion event
   */
  static trackProjectComplete(
    projectId: string,
    props?: {
      completedBy?: string;
      durationDays?: number;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.PROJECT_COMPLETED,
      EVENT_SOURCES.SYSTEM,
      projectId,
      'project',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}

/**
 * Track payment-related events
 */
export class PaymentEventHelpers {
  /**
   * Track payout completion event
   */
  static trackPayoutComplete(
    payoutId: string,
    props: {
      amount_cents: number;
      payment_method: string;
      recipientId: string;
      currency?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.PAYOUT_COMPLETED,
      EVENT_SOURCES.SYSTEM,
      payoutId,
      'payout',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track payout failure event
   */
  static trackPayoutFailed(
    payoutId: string,
    props: {
      errorCode: string;
      errorMessage: string;
      recipientId: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.PAYOUT_FAILED,
      EVENT_SOURCES.SYSTEM,
      payoutId,
      'payout',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}

/**
 * Track user-related events
 */
export class UserEventHelpers {
  /**
   * Track user login event
   */
  static trackUserLogin(
    userId: string,
    props: {
      loginMethod: string;
      success: boolean;
      ipAddress?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      props.success ? EVENT_TYPES.USER_LOGGED_IN : 'login_failed',
      EVENT_SOURCES.WEB,
      userId,
      'user',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track user profile update event
   */
  static trackProfileUpdate(
    userId: string,
    props: {
      fieldsUpdated: string[];
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.USER_PROFILE_UPDATED,
      EVENT_SOURCES.WEB,
      userId,
      'user',
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}

/**
 * Track search and engagement events
 */
export class EngagementEventHelpers {
  /**
   * Track search performed event
   */
  static trackSearch(
    props: {
      query: string;
      resultsCount: number;
      filters?: Record<string, any>;
      searchType?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.SEARCH_PERFORMED,
      EVENT_SOURCES.WEB,
      undefined,
      undefined,
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track CTA click event
   */
  static trackCTAClick(
    props: {
      ctaType: string;
      ctaText: string;
      ctaUrl?: string;
      pageUrl?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.CTA_CLICKED,
      EVENT_SOURCES.WEB,
      undefined,
      undefined,
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }

  /**
   * Track page view event
   */
  static trackPageView(
    props: {
      pageUrl: string;
      pageTitle?: string;
      referrer?: string;
    },
    baseProps?: BaseEventProps
  ): TrackEventInput {
    return buildTrackEventInput(
      EVENT_TYPES.PAGE_VIEWED,
      EVENT_SOURCES.WEB,
      undefined,
      undefined,
      {
        ...baseProps,
        props: {
          ...baseProps?.props,
          ...props,
        },
      }
    );
  }
}
