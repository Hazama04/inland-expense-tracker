import * as jose from 'jose';
import { AppError } from './errors';

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  clientEmail: string;
  privateKey: string;
}

export interface SheetRowData {
  id: string;
  transactionDate: string;
  merchant: string;
  amount: number | string;
  category: string;
  notes: string;
  status: string;
  staff: string;
  confidence: string;
  createdAt: string;
  updatedAt: string;
}

export interface FindRowResult {
  found: boolean;
  rowIndex?: number; // 1-based index in sheet
  range?: string;
  existingValues?: (string | number | null)[];
}

export interface SyncRowResult {
  operation: 'APPEND' | 'UPDATE';
  rowIndex?: number;
  range?: string;
  rawResponse?: unknown;
}

// In-memory mock store for unit & integration testing
interface MockSheetState {
  rows: Array<{ rowIndex: number; values: (string | number | null)[] }>;
  error: Error | null;
}

let mockState: MockSheetState = {
  rows: [],
  error: null,
};

/**
 * Sanitizes error messages by redacting Google Service Account private keys, tokens, and credentials.
 */
export function sanitizeSheetsErrorMessage(message: string): string {
  return message
    .replace(/-----BEGIN[ A-Z0-9_-]+-----[\s\S]*?-----END[ A-Z0-9_-]+-----/gi, '[REDACTED_PRIVATE_KEY]')
    .replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[a-zA-Z0-9_\-\.]+/gi, '[REDACTED_GOOGLE_TOKEN]');
}

/**
 * Maps Google Sheets API errors into domain AppError instances.
 */
export function mapSheetsError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const rawMsg = error instanceof Error ? error.message : String(error);
  const cleanMsg = sanitizeSheetsErrorMessage(rawMsg);
  const lower = cleanMsg.toLowerCase();

  // 1. Authentication & Credentials (HTTP 401)
  if (
    lower.includes('invalid_grant') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('invalid_client') ||
    lower.includes('authentication failed')
  ) {
    return new AppError(`Google Sheets authentication failed: ${cleanMsg}`, 401, 'SHEETS_AUTH_ERROR');
  }

  // 2. Permissions (HTTP 403)
  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('the caller does not have permission') ||
    lower.includes('forbidden')
  ) {
    return new AppError(`Google Sheets permission denied: ${cleanMsg}`, 403, 'SHEETS_PERMISSION_DENIED');
  }

  // 3. Not Found (Spreadsheet or Tab) (HTTP 404)
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('requested entity was not found') ||
    lower.includes('unable to parse range')
  ) {
    return new AppError(`Google Sheets spreadsheet or tab not found: ${cleanMsg}`, 404, 'SHEETS_NOT_FOUND');
  }

  // 4. Rate Limit & Quota (HTTP 429)
  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted')
  ) {
    return new AppError(`Google Sheets rate limit exceeded: ${cleanMsg}`, 429, 'SHEETS_RATE_LIMIT');
  }

  // 5. Service Unavailable (HTTP 500, 502, 503)
  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('500') ||
    lower.includes('service unavailable') ||
    lower.includes('backend error') ||
    lower.includes('internal error')
  ) {
    return new AppError(`Google Sheets service temporarily unavailable: ${cleanMsg}`, 503, 'SHEETS_SERVICE_UNAVAILABLE');
  }

  // 6. Timeout
  if (lower.includes('timeout') || lower.includes('abort') || lower.includes('timed out')) {
    return new AppError(`Google Sheets request timed out: ${cleanMsg}`, 504, 'SHEETS_TIMEOUT');
  }

  return new AppError(`Google Sheets synchronization failed: ${cleanMsg}`, 502, 'SHEETS_SYNC_FAILED');
}

export class GoogleSheetsClient {
  private cachedAccessToken: { token: string; expiresAt: number } | null = null;

  getConfig(): GoogleSheetsConfig | null {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1';

    if (!spreadsheetId || !clientEmail || !rawPrivateKey) {
      return null;
    }

    // Format private key correctly if newline escapes were flattened
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

    return {
      spreadsheetId: spreadsheetId.trim(),
      sheetName: sheetName.trim(),
      clientEmail: clientEmail.trim(),
      privateKey,
    };
  }

  isMock(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.MOCK_SHEETS === 'true' ||
      !this.getConfig()
    );
  }

  // Test Harness Methods
  _setMockError(error: Error | null) {
    mockState.error = error;
  }

  _setMockRows(rows: Array<{ rowIndex: number; values: (string | number | null)[] }>) {
    mockState.rows = [...rows];
  }

  _getMockRows() {
    return [...mockState.rows];
  }

  _clearMock() {
    mockState = { rows: [], error: null };
  }

  /**
   * Generates or reuses a cached Google OAuth2 service account access token using RS256 JWT assertion.
   */
  async getAccessToken(config: GoogleSheetsConfig): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // Reuse token if valid for more than 5 minutes
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > now + 300) {
      return this.cachedAccessToken.token;
    }

    try {
      const privateKey = await jose.importPKCS8(config.privateKey, 'RS256');

      const jwt = await new jose.SignJWT({
        scope: 'https://www.googleapis.com/auth/spreadsheets',
      })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(config.clientEmail)
        .setAudience('https://oauth2.googleapis.com/token')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(privateKey);

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth token request failed with HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      this.cachedAccessToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in || 3600),
      };

      return data.access_token;
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Searches Column A in Google Sheets to find an existing row matching Expense UUID.
   */
  async findRowByExpenseId(
    config: GoogleSheetsConfig,
    expenseId: string
  ): Promise<FindRowResult> {
    if (this.isMock()) {
      if (mockState.error) throw mockState.error;
      const found = mockState.rows.find((r) => r.values[0] === expenseId);
      if (found) {
        return {
          found: true,
          rowIndex: found.rowIndex,
          range: `${config.sheetName}!A${found.rowIndex}:K${found.rowIndex}`,
          existingValues: found.values,
        };
      }
      return { found: false };
    }

    const token = await this.getAccessToken(config);
    const range = `${encodeURIComponent(config.sheetName)}!A:A`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API findRow failed (HTTP ${response.status}): ${errText}`);
      }

      const data = (await response.json()) as { values?: string[][] };
      const rows = data.values || [];

      for (let i = 0; i < rows.length; i++) {
        const cellValue = rows[i]?.[0];
        if (cellValue && cellValue.trim() === expenseId.trim()) {
          const rowIndex = i + 1; // 1-based index in Sheets
          return {
            found: true,
            rowIndex,
            range: `${config.sheetName}!A${rowIndex}:K${rowIndex}`,
          };
        }
      }

      return { found: false };
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Appends a new row to the specified Google Sheet.
   */
  async appendRow(
    config: GoogleSheetsConfig,
    values: (string | number | null)[]
  ): Promise<SyncRowResult> {
    if (this.isMock()) {
      if (mockState.error) throw mockState.error;
      const newRowIndex = mockState.rows.length + 2; // header at 1
      mockState.rows.push({ rowIndex: newRowIndex, values });
      return {
        operation: 'APPEND',
        rowIndex: newRowIndex,
        range: `${config.sheetName}!A${newRowIndex}:K${newRowIndex}`,
        rawResponse: { mock: true, rowIndex: newRowIndex },
      };
    }

    const token = await this.getAccessToken(config);
    const range = `${encodeURIComponent(config.sheetName)}!A:K`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          values: [values],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API append failed (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const updatedRange = data.updates?.updatedRange as string | undefined;

      // Extract row index from range e.g. "Sheet1!A15:K15"
      let rowIndex: number | undefined;
      if (updatedRange) {
        const match = updatedRange.match(/!A(\d+):/i);
        if (match) rowIndex = parseInt(match[1], 10);
      }

      return {
        operation: 'APPEND',
        rowIndex,
        range: updatedRange,
        rawResponse: data,
      };
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Updates an existing row in Google Sheets by row index.
   */
  async updateRow(
    config: GoogleSheetsConfig,
    rowIndex: number,
    values: (string | number | null)[]
  ): Promise<SyncRowResult> {
    if (this.isMock()) {
      if (mockState.error) throw mockState.error;
      const existing = mockState.rows.find((r) => r.rowIndex === rowIndex);
      if (existing) {
        existing.values = values;
      } else {
        mockState.rows.push({ rowIndex, values });
      }
      return {
        operation: 'UPDATE',
        rowIndex,
        range: `${config.sheetName}!A${rowIndex}:K${rowIndex}`,
        rawResponse: { mock: true, rowIndex },
      };
    }

    const token = await this.getAccessToken(config);
    const rowRange = `${encodeURIComponent(config.sheetName)}!A${rowIndex}:K${rowIndex}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${rowRange}?valueInputOption=USER_ENTERED`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          values: [values],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API update failed (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      return {
        operation: 'UPDATE',
        rowIndex,
        range: `${config.sheetName}!A${rowIndex}:K${rowIndex}`,
        rawResponse: data,
      };
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Reads values from a specific range in Google Sheets.
   */
  async readRange(
    config: GoogleSheetsConfig,
    range: string
  ): Promise<(string | number | null)[][]> {
    if (this.isMock()) {
      if (mockState.error) throw mockState.error;
      return mockState.rows.map((r) => r.values);
    }

    const token = await this.getAccessToken(config);
    const fullRange = range.includes('!') ? range : `${config.sheetName}!${range}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(fullRange)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API readRange failed (HTTP ${response.status}): ${errText}`);
      }

      const data = (await response.json()) as { values?: (string | number | null)[][] };
      return data.values || [];
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Retrieves the numeric sheetId for the configured sheet tab name.
   */
  async getSheetId(config: GoogleSheetsConfig): Promise<number> {
    if (this.isMock()) return 0;

    const token = await this.getAccessToken(config);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?fields=sheets.properties`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API getSheetId failed (HTTP ${response.status}): ${errText}`);
      }

      const data = (await response.json()) as {
        sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
      };

      const matchedSheet = data.sheets?.find(
        (s) => s.properties?.title?.toLowerCase() === config.sheetName.toLowerCase()
      );

      return matchedSheet?.properties?.sheetId ?? 0;
    } catch (error) {
      throw mapSheetsError(error);
    }
  }

  /**
   * Deletes a specific single row by 1-based rowIndex in Google Sheets.
   */
  async deleteRow(config: GoogleSheetsConfig, rowIndex: number): Promise<void> {
    if (this.isMock()) {
      if (mockState.error) throw mockState.error;
      mockState.rows = mockState.rows.filter((r) => r.rowIndex !== rowIndex);
      return;
    }

    const token = await this.getAccessToken(config);
    const sheetId = await this.getSheetId(config);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}:batchUpdate`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1, // 0-based start
                  endIndex: rowIndex,       // 0-based end
                },
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API deleteRow failed (HTTP ${response.status}): ${errText}`);
      }
    } catch (error) {
      throw mapSheetsError(error);
    }
  }
}

export const googleSheetsClient = new GoogleSheetsClient();
