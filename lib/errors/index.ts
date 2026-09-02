export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED_WEBHOOK'
  | 'UNAUTHORIZED_WORKER'
  | 'STORAGE_CONFIG_ERROR'
  | 'BLOB_UPLOAD_FAILED'
  | 'BLOB_FETCH_FAILED'
  | 'GEMINI_CONFIG_ERROR'
  | 'GEMINI_UNAUTHORIZED'
  | 'GEMINI_FORBIDDEN'
  | 'GEMINI_MODEL_NOT_FOUND'
  | 'GEMINI_RATE_LIMIT'
  | 'GEMINI_SERVICE_UNAVAILABLE'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_MALFORMED_OUTPUT'
  | 'GEMINI_OCR_FAILED'
  | 'MEDIA_DOWNLOAD_FAILED'
  | 'MEDIA_DOWNLOAD_TIMEOUT'
  | 'SHEETS_CONFIG_ERROR'
  | 'SHEETS_AUTH_ERROR'
  | 'SHEETS_PERMISSION_DENIED'
  | 'SHEETS_NOT_FOUND'
  | 'SHEETS_RATE_LIMIT'
  | 'SHEETS_SERVICE_UNAVAILABLE'
  | 'SHEETS_TIMEOUT'
  | 'SHEETS_SYNC_FAILED';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code: ErrorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}
