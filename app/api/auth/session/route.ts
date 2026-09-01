import { NextRequest } from 'next/server';
import { staffRepository } from '@/repositories/staff.repository';
import { createSessionSchema } from '@/lib/validation/schemas';
import { createSessionToken } from '@/lib/auth/token';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';
import { apiResponse, handleApiError } from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber } = createSessionSchema.parse(body);

    const staff = await staffRepository.findActiveByPhone(phoneNumber);
    if (!staff) {
      throw new UnauthorizedError('Phone number is not registered as active staff or whitelist is inactive.');
    }

    const token = await createSessionToken(staff);

    const response = apiResponse.success({
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        phoneNumber: staff.phoneNumber,
        role: staff.role,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      ...SESSION_COOKIE_OPTIONS,
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
