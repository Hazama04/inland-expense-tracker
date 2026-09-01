import { SignJWT, jwtVerify } from 'jose';
import { Staff, StaffRole } from '../../app/generated/prisma/client';

export interface SessionPayload {
  sub: string; // staffId (UUID)
  phoneNumber: string; // E.164 phone
  role: StaffRole;
  name: string;
  iat?: number;
  exp?: number;
}

const DEFAULT_DEV_SECRET = 'inland_expense_tracker_default_dev_secret_key_minimum_32_chars_long!';

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security Exception]: AUTH_SECRET or JWT_SECRET must be configured in production environment.');
    }
    return new TextEncoder().encode(DEFAULT_DEV_SECRET);
  }

  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security Exception]: AUTH_SECRET must be at least 32 characters long in production.');
    }
  }

  return new TextEncoder().encode(secret);
}

/**
 * Creates a cryptographically signed JWT session token.
 */
export async function createSessionToken(
  staff: Pick<Staff, 'id' | 'phoneNumber' | 'role' | 'name'>,
  expiresIn = '7d'
): Promise<string> {
  const secretKey = getJwtSecretKey();

  return new SignJWT({
    sub: staff.id,
    phoneNumber: staff.phoneNumber,
    role: staff.role,
    name: staff.name,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

/**
 * Cryptographically verifies a JWT session token and returns the parsed payload.
 * Returns null if the token is invalid, expired, or tampered with.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    if (!payload.sub || !payload.phoneNumber || !payload.role) {
      return null;
    }

    return {
      sub: payload.sub as string,
      phoneNumber: payload.phoneNumber as string,
      role: payload.role as StaffRole,
      name: (payload.name as string) || '',
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
