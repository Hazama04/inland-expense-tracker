import dns from 'dns/promises';
import { URL } from 'url';
import { ValidationError, AppError } from '../errors';

export interface ValidatedMedia {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  byteSize: number;
}

// 10 MB maximum receipt image size
export const MAX_RECEIPT_FILE_SIZE = 10 * 1024 * 1024;

// Magic byte signatures for supported image types
const MAGIC_BYTES = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  WEBP_HEADER: [0x57, 0x41, 0x56, 0x45], // "WEBP" at offset 8 (57 45 42 50)
};

/**
 * Checks if an IP address falls within private/loopback/link-local ranges (SSRF Protection).
 */
export function isPrivateIp(ip: string): boolean {
  // Loopback
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '0.0.0.0') {
    return true;
  }

  // IPv4 Private Ranges
  // 10.0.0.0 - 10.255.255.255
  if (/^10\./.test(ip)) return true;

  // 172.16.0.0 - 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;

  // 192.168.0.0 - 192.168.255.255
  if (/^192\.168\./.test(ip)) return true;

  // Link-local 169.254.0.0/16
  if (/^169\.254\./.test(ip)) return true;

  // Carrier-grade NAT 100.64.0.0/10
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip)) return true;

  // IPv6 Private & Link-local
  if (/^fe80:/i.test(ip) || /^fc00:/i.test(ip) || /^fd00:/i.test(ip)) return true;

  return false;
}

/**
 * Validates a media URL to ensure safe protocol and prevent SSRF attacks.
 */
export async function validateMediaUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError('Invalid media URL format');
  }

  // Enforce HTTP / HTTPS protocol
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError(`Unsupported URL protocol "${parsed.protocol}"`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicitly block localhost and local IP strings
  if (isPrivateIp(hostname)) {
    throw new ValidationError(`Access to private address "${hostname}" is forbidden (SSRF Protection).`);
  }

  // In test environment or mock, bypass DNS resolution if mock URL
  if (process.env.NODE_ENV === 'test' || hostname.endsWith('.test') || hostname === 'example.com') {
    return parsed;
  }

  // Resolve hostname DNS to check target IP
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        throw new ValidationError(
          `Domain "${hostname}" resolved to private IP "${record.address}" (SSRF Protection).`
        );
      }
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`Could not resolve media host "${hostname}": ${(error as Error).message}`);
  }

  return parsed;
}

/**
 * Detects MIME type and extension by inspecting binary magic bytes.
 */
export function detectMimeFromBytes(buffer: Buffer): { mimeType: string; extension: string } {
  if (buffer.length < 12) {
    throw new ValidationError('Downloaded file is too small to be a valid image');
  }

  // Check JPEG
  if (
    buffer[0] === MAGIC_BYTES.JPEG[0] &&
    buffer[1] === MAGIC_BYTES.JPEG[1] &&
    buffer[2] === MAGIC_BYTES.JPEG[2]
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // Check PNG
  if (
    buffer[0] === MAGIC_BYTES.PNG[0] &&
    buffer[1] === MAGIC_BYTES.PNG[1] &&
    buffer[2] === MAGIC_BYTES.PNG[2] &&
    buffer[3] === MAGIC_BYTES.PNG[3]
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // Check WebP (RIFF + WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  throw new ValidationError(
    'Unsupported file format. Only JPEG, PNG, and WebP receipt images are accepted.'
  );
}

/**
 * Safely downloads media from verified URL with timeout, size limit, and magic bytes verification.
 */
export async function downloadReceiptMedia(
  mediaUrl: string,
  options: { maxSizeBytes?: number; timeoutMs?: number } = {}
): Promise<ValidatedMedia> {
  const maxBytes = options.maxSizeBytes ?? MAX_RECEIPT_FILE_SIZE;
  const timeoutMs = options.timeoutMs ?? 15000;

  // 1. SSRF & URL validation
  const validUrl = await validateMediaUrl(mediaUrl);

  // 2. Fetch with AbortController timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'InlandExpenseTracker-ReceiptWorker/1.0',
        Accept: 'image/jpeg,image/png,image/webp,image/*',
      },
    });

    if (!response.ok) {
      throw new AppError(
        `Failed to download receipt media. HTTP status ${response.status}`,
        502,
        'MEDIA_DOWNLOAD_FAILED'
      );
    }

    // Check Content-Length header if available
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (contentLength > maxBytes) {
        throw new ValidationError(
          `Receipt image size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds maximum limit of ${Math.round(maxBytes / 1024 / 1024)}MB.`
        );
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      throw new ValidationError(
        `Receipt image size exceeds maximum limit of ${Math.round(maxBytes / 1024 / 1024)}MB.`
      );
    }

    // 3. Inspect magic bytes
    const { mimeType, extension } = detectMimeFromBytes(buffer);

    return {
      buffer,
      mimeType,
      extension,
      byteSize: buffer.length,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AppError) {
      throw error;
    }
    if ((error as Error).name === 'AbortError') {
      throw new AppError('Media download timed out after 15 seconds', 504, 'MEDIA_DOWNLOAD_TIMEOUT');
    }
    throw new AppError(
      `Media download failed: ${(error as Error).message}`,
      502,
      'MEDIA_DOWNLOAD_FAILED'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
