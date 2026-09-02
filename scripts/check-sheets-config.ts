/**
 * Standalone Configuration & Credential Parse Verification Script.
 * 
 * Safety & Privacy Rules:
 * - NEVER prints or logs secret values, private keys, tokens, or credential strings.
 * - Read-only check of environment configuration.
 * - Zero database queries or mutations.
 * - Zero Google Sheets write operations.
 */

import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';
import * as jose from 'jose';

function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

async function runConfigCheck() {
  const rawSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const rawSheetName = process.env.GOOGLE_SHEETS_SHEET_NAME;
  const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const rawCronSecret = process.env.CRON_SECRET;

  const isSpreadsheetIdPresent = !!rawSpreadsheetId && rawSpreadsheetId.trim().length > 0;
  const isSheetNamePresent = !!rawSheetName && rawSheetName.trim().length > 0;
  const isEmailPresent = !!rawEmail && rawEmail.trim().length > 0;
  const isPrivateKeyPresent = !!rawPrivateKey && rawPrivateKey.trim().length > 0;
  const isCronSecretPresent = !!rawCronSecret && rawCronSecret.trim().length > 0;

  // Validate email format
  let isEmailFormatValid = false;
  if (isEmailPresent) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    isEmailFormatValid = emailRegex.test(rawEmail!.trim());
  }

  // Validate private key parsing via jose (RS256 PKCS8)
  let isPrivateKeyParseSuccess = false;
  let keyParseErrorSummary = '';

  if (isPrivateKeyPresent) {
    try {
      const formattedKey = rawPrivateKey!.replace(/\\n/g, '\n');
      await jose.importPKCS8(formattedKey, 'RS256');
      isPrivateKeyParseSuccess = true;
    } catch (err) {
      keyParseErrorSummary = err instanceof Error ? err.message : String(err);
    }
  }

  const credentialParsePass =
    isEmailPresent &&
    isEmailFormatValid &&
    isPrivateKeyPresent &&
    isPrivateKeyParseSuccess;

  const results = {
    GOOGLE_SHEETS_SPREADSHEET_ID: isSpreadsheetIdPresent ? 'PRESENT' : 'MISSING',
    GOOGLE_SHEETS_SHEET_NAME: isSheetNamePresent ? 'PRESENT' : 'MISSING',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: isEmailPresent ? 'PRESENT' : 'MISSING',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: isPrivateKeyPresent ? 'PRESENT' : 'MISSING',
    CRON_SECRET: isCronSecretPresent ? 'PRESENT' : 'MISSING',
    isEmailFormatValid,
    credentialParsePass,
    keyParseErrorSummary: keyParseErrorSummary ? `[Failed to parse PKCS8 key: ${keyParseErrorSummary}]` : '',
  };

  console.log(JSON.stringify(results, null, 2));
}

runConfigCheck().catch((err) => {
  console.error('[Config Check Error]:', err.message);
  process.exit(1);
});
