import { NextRequest } from 'next/server';
import { auditService } from '@/services/audit.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { auditLogFilterSchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const { searchParams } = new URL(req.url);

    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedFilters = auditLogFilterSchema.parse(queryParams);

    const result = await auditService.listAuditLogs(actor, validatedFilters);
    return apiResponse.success(result.items, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}
