import { NextRequest } from 'next/server';
import { staffService } from '@/services/staff.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { updateStaffSchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActorFromRequest(req);
    const { id } = await params;

    const staff = await staffService.getStaffById(actor, id);
    return apiResponse.success(staff);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActorFromRequest(req);
    const { id } = await params;
    const body = await req.json();
    const validatedInput = updateStaffSchema.parse(body);

    const updated = await staffService.updateStaff(actor, id, validatedInput);
    return apiResponse.success(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
