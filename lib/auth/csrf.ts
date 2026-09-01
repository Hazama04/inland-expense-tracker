import { NextRequest } from 'next/server';
import { ForbiddenError } from '../errors';

/**
 * Validates CSRF for state-changing requests using cookie-based authentication.
 * 
 * Rules:
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS) do not require CSRF validation.
 * 2. Requests using Authorization Bearer header are immune to browser CSRF.
 * 3. Cookie-authenticated state-changing requests (POST, PATCH, DELETE, PUT) must verify
 *    that the request Origin or Referer matches the application Host.
 */
export function validateCsrf(req: NextRequest, isCookieAuth: boolean): void {
  const method = req.method.toUpperCase();
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(method)) {
    return;
  }

  // If request uses Bearer token, CSRF is not applicable
  if (!isCookieAuth) {
    return;
  }

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');

  if (!host) {
    throw new ForbiddenError('CSRF verification failed: Missing Host header.');
  }

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw new ForbiddenError('CSRF verification failed: Origin mismatch.');
      }
      return;
    } catch {
      throw new ForbiddenError('CSRF verification failed: Malformed Origin header.');
    }
  }

  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost !== host) {
        throw new ForbiddenError('CSRF verification failed: Referer mismatch.');
      }
      return;
    } catch {
      throw new ForbiddenError('CSRF verification failed: Malformed Referer header.');
    }
  }

  // In production, if neither origin nor referer is provided on a cookie-based mutation, reject
  if (process.env.NODE_ENV === 'production') {
    throw new ForbiddenError('CSRF verification failed: Missing Origin/Referer on state-changing request.');
  }
}
