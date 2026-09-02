import crypto from 'crypto';
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
 * Constant-time string comparison using SHA-256 digests to prevent timing side-channel attacks.
 */
function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Validates Fonnte inbound webhook authentication secret.
 * 
 * Strict Security Architecture:
 * 1. Webhook authentication source is EXCLUSIVELY `process.env.FONNTE_WEBHOOK_SECRET`.
 * 2. Inbound webhook credential is EXCLUSIVELY extracted from payload `body.secret_key`.
 * 3. `FONNTE_TOKEN` is NEVER used for inbound webhook authentication (reserved exclusively for outbound API in `lib/fonnte.ts`).
 * 4. Fallback aliases (`FONNTE_WEBHOOK_TOKEN`, `FONNTE_API_TOKEN`, headers, query params) are NOT accepted.
 * 5. In production or test when configured, missing or invalid secret fails closed immediately with 401.
 */
function verifyWebhookSecret(body?: unknown): boolean {
  const expectedSecret = process.env.FONNTE_WEBHOOK_SECRET;

  const isSecretConfigured = typeof expectedSecret === 'string' && expectedSecret.trim().length > 0;

  if (!isSecretConfigured) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Security Exception]: FONNTE_WEBHOOK_SECRET is required in production.');
    } else {
      console.warn('[Webhook Auth]: FONNTE_WEBHOOK_SECRET is not configured in environment.');
    }
    console.log(
      `[Webhook Auth] webhook_secret_configured=false webhook_secret_present=false webhook_authentication=failed`
    );
    return false;
  }

  let bodySecretKey: string | null = null;
  if (body && typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.secret_key === 'string' && b.secret_key.trim().length > 0) {
      bodySecretKey = b.secret_key.trim();
    }
  }

  const isSecretPresent = !!bodySecretKey;
  const isAuthenticated = isSecretPresent && secureCompare(bodySecretKey!, expectedSecret.trim());

  // Safe diagnostic logging — NEVER logs raw secrets or keys
  console.log(
    `[Webhook Auth] webhook_secret_configured=${isSecretConfigured} webhook_secret_present=${isSecretPresent} webhook_authentication=${isAuthenticated ? 'success' : 'failed'}`
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

  // 2. Layer 1 Security: Webhook Secret Verification (Strict body.secret_key against FONNTE_WEBHOOK_SECRET)
  if (!verifyWebhookSecret(rawBody)) {
    console.warn('[Webhook Rejected]: Invalid or missing Fonnte webhook secret.');
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
