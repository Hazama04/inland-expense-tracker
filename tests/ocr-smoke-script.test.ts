import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateRealisticReceiptPng } from '../scripts/smoke-gemini-ocr';

describe('Realistic Synthetic Receipt PNG Generator', () => {
  test('should generate valid PNG buffer with proper dimensions and magic bytes', () => {
    const buffer = generateRealisticReceiptPng();

    // Check PNG signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    assert.ok(buffer.length > 5000);
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50); // P
    assert.equal(buffer[2], 0x4e); // N
    assert.equal(buffer[3], 0x47); // G
    assert.equal(buffer[4], 0x0d);
    assert.equal(buffer[5], 0x0a);
    assert.equal(buffer[6], 0x1a);
    assert.equal(buffer[7], 0x0a);

    // Verify IHDR dimensions (600 width x 800 height)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    assert.equal(width, 600);
    assert.equal(height, 800);
  });
});
