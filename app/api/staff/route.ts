import { NextRequest } from 'next/server';
import { staffService } from '@/services/staff.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { createStaffSchema, staffFilterSchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const { searchParams } = new URL(req.url);

    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedFilters = staffFilterSchema.parse(queryParams);

    const result = await staffService.listStaff(actor, validatedFilters);
    return apiResponse.success(result.items, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const body = await req.json();
    const validatedInput = createStaffSchema.parse(body);

    const staff = await staffService.createStaff(actor, validatedInput);
    return apiResponse.success(staff, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
