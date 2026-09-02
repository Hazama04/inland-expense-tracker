import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { normalizeOcrDate } from '../lib/ocr-validator';
import { formatIndonesianDate } from '../lib/fonnte';
import { formatDate } from '../lib/client/format';

describe('Date Correctness & Timezone Independence Regression (V17)', () => {
  describe('1. Critical Date Normalization Matrix', () => {
    const testCases = [
      { input: '01/09/2026', expected: '2026-09-01' },
      { input: '01-09-2026', expected: '2026-09-01' },
      { input: '2026-09-01', expected: '2026-09-01' },
      { input: '1 September 2026', expected: '2026-09-01' },
      { input: '01 Sep 2026', expected: '2026-09-01' },
      { input: '15-Agu-2026', expected: '2026-08-15' },
      { input: '01/01/2026', expected: '2026-01-01' },
    ];

    for (const { input, expected } of testCases) {
      test(`should normalize "${input}" to canonical "${expected}"`, () => {
        const result = normalizeOcrDate(input);
        const isoString = result.toISOString();
        const datePart = isoString.slice(0, 10);

        assert.equal(datePart, expected, `Input "${input}" produced "${datePart}", expected "${expected}"`);
        assert.equal(isoString, `${expected}T00:00:00.000Z`, `Date must be at UTC midnight`);
      });
    }
  });

  describe('2. Boundary Calendar Dates', () => {
    const boundaryCases = [
      { input: '31/12/2025', expected: '2025-12-31' },
      { input: '01/01/2026', expected: '2026-01-01' },
      { input: '28/02/2026', expected: '2026-02-28' },
      { input: '01/03/2026', expected: '2026-03-01' },
      { input: '31/08/2026', expected: '2026-08-31' },
      { input: '01/09/2026', expected: '2026-09-01' },
    ];

    for (const { input, expected } of boundaryCases) {
      test(`should accurately parse boundary date "${input}" -> "${expected}"`, () => {
        const result = normalizeOcrDate(input);
        assert.equal(result.toISOString().slice(0, 10), expected);
      });
    }
  });

  describe('3. Timezone Invariance & Formatting', () => {
    test('should format normalized date consistently via formatIndonesianDate', () => {
      const d = normalizeOcrDate('01/09/2026');
      const formatted = formatIndonesianDate(d);
      assert.equal(formatted, '1 Sep 2026');
    });

    test('should format normalized date consistently via client formatDate', () => {
      const d = normalizeOcrDate('01/09/2026');
      const formatted = formatDate(d);
      assert.equal(formatted, '1 Sep 2026');
    });

    test('should preserve canonical UTC calendar date regardless of local environment timezone', () => {
      const d = normalizeOcrDate('01/09/2026');
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 8); // September
      assert.equal(d.getUTCDate(), 1);
    });
  });

  describe('4. Guard Rails & Fallback Behavior', () => {
    test('should fallback to UTC today when input is null or undefined', () => {
      const d = normalizeOcrDate(null);
      const now = new Date();
      assert.equal(d.getUTCFullYear(), now.getUTCFullYear());
      assert.equal(d.getUTCMonth(), now.getUTCMonth());
      assert.equal(d.getUTCDate(), now.getUTCDate());
    });

    test('should fallback to UTC today when input is an ancient date older than 3 years', () => {
      const d = normalizeOcrDate('01/01/2020');
      const now = new Date();
      assert.equal(d.getUTCFullYear(), now.getUTCFullYear());
    });
  });
});
