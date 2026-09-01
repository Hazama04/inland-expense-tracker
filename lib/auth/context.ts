import { NextRequest } from 'next/server';
import { staffRepository } from '../../repositories/staff.repository';
import { Actor } from './authorization';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { verifySessionToken } from './token';
import { SESSION_COOKIE_NAME, extractTokenFromRequest } from './session';
import { validateCsrf } from './csrf';
import { normalizePhoneNumber } from '../phone';

/**
 * Resolves the authenticated actor from the incoming HTTP request.
 * 
 * Production Flow:
 * 1. Extracts JWT session token from Authorization: Bearer <token> or HttpOnly iet_session cookie.
 * 2. Cryptographically verifies token integrity and expiration.
 * 3. Enforces CSRF check for state-changing cookie requests.
 * 4. Resolves the current Staff record from database to verify active whitelist status and load trusted role.
 * 
 * Development-Only Adapter:
 * - Allows x-actor-phone or x-actor-id ONLY when:
 *   a) NODE_ENV !== 'production'
 *   b) ALLOW_DEV_ACTOR_HEADER === 'true'
 * - Fails closed in production or if flag is not set.
 */
export async function getActorFromRequest(req: NextRequest): Promise<Actor> {
  const authHeader = req.headers.get('authorization');
  const cookieValue = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  const isCookieAuth = !authHeader && !!cookieValue;
  const token = extractTokenFromRequest(authHeader, cookieValue);

  if (token) {
    const payload = await verifySessionToken(token);
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired authentication session');
    }

    // CSRF verification for cookie-authenticated mutations
    validateCsrf(req, isCookieAuth);

    // Resolve staff from database to ensure fresh state and prevent stale/tampered claims
    const staff = await staffRepository.findById(payload.sub);
    if (!staff) {
      throw new UnauthorizedError('Authenticated staff member not found in database');
    }

    if (!staff.isActive) {
      throw new ForbiddenError('Account is inactive or not whitelisted');
    }

    // Return trusted actor (role derived directly from database)
    return {
      id: staff.id,
      name: staff.name,
      phoneNumber: staff.phoneNumber,
      role: staff.role,
      isActive: staff.isActive,
    };
  }

  // =========================================================================
  // ISOLATED DEVELOPMENT ADAPTER (Strictly disabled in production)
  // =========================================================================
  const isDevAuthAllowed =
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEV_ACTOR_HEADER === 'true';

  if (isDevAuthAllowed) {
    const devActorPhone = req.headers.get('x-actor-phone');
    const devActorId = req.headers.get('x-actor-id');

    if (devActorPhone) {
      try {
        const normalized = normalizePhoneNumber(devActorPhone);
        const staff = await staffRepository.findActiveByPhone(normalized);
        if (staff) {
          return {
            id: staff.id,
            name: staff.name,
            phoneNumber: staff.phoneNumber,
            role: staff.role,
            isActive: staff.isActive,
          };
        }
      } catch {
        // Invalid phone in dev header
      }
    }

    if (devActorId) {
      const staff = await staffRepository.findById(devActorId);
      if (staff && staff.isActive) {
        return {
          id: staff.id,
          name: staff.name,
          phoneNumber: staff.phoneNumber,
          role: staff.role,
          isActive: staff.isActive,
        };
      }
    }
  }

  throw new UnauthorizedError('Authentication required. Please provide a valid session token.');
}
