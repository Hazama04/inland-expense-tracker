import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const SESSION_COOKIE_NAME = 'iet_session';

export const SESSION_COOKIE_OPTIONS: Partial<ResponseCookie> = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

/**
 * Extracts session token from HTTP Request.
 * Checks Authorization header first (`Bearer <token>`), then HttpOnly cookie.
 */
export function extractTokenFromRequest(
  authHeader: string | null,
  cookieValue: string | null | undefined
): string | null {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  if (cookieValue && cookieValue.trim()) {
    return cookieValue.trim();
  }

  return null;
}
