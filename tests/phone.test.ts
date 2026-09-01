import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizePhoneNumber, isValidPhoneNumber } from '../lib/phone';

describe('Phone Number Normalization & Validation', () => {
  it('should normalize Indonesian local numbers starting with 08', () => {
    assert.strictEqual(normalizePhoneNumber('081234567890'), '+6281234567890');
    assert.strictEqual(normalizePhoneNumber('085712345678'), '+6285712345678');
  });

  it('should normalize numbers starting with 62 without plus', () => {
    assert.strictEqual(normalizePhoneNumber('6281234567890'), '+6281234567890');
  });

  it('should preserve numbers already in +62 format', () => {
    assert.strictEqual(normalizePhoneNumber('+6281234567890'), '+6281234567890');
  });

  it('should strip hyphens, spaces, and parentheses', () => {
    assert.strictEqual(normalizePhoneNumber('0812-3456-7890'), '+6281234567890');
    assert.strictEqual(normalizePhoneNumber('+62 812 (3456) 7890'), '+6281234567890');
    assert.strictEqual(normalizePhoneNumber('0812.3456.7890'), '+6281234567890');
  });

  it('should reject invalid or malformed phone numbers', () => {
    assert.throws(() => normalizePhoneNumber('12345'), /Invalid phone number format/);
    assert.throws(() => normalizePhoneNumber('abc'), /Invalid phone number format/);
    assert.throws(() => normalizePhoneNumber(''), /Phone number must be a non-empty string/);
  });

  it('should return boolean correctly from isValidPhoneNumber', () => {
    assert.strictEqual(isValidPhoneNumber('081234567890'), true);
    assert.strictEqual(isValidPhoneNumber('+6281234567890'), true);
    assert.strictEqual(isValidPhoneNumber('invalid-phone'), false);
    assert.strictEqual(isValidPhoneNumber(''), false);
  });
});
