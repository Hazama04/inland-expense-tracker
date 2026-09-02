import { NextRequest, NextResponse } from 'next/server';
import { staffService } from '@/services/staff.service';
import { expenseService } from '@/services/expense.service';
import { receiptService } from '@/services/receipt.service';
import { categoryRepository } from '@/repositories/category.repository';
import { normalizePhoneNumber } from '@/lib/phone';
import { fonnteWebhookPayloadSchema } from '@/lib/validation/fonnte';
import { parseWhatsAppMessage } from '@/lib/parser';
import { fonnteClient, formatIDR } from '@/lib/fonnte';
import { ExpenseStatus } from '@/app/generated/prisma/client';
import { Actor } from '@/lib/auth/authorization';

// In-memory idempotency cache for recent webhook message IDs (sliding window of 1000 items)
const processedMessageIds = new Set<string>();
function isDuplicateMessage(messageId?: string | null): boolean {
  if (!messageId) return false;
  if (processedMessageIds.has(messageId)) {
    return true;
  }
  if (processedMessageIds.size > 1000) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  processedMessageIds.add(messageId);
  return false;
}

/**
 * Background task scheduler using Next.js `after()` for serverless-safe deferred execution.
 *
 * Next.js `after()` guarantees that the callback runs after the HTTP response has been sent,
 * even on serverless platforms (Vercel) where un-awaited floating promises can be frozen/killed.
 *
 * Exported as a mutable object property so tests can override `backgroundScheduler.schedule`
 * with a synchronous implementation without requiring a real Next.js request context.
 */
export const backgroundScheduler = {
  schedule: (fn: () => Promise<void>): void => {
    // Lazily import after() so it is only invoked inside a live Next.js request context.
    // Direct import at module level would attempt to call after() during module evaluation.
    import('next/server').then(({ after }) => after(fn)).catch((err) =>
      console.error('[Receipt Background] failed to schedule via after():', err)
    );
  },
};

/**
 * Validates Fonnte webhook authentication token / secret across:
 * 1. Authorization header (Bearer <token> or raw <token>)
 * 2. Token custom headers (`x-fonnte-token`, `token`)
 * 3. Body payload fields (Fonnte official `secret_key`, `token`, `secret`)
 * 4. Query string parameters (`?token=...`, `?secret_key=...`, `?secret=...`)
 */
function verifyWebhookSecret(req: NextRequest, body?: unknown): boolean {
  const expectedSecret =
    process.env.FONNTE_WEBHOOK_TOKEN ||
    process.env.FONNTE_TOKEN ||
    process.env.FONNTE_API_TOKEN;

  // In development/test if no secret is configured, allow for local testing with warning
  if (!expectedSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Security Exception]: FONNTE_TOKEN or FONNTE_WEBHOOK_TOKEN is required in production.');
      return false;
    }
    return true;
  }

  // 1. Authorization header (Bearer <token> or raw <token>)
  const authHeader = req.headers.get('authorization');
  let bearerToken: string | null = null;
  if (authHeader) {
    bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }

  // 2. Custom token headers
  const tokenHeader =
    req.headers.get('x-fonnte-token')?.trim() ||
    req.headers.get('token')?.trim() ||
    null;

  // 3. Body payload fields (Fonnte official `secret_key`, `token`, `secret`)
  let bodyToken: string | null = null;
  if (body && typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.secret_key === 'string') bodyToken = b.secret_key.trim();
    else if (typeof b.token === 'string') bodyToken = b.token.trim();
    else if (typeof b.secret === 'string') bodyToken = b.secret.trim();
  }

  // 4. Query string parameters (?token=... or ?secret_key=... or ?secret=...)
  const searchParams = req.nextUrl.searchParams;
  const urlToken =
    searchParams.get('token')?.trim() ||
    searchParams.get('secret_key')?.trim() ||
    searchParams.get('secret')?.trim() ||
    null;

  const providedToken = bearerToken || tokenHeader || bodyToken || urlToken;
  const isAuthenticated = providedToken === expectedSecret;

  // Safe diagnostic logging — NEVER logs secrets or tokens
  const authMethod = bearerToken
    ? 'authorization'
    : tokenHeader
    ? 'token_header'
    : bodyToken
    ? 'body_payload'
    : urlToken
    ? 'query_param'
    : 'none';

  console.log(
    `[Webhook Auth] authorization_present=${!!authHeader} token_header_present=${!!tokenHeader} body_token_present=${!!bodyToken} query_token_present=${!!urlToken} expected_token_configured=${!!expectedSecret} authentication_method=${authMethod} authentication_result=${isAuthenticated ? 'success' : 'rejected'}`
  );

  return isAuthenticated;
}

export async function POST(req: NextRequest) {
  // 1. Parse Request Body safely
  let rawBody: unknown;
  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      rawBody = await req.json();
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const formData = await req.formData();
      const entries: Record<string, string> = {};
      formData.forEach((value, key) => {
        if (typeof value === 'string') entries[key] = value;
      });
      rawBody = entries;
    } else {
      const text = await req.text();
      try {
        rawBody = JSON.parse(text);
      } catch {
        rawBody = text;
      }
    }
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'INVALID_PAYLOAD', message: 'Unable to parse request body' } },
      { status: 400 }
    );
  }

  // 2. Layer 1 Security: Webhook Secret Verification (Header, Query, or Body payload)
  if (!verifyWebhookSecret(req, rawBody)) {
    console.warn('[Webhook Rejected]: Invalid or missing Fonnte webhook token.');
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED_WEBHOOK', message: 'Unauthorized webhook request' } },
      { status: 401 }
    );
  }

  // 3. Payload Validation
  const parsedPayload = fonnteWebhookPayloadSchema.safeParse(rawBody);
  if (!parsedPayload.success) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid Fonnte payload schema' } },
      { status: 400 }
    );
  }

  const payload = parsedPayload.data;
  const messageId = payload.id || payload.message_id;

  // 3. Idempotency Check
  if (isDuplicateMessage(messageId)) {
    return NextResponse.json({ data: { status: 'ignored_duplicate', messageId }, error: null });
  }

  // 4. Layer 2 Security: Phone Normalization & Whitelist Verification
  let normalizedSender: string;
  try {
    normalizedSender = normalizePhoneNumber(payload.sender);
  } catch {
    console.warn(`[Webhook Rejected]: Malformed sender phone number "${payload.sender}"`);
    return NextResponse.json(
      { data: null, error: { code: 'INVALID_PHONE', message: 'Sender phone number format is invalid' } },
      { status: 400 }
    );
  }

  const staff = await staffService.getActiveStaffByPhone(normalizedSender);
  if (!staff || !staff.isActive) {
    console.warn(`[Webhook Whitelist Blocked]: Unauthorized sender "${normalizedSender}"`);
    // Reply with PRD standard rejection message
    await fonnteClient.sendMessage({
      target: payload.sender,
      message: fonnteClient.formatUnauthorizedMessage(),
    });

    return NextResponse.json({
      data: { status: 'rejected_unauthorized', sender: normalizedSender },
      error: null,
    });
  }

  // 5. Construct Trusted Server-Side Actor Context
  const actor: Actor = {
    id: staff.id,
    name: staff.name,
    phoneNumber: staff.phoneNumber,
    role: staff.role,
    isActive: staff.isActive,
  };

  // 6. Message Classification
  const command = parseWhatsAppMessage({
    message: payload.message,
    mediaUrl: payload.url || payload.file || payload.image,
  });

  // 7. Route Command Execution
  switch (command.type) {
    case 'IMAGE': {
      // 1. Fast acknowledgment for receipt image ingestion
      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatReceiptReceived(),
      });

      // 2. Schedule receipt processing as reliable background work via scheduleBackground().
      //    In production this delegates to Next.js after() which guarantees the pipeline
      //    gets an execution opportunity even after the HTTP response is returned on serverless
      //    platforms (Vercel) where un-awaited floating promises can be frozen/killed.
      if (command.mediaUrl) {
        const correlationId = messageId ?? `no-id-${Date.now()}`;
        console.log(`[Receipt Background] scheduled | correlationId=${correlationId} | sender=${normalizedSender}`);
        backgroundScheduler.schedule(async () => {
          try {
            console.log(`[Receipt Background] started | correlationId=${correlationId}`);
            const result = await receiptService.processReceipt({
              messageId: messageId ?? undefined,
              senderPhone: normalizedSender,
              mediaUrl: command.mediaUrl!,
              mimeType: payload.file ? undefined : 'image/jpeg',
            });
            if (result.success) {
              console.log(`[Receipt Background] completed | correlationId=${correlationId} | expenseId=${result.expenseId}`);
            } else {
              console.warn(`[Receipt Background] failed | correlationId=${correlationId} | reason=${result.error}`);
            }
          } catch (err) {
            console.error(
              `[Receipt Background] unhandled error | correlationId=${correlationId} |`,
              err instanceof Error ? err.message : String(err)
            );
          }
        });
      }

      return NextResponse.json({
        data: {
          status: 'receipt_received',
          sender: normalizedSender,
          mediaUrl: command.mediaUrl,
        },
        error: null,
      });
    }

    case 'MANUAL_EXPENSE': {
      // Find matching category by name or keywords
      const matchedCategory = await categoryRepository.findByName(command.category);

      const expense = await expenseService.createExpense(
        actor,
        {
          staffId: actor.id,
          merchant: command.merchant,
          amount: command.amount,
          transactionDate: new Date(),
          categoryId: matchedCategory?.id || null,
          status: ExpenseStatus.INPUT_MANUAL,
          notes: 'Input manual via WhatsApp bot',
        },
        { isManualInput: true }
      );

      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatManualExpenseSuccess(expense),
      });

      return NextResponse.json({
        data: { status: 'manual_expense_created', expenseId: expense.id },
        error: null,
      });
    }

    case 'CATEGORY_CORRECTION': {
      const lastExpense = await expenseService.getLastExpenseForCorrection(actor.id, 30);
      if (!lastExpense) {
        await fonnteClient.sendMessage({
          target: payload.sender,
          message: fonnteClient.formatNoRecentExpenseMessage(),
        });
        return NextResponse.json({ data: { status: 'no_recent_expense' }, error: null });
      }

      const matchedCategory = await categoryRepository.findByName(command.category);
      const updated = await expenseService.updateExpense(actor, lastExpense.id, {
        categoryId: matchedCategory?.id || null,
      });

      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatCorrectionSuccess(
          'Kategori',
          matchedCategory?.name || command.category,
          updated
        ),
      });

      return NextResponse.json({
        data: { status: 'category_updated', expenseId: updated.id },
        error: null,
      });
    }

    case 'AMOUNT_CORRECTION': {
      const lastExpense = await expenseService.getLastExpenseForCorrection(actor.id, 30);
      if (!lastExpense) {
        await fonnteClient.sendMessage({
          target: payload.sender,
          message: fonnteClient.formatNoRecentExpenseMessage(),
        });
        return NextResponse.json({ data: { status: 'no_recent_expense' }, error: null });
      }

      const updated = await expenseService.updateExpense(actor, lastExpense.id, {
        amount: command.amount,
      });

      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatCorrectionSuccess(
          'Nominal',
          formatIDR(command.amount),
          updated
        ),
      });

      return NextResponse.json({
        data: { status: 'amount_updated', expenseId: updated.id },
        error: null,
      });
    }

    case 'NOTE_CORRECTION': {
      const lastExpense = await expenseService.getLastExpenseForCorrection(actor.id, 30);
      if (!lastExpense) {
        await fonnteClient.sendMessage({
          target: payload.sender,
          message: fonnteClient.formatNoRecentExpenseMessage(),
        });
        return NextResponse.json({ data: { status: 'no_recent_expense' }, error: null });
      }

      const updated = await expenseService.updateExpense(actor, lastExpense.id, {
        notes: command.note,
      });

      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatCorrectionSuccess('Catatan', command.note, updated),
      });

      return NextResponse.json({
        data: { status: 'notes_updated', expenseId: updated.id },
        error: null,
      });
    }

    case 'HISTORY': {
      const result = await expenseService.listExpenses(actor, { page: 1, pageSize: 5 });
      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatHistoryMessage(result.items, actor.name),
      });

      return NextResponse.json({
        data: { status: 'history_sent', count: result.items.length },
        error: null,
      });
    }

    case 'MONTH_TOTAL': {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const result = await expenseService.listExpenses(actor, {
        startDate,
        endDate,
        pageSize: 100,
      });

      const total = result.items.reduce((acc, curr) => acc + parseFloat(curr.amount.toString()), 0);
      const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now);

      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatMonthTotalMessage(total, result.meta.total || result.items.length, monthName, actor.name),
      });

      return NextResponse.json({
        data: { status: 'month_total_sent', total },
        error: null,
      });
    }

    case 'HELP': {
      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatHelpMessage(),
      });

      return NextResponse.json({ data: { status: 'help_sent' }, error: null });
    }

    case 'UNRECOGNIZED':
    default: {
      await fonnteClient.sendMessage({
        target: payload.sender,
        message: fonnteClient.formatUnrecognizedCommandMessage(),
      });

      return NextResponse.json({ data: { status: 'unrecognized_sent' }, error: null });
    }
  }
}
