import { NextRequest } from 'next/server';
import { getActorFromRequest } from '@/lib/auth/context';
import { expenseService } from '@/services/expense.service';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const stats = await expenseService.getDashboardStats(actor);
    return apiResponse.success(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
