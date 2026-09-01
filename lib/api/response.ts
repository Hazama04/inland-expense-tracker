import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors';

export interface ApiResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T> {
  data: T;
  error: null;
  meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const apiResponse = {
  success<T>(data: T, meta?: ApiResponseMeta, status = 200) {
    const body: ApiSuccessResponse<T> = {
      data,
      error: null,
      ...(meta ? { meta } : {}),
    };
    return NextResponse.json(body, { status });
  },

  error(message: string, code = 'INTERNAL_ERROR', status = 500, details?: unknown) {
    const body: ApiErrorResponse = {
      data: null,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    };
    return NextResponse.json(body, { status });
  },
};

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return apiResponse.error(error.message, error.code, error.statusCode, error.details);
  }

  if (error instanceof ZodError) {
    const formatted = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return apiResponse.error('Validation failed', 'VALIDATION_ERROR', 400, formatted);
  }

  // Generic server errors — mask internal details to avoid leaking database/infrastructure info
  console.error('[API Error]:', error instanceof Error ? error.message : error);

  return apiResponse.error('An unexpected internal server error occurred', 'INTERNAL_ERROR', 500);
}
