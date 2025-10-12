/**
 * Messaging Module - Custom Errors
 */

export class MessageError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'MessageError';
  }
}

// Thread-specific errors
export class ThreadNotFoundError extends MessageError {
  constructor(threadId: string) {
    super('THREAD_NOT_FOUND', `Thread ${threadId} not found`, 404);
    this.name = 'ThreadNotFoundError';
  }
}

export class ThreadAccessDeniedError extends MessageError {
  constructor(threadId: string) {
    super('THREAD_ACCESS_DENIED', `Access denied to thread ${threadId}`, 403);
    this.name = 'ThreadAccessDeniedError';
  }
}

export class InvalidParticipantsError extends MessageError {
  constructor(message: string = 'Invalid participants for thread') {
    super('INVALID_PARTICIPANTS', message, 400);
    this.name = 'InvalidParticipantsError';
  }
}

// Message-specific errors
export class MessageNotFoundError extends MessageError {
  constructor(messageId: string) {
    super('MESSAGE_NOT_FOUND', `Message ${messageId} not found`, 404);
    this.name = 'MessageNotFoundError';
  }
}

export class MessageAccessDeniedError extends MessageError {
  constructor(messageId: string) {
    super('MESSAGE_ACCESS_DENIED', `Access denied to message ${messageId}`, 403);
    this.name = 'MessageAccessDeniedError';
  }
}

export class CannotMessageUserError extends MessageError {
  constructor(reason: string) {
    super('CANNOT_MESSAGE_USER', `Cannot send message: ${reason}`, 403);
    this.name = 'CannotMessageUserError';
  }
}

export class RateLimitExceededError extends MessageError {
  constructor(resetAt: Date) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Message rate limit exceeded. Resets at ${resetAt.toISOString()}`,
      429
    );
    this.name = 'RateLimitExceededError';
  }
}

// Attachment-specific errors
export class AttachmentNotFoundError extends MessageError {
  constructor(attachmentId: string) {
    super('ATTACHMENT_NOT_FOUND', `Attachment ${attachmentId} not found`, 404);
    this.name = 'AttachmentNotFoundError';
  }
}

export class AttachmentTooLargeError extends MessageError {
  constructor(maxSize: number) {
    super(
      'ATTACHMENT_TOO_LARGE',
      `Attachment exceeds maximum size of ${maxSize} bytes`,
      400
    );
    this.name = 'AttachmentTooLargeError';
  }
}

export class InvalidAttachmentTypeError extends MessageError {
  constructor(mimeType: string) {
    super('INVALID_ATTACHMENT_TYPE', `File type ${mimeType} is not allowed`, 400);
    this.name = 'InvalidAttachmentTypeError';
  }
}
