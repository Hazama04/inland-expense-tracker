import { put, del, get } from '@vercel/blob';
import crypto from 'crypto';
import { AppError, NotFoundError } from './errors';

export interface UploadReceiptResult {
  pathname: string;
  url: string;
  downloadUrl: string;
  contentType?: string;
  size: number;
}

// In-memory mock store for unit testing
const mockBlobStorage = new Map<string, { buffer: Buffer; contentType: string }>();

export class StorageService {
  private getToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN || null;
  }

  private isMock(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.MOCK_STORAGE === 'true' ||
      !this.getToken()
    );
  }

  /**
   * Generates a deterministic sanitized storage pathname:
   * receipts/{yyyy}/{mm}/{staffId}/{uuid}.{ext}
   */
  generateReceiptPath(staffId: string, extension: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uniqueId = crypto.randomUUID();
    const cleanExt = extension.replace(/^\./, '').toLowerCase();

    // Sanitize staffId to avoid directory traversal
    const safeStaffId = staffId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `receipts/${year}/${month}/${safeStaffId}/${uniqueId}.${cleanExt}`;
  }

  /**
   * Uploads receipt media buffer to Vercel Blob with private access.
   */
  async uploadReceipt(params: {
    buffer: Buffer;
    staffId: string;
    extension: string;
    contentType: string;
  }): Promise<UploadReceiptResult> {
    const pathname = this.generateReceiptPath(params.staffId, params.extension);

    if (this.isMock()) {
      mockBlobStorage.set(pathname, {
        buffer: params.buffer,
        contentType: params.contentType,
      });

      return {
        pathname,
        url: `https://blob.mock.local/${pathname}`,
        downloadUrl: `https://blob.mock.local/${pathname}?download=1`,
        contentType: params.contentType,
        size: params.buffer.length,
      };
    }

    const token = this.getToken();
    if (!token) {
      throw new AppError('BLOB_READ_WRITE_TOKEN is not configured', 500, 'STORAGE_CONFIG_ERROR');
    }

    try {
      const blob = await put(pathname, params.buffer, {
        access: 'private',
        contentType: params.contentType,
        token,
        addRandomSuffix: false,
      });

      return {
        pathname: blob.pathname,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        contentType: blob.contentType,
        size: params.buffer.length,
      };
    } catch (error) {
      console.error('[Storage Upload Error]:', error instanceof Error ? error.message : error);
      throw new AppError(
        `Failed to store receipt in private blob: ${(error as Error).message}`,
        502,
        'BLOB_UPLOAD_FAILED'
      );
    }
  }

  /**
   * Retrieves a private receipt buffer and metadata for authorized serving.
   */
  async getReceipt(pathnameOrUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (this.isMock()) {
      const item = mockBlobStorage.get(pathnameOrUrl);
      if (!item) {
        // Search by suffix if full URL passed
        for (const [path, val] of mockBlobStorage.entries()) {
          if (pathnameOrUrl.endsWith(path)) {
            return val;
          }
        }
        throw new NotFoundError('Receipt file');
      }
      return item;
    }

    const token = this.getToken();
    if (!token) {
      throw new AppError('BLOB_READ_WRITE_TOKEN is not configured', 500, 'STORAGE_CONFIG_ERROR');
    }

    try {
      const blobResult = await get(pathnameOrUrl, { token, access: 'private' });
      if (!blobResult || !blobResult.stream) {
        throw new NotFoundError('Receipt file');
      }

      const reader = blobResult.stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);
      const contentType = blobResult.headers?.get('content-type') || 'image/jpeg';

      return {
        buffer,
        contentType,
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AppError) throw error;
      throw new AppError(`Receipt retrieval failed: ${(error as Error).message}`, 502, 'BLOB_FETCH_FAILED');
    }
  }

  /**
   * Deletes a private receipt file.
   */
  async deleteReceipt(pathnameOrUrl: string): Promise<void> {
    if (this.isMock()) {
      mockBlobStorage.delete(pathnameOrUrl);
      return;
    }

    const token = this.getToken();
    if (!token) return;

    try {
      await del(pathnameOrUrl, { token });
    } catch (error) {
      console.warn('[Storage Delete Warning]:', (error as Error).message);
    }
  }

  /**
   * For unit testing only: clear mock storage
   */
  _clearMockStorage() {
    mockBlobStorage.clear();
  }
}

export const storageService = new StorageService();
