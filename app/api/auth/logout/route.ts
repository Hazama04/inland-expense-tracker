import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { apiResponse } from '@/lib/api/response';

export async function POST() {
  const response = apiResponse.success({
    message: 'Logged out successfully',
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });

  return response;
}
