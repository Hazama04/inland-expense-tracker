import { NextRequest, NextResponse } from 'next/server';
import { sheetsSyncService } from '@/services/sheets-sync.service';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron Endpoint for Google Sheets Synchronization.
 * 
 * Invocation:
 *   GET /api/cron/sync-sheets
 *   Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Authentication check
  if (cronSecret) {
    if (!token || token !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or missing cron secret token' },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Server configuration error: CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  try {
    // Process bounded batch of up to 20 due failures
    const summary = await sheetsSyncService.processDueSyncFailures(20);

    return NextResponse.json(
      {
        success: true,
        message: 'Google Sheets sync cron completed successfully',
        ...summary,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Cron Sheets Sync Fatal Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process Google Sheets sync cron',
      },
      { status: 500 }
    );
  }
}
