import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateIp,
  validateMediaUrl,
  detectMimeFromBytes,
} from '../lib/storage/download';
import { storageService } from '../lib/storage';

describe('Receipt File & SSRF Validation', () => {
  describe('SSRF Protection (isPrivateIp)', () => {
    test('should identify private and loopback IPv4 addresses', () => {
      assert.equal(isPrivateIp('127.0.0.1'), true);
      assert.equal(isPrivateIp('10.0.0.1'), true);
      assert.equal(isPrivateIp('172.16.5.1'), true);
      assert.equal(isPrivateIp('192.168.1.1'), true);
      assert.equal(isPrivateIp('169.254.169.254'), true);
      assert.equal(isPrivateIp('localhost'), true);
    });

    test('should identify private and link-local IPv6 addresses', () => {
      assert.equal(isPrivateIp('::1'), true);
      assert.equal(isPrivateIp('fe80::1'), true);
      assert.equal(isPrivateIp('fc00::1'), true);
    });

    test('should allow public routable IP addresses', () => {
      assert.equal(isPrivateIp('8.8.8.8'), false);
      assert.equal(isPrivateIp('1.1.1.1'), false);
      assert.equal(isPrivateIp('104.21.50.2'), false);
    });
  });

  describe('validateMediaUrl', () => {
    test('should allow valid HTTPS URLs', async () => {
      const url = await validateMediaUrl('https://example.com/receipt.jpg');
      assert.equal(url.hostname, 'example.com');
      assert.equal(url.protocol, 'https:');
    });

    test('should reject non-HTTP protocols (e.g. file:, ftp:, gopher:)', async () => {
      await assert.rejects(async () => {
        await validateMediaUrl('file:///etc/passwd');
      }, /Unsupported URL protocol/);

      await assert.rejects(async () => {
        await validateMediaUrl('gopher://localhost:70');
      }, /Unsupported URL protocol/);
    });

    test('should reject localhost and private IP hostnames', async () => {
      await assert.rejects(async () => {
        await validateMediaUrl('http://127.0.0.1:8080/image.png');
      }, /private address/);

      await assert.rejects(async () => {
        await validateMediaUrl('http://192.168.1.1/secret.jpg');
      }, /private address/);
    });
  });

  describe('detectMimeFromBytes (Magic Byte Inspection)', () => {
    test('should detect valid JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const result = detectMimeFromBytes(jpegBuffer);
      assert.equal(result.mimeType, 'image/jpeg');
      assert.equal(result.extension, 'jpg');
    });

    test('should detect valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const result = detectMimeFromBytes(pngBuffer);
      assert.equal(result.mimeType, 'image/png');
      assert.equal(result.extension, 'png');
    });

    test('should detect valid WebP magic bytes', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const result = detectMimeFromBytes(webpBuffer);
      assert.equal(result.mimeType, 'image/webp');
      assert.equal(result.extension, 'webp');
    });

    test('should reject executable, script, HTML, or unknown binaries', () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body>malicious</body></html>');
      assert.throws(() => {
        detectMimeFromBytes(htmlBuffer);
      }, /Unsupported file format/);

      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      assert.throws(() => {
        detectMimeFromBytes(exeBuffer);
      }, /Unsupported file format/);
    });
  });

  describe('Storage Path Generation', () => {
    test('should generate predictable, sanitized storage paths', () => {
      const path = storageService.generateReceiptPath('staff-123', 'jpg');
      assert.match(path, /^receipts\/\d{4}\/\d{2}\/staff-123\/[a-f0-9-]+\.jpg$/);
    });

    test('should sanitize malicious staffId path traversal characters', () => {
      const path = storageService.generateReceiptPath('../../../etc/passwd', 'png');
      assert.doesNotMatch(path, /\.\./);
      assert.doesNotMatch(path, /\/etc\//);
    });
  });
});
