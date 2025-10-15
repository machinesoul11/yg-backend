/**
 * Report Error Classes
 * 
 * Custom error classes for report generation and processing
 */

export class ReportError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'REPORT_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ReportError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ReportNotFoundError extends ReportError {
  constructor(reportId: string, details?: Record<string, any>) {
    super(
      `Report with ID ${reportId} not found`,
      'REPORT_NOT_FOUND',
      404,
      { reportId, ...details }
    );
    this.name = 'ReportNotFoundError';
  }
}

export class ReportGenerationError extends ReportError {
  constructor(message: string, details?: Record<string, any>) {
    super(
      `Report generation failed: ${message}`,
      'REPORT_GENERATION_FAILED',
      500,
      details
    );
    this.name = 'ReportGenerationError';
  }
}

export class ReportExportError extends ReportError {
  constructor(format: string, message: string, details?: Record<string, any>) {
    super(
      `Report export to ${format} failed: ${message}`,
      'REPORT_EXPORT_FAILED',
      500,
      { format, ...details }
    );
    this.name = 'ReportExportError';
  }
}

export class ReportValidationError extends ReportError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(
      `Report validation failed: ${message}`,
      'REPORT_VALIDATION_FAILED',
      400,
      { fieldErrors }
    );
    this.name = 'ReportValidationError';
  }
}

export class ReportAccessDeniedError extends ReportError {
  constructor(userId: string, reportId: string, action: string) {
    super(
      `Access denied: User ${userId} cannot ${action} report ${reportId}`,
      'REPORT_ACCESS_DENIED',
      403,
      { userId, reportId, action }
    );
    this.name = 'ReportAccessDeniedError';
  }
}

export class ReportConfigurationError extends ReportError {
  constructor(message: string, configField?: string, details?: Record<string, any>) {
    super(
      `Report configuration error: ${message}`,
      'REPORT_CONFIG_ERROR',
      400,
      { configField, ...details }
    );
    this.name = 'ReportConfigurationError';
  }
}

export class ReportDataSourceError extends ReportError {
  constructor(source: string, message: string, details?: Record<string, any>) {
    super(
      `Data source error (${source}): ${message}`,
      'REPORT_DATA_SOURCE_ERROR',
      500,
      { source, ...details }
    );
    this.name = 'ReportDataSourceError';
  }
}

export class ReportTemplateError extends ReportError {
  constructor(templateId: string, message: string, details?: Record<string, any>) {
    super(
      `Template error (${templateId}): ${message}`,
      'REPORT_TEMPLATE_ERROR',
      500,
      { templateId, ...details }
    );
    this.name = 'ReportTemplateError';
  }
}

export class ReportTimeoutError extends ReportError {
  constructor(timeout: number, details?: Record<string, any>) {
    super(
      `Report generation timed out after ${timeout}ms`,
      'REPORT_TIMEOUT',
      408,
      { timeout, ...details }
    );
    this.name = 'ReportTimeoutError';
  }
}

export class ReportCacheError extends ReportError {
  constructor(message: string, operation: string, details?: Record<string, any>) {
    super(
      `Cache operation failed (${operation}): ${message}`,
      'REPORT_CACHE_ERROR',
      500,
      { operation, ...details }
    );
    this.name = 'ReportCacheError';
  }
}

export class ReportSchedulingError extends ReportError {
  constructor(scheduleId: string, message: string, details?: Record<string, any>) {
    super(
      `Scheduling error (${scheduleId}): ${message}`,
      'REPORT_SCHEDULING_ERROR',
      500,
      { scheduleId, ...details }
    );
    this.name = 'ReportSchedulingError';
  }
}

export class ReportConcurrencyError extends ReportError {
  constructor(reportType: string, message: string, details?: Record<string, any>) {
    super(
      `Concurrency limit exceeded for ${reportType}: ${message}`,
      'REPORT_CONCURRENCY_ERROR',
      429,
      { reportType, ...details }
    );
    this.name = 'ReportConcurrencyError';
  }
}

export class ReportSizeError extends ReportError {
  constructor(actualSize: number, maxSize: number, details?: Record<string, any>) {
    super(
      `Report size ${actualSize} bytes exceeds maximum allowed size of ${maxSize} bytes`,
      'REPORT_SIZE_ERROR',
      413,
      { actualSize, maxSize, ...details }
    );
    this.name = 'ReportSizeError';
  }
}

export class ReportFormatError extends ReportError {
  constructor(format: string, supportedFormats: string[], details?: Record<string, any>) {
    super(
      `Unsupported report format: ${format}. Supported formats: ${supportedFormats.join(', ')}`,
      'REPORT_FORMAT_ERROR',
      400,
      { format, supportedFormats, ...details }
    );
    this.name = 'ReportFormatError';
  }
}

export class ReportDependencyError extends ReportError {
  constructor(dependency: string, message: string, details?: Record<string, any>) {
    super(
      `Dependency error (${dependency}): ${message}`,
      'REPORT_DEPENDENCY_ERROR',
      503,
      { dependency, ...details }
    );
    this.name = 'ReportDependencyError';
  }
}

/**
 * Error handler utility
 */
export function handleReportError(error: unknown): ReportError {
  if (error instanceof ReportError) {
    return error;
  }

  if (error instanceof Error) {
    return new ReportError(
      error.message,
      'UNKNOWN_REPORT_ERROR',
      500,
      { originalError: error.name }
    );
  }

  return new ReportError(
    'An unknown error occurred during report processing',
    'UNKNOWN_REPORT_ERROR',
    500,
    { error: String(error) }
  );
}

/**
 * Error classification utility
 */
export function classifyReportError(error: ReportError): {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'user' | 'system' | 'external' | 'config';
  retryable: boolean;
} {
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  let category: 'user' | 'system' | 'external' | 'config' = 'system';
  let retryable = false;

  switch (error.code) {
    case 'REPORT_NOT_FOUND':
    case 'REPORT_VALIDATION_FAILED':
    case 'REPORT_FORMAT_ERROR':
      severity = 'low';
      category = 'user';
      break;

    case 'REPORT_ACCESS_DENIED':
      category = 'user';
      break;

    case 'REPORT_TIMEOUT_ERROR':
    case 'REPORT_RATE_LIMIT_EXCEEDED':
      retryable = true;
      break;

    case 'REPORT_DATA_SOURCE_ERROR':
    case 'REPORT_DEPENDENCY_ERROR':
      severity = 'high';
      category = 'external';
      retryable = true;
      break;

    case 'REPORT_GENERATION_FAILED':
    case 'REPORT_EXPORT_ERROR':
      severity = 'high';
      break;

    case 'REPORT_CONFIG_ERROR':
    case 'REPORT_TEMPLATE_ERROR':
      category = 'config';
      break;

    case 'REPORT_SIZE_ERROR':
    case 'REPORT_CACHE_ERROR':
      severity = 'low';
      retryable = true;
      break;

    case 'REPORT_SCHEDULING_ERROR':
      retryable = true;
      break;

    default:
      severity = 'high';
      break;
  }

  return { severity, category, retryable };
}
