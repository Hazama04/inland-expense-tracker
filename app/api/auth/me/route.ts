import { NextRequest } from 'next/server';
import { getActorFromRequest } from '@/lib/auth/context';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    return apiResponse.success({
      id: actor.id,
      name: actor.name,
      phoneNumber: actor.phoneNumber,
      role: actor.role,
      isActive: actor.isActive,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
