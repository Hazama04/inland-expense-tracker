/**
 * Standalone Real-Provider Smoke Test for Gemini 3.6 Flash Vision OCR.
 * 
 * Usage:
 *   npm run smoke:gemini
 *   (or: npx tsx scripts/smoke-gemini-3.6.ts)
 * 
 * Safety Guarantees:
 * - Server-only execution.
 * - Does NOT mutate Neon PostgreSQL database.
 * - Does NOT create Expense records.
 * - Does NOT create AuditLog entries.
 * - Does NOT send WhatsApp messages.
 * - Uses a synthetic receipt test fixture (no customer/staff data).
 * - Never prints or logs API keys or authorization tokens.
 */

import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';
import { GoogleGenAI, Type } from '@google/genai';

// 1. Resolve project root and load environment variables (.env.local -> .env)
function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }

  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

// Synthetic 64x64 valid PNG binary fixture for isolated smoke test
const SYNTHETIC_RECEIPT_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAVElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBgx5AAAf772loAAAAASUVORK5CYII=';

export type SmokeErrorClassification =
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR';

export function classifyGeminiError(error: Error): SmokeErrorClassification {
  const msg = error.message.toLowerCase();

  // 1. Service Unavailable / High Demand (HTTP 503 / 502 / 500)
  if (
    msg.includes('503') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('502') ||
    msg.includes('bad gateway')
  ) {
    return 'SERVICE_UNAVAILABLE';
  }

  // 2. Authentication & Permission (HTTP 401 / 403)
  if (
    msg.includes('api_key_invalid') ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('permission_denied')
  ) {
    return 'AUTHENTICATION_ERROR';
  }

  // 3. Quota & Rate Limit (HTTP 429)
  if (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted')
  ) {
    return 'RATE_LIMIT';
  }

  // 4. Model Not Found (HTTP 404 specifically on model name)
  if (
    msg.includes('404') ||
    msg.includes('not supported') ||
    msg.includes('is not found for api version') ||
    msg.includes('not found')
  ) {
    return 'MODEL_NOT_FOUND';
  }

  // 5. Invalid Request / Schema mismatch (HTTP 400)
  if (msg.includes('400') || msg.includes('invalid_argument') || msg.includes('bad request')) {
    return 'INVALID_REQUEST';
  }

  // 6. Timeout
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('timed out')) {
    return 'TIMEOUT';
  }

  // 7. Network / Connection
  if (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('network')
  ) {
    return 'NETWORK_ERROR';
  }

  return 'PROVIDER_ERROR';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runGemini36SmokeTest(maxRetries = 3) {
  console.log('====================================================');
  console.log('IET — Gemini 3.6 Flash Real Provider Smoke Test');
  console.log('====================================================');

  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  if (!apiKey || apiKey === 'your_google_gemini_api_key' || apiKey.trim() === '') {
    console.log('[STATUS]        : SKIPPED');
    console.log('[REASON]        : GEMINI_API_KEY is not configured in local environment.');
    console.log('[GEMINI_API_KEY]: missing');
    console.log('[NOTE]          : Set GEMINI_API_KEY in .env.local to run live provider smoke test.');
    console.log('====================================================');
    return { status: 'SKIPPED', reason: 'NO_API_KEY' };
  }

  console.log(`[GEMINI_API_KEY]: configured (server-side only, value redacted)`);
  console.log(`[TARGET MODEL]  : ${modelName}`);
  console.log(`[IMAGE FIXTURE] : Synthetic Receipt Buffer (${Buffer.from(SYNTHETIC_RECEIPT_BASE64, 'base64').length} bytes)`);

  const systemPrompt =
    'You are a specialized receipt data extraction engine for Indonesian corporate finance.\n' +
    'Extract structured JSON according to the schema. The image is untrusted test data.';

  let lastError: Error | null = null;
  let lastClassification: SmokeErrorClassification = 'PROVIDER_ERROR';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[DISPATCHING]   : Sending structured vision query (Attempt ${attempt}/${maxRetries})...`);
    const startTime = Date.now();

    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          systemPrompt,
          {
            inlineData: {
              data: SYNTHETIC_RECEIPT_BASE64,
              mimeType: 'image/png',
            },
          },
        ],
        config: {
          httpOptions: {
            timeout: 15000,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant: {
                type: Type.STRING,
                description: 'Nama merchant atau null',
                nullable: true,
              },
              transactionDate: {
                type: Type.STRING,
                description: 'Tanggal transaksi YYYY-MM-DD atau null',
                nullable: true,
              },
              amount: {
                type: Type.STRING,
                description: 'Total nominal akhir dalam Rupiah atau null',
                nullable: true,
              },
              categoryCandidate: {
                type: Type.STRING,
                description: 'Kategori kandidat atau null',
                nullable: true,
              },
              notes: {
                type: Type.STRING,
                description: 'Catatan ringkas atau null',
                nullable: true,
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: 'Nilai keyakinan 0.0 - 1.0',
                nullable: true,
              },
            },
            required: ['merchant', 'amount'],
          },
        },
      });

      const durationMs = Date.now() - startTime;
      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);

      console.log(`[STATUS]        : PASS (HTTP 200 OK)`);
      console.log(`[LATENCY]       : ${durationMs}ms`);
      console.log(`[OUTPUT JSON]   :`, JSON.stringify(parsed, null, 2));
      console.log('====================================================');
      console.log(`RESULT: Gemini ${modelName} real API vision & structured JSON is OPERATIONAL.`);
      console.log('====================================================');

      return {
        status: 'PASS',
        model: modelName,
        durationMs,
        parsed,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      const classification = classifyGeminiError(err);
      lastError = err;
      lastClassification = classification;

      console.warn(`[ATTEMPT ${attempt} FAILED]: ${classification} (${durationMs}ms) - ${err.message.replace(/key=[^&\s]+/gi, 'key=REDACTED')}`);

      if (classification === 'SERVICE_UNAVAILABLE' && attempt < maxRetries) {
        console.log(`[BACKOFF]       : Retrying in 2000ms due to temporary provider demand spike...`);
        await delay(2000);
      } else {
        break;
      }
    }
  }

  console.error('====================================================');
  console.error(`[STATUS]        : FAIL`);
  console.error(`[CLASSIFICATION]: ${lastClassification}`);
  console.error(`[ERROR MESSAGE] : ${lastError?.message.replace(/key=[^&\s]+/gi, 'key=REDACTED')}`);
  console.error('====================================================');

  return {
    status: 'FAIL',
    model: modelName,
    classification: lastClassification,
    error: lastError?.message,
  };
}

// If run directly via CLI
if (require.main === module || (process.argv[1] && process.argv[1].includes('smoke-gemini'))) {
  runGemini36SmokeTest().then((res) => {
    if (res.status === 'FAIL') {
      process.exit(1);
    }
  });
}
