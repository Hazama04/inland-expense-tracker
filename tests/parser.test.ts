import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseWhatsAppMessage, parseCurrencyAmount } from '../lib/parser';

describe('WhatsApp Command Parser', () => {
  describe('parseCurrencyAmount Helper', () => {
    it('should parse simple integers', () => {
      assert.strictEqual(parseCurrencyAmount('145000'), 145000);
      assert.strictEqual(parseCurrencyAmount('50000'), 50000);
    });

    it('should parse numbers with Indonesian thousand separator dot', () => {
      assert.strictEqual(parseCurrencyAmount('145.000'), 145000);
      assert.strictEqual(parseCurrencyAmount('1.250.000'), 1250000);
    });

    it('should parse numbers prefixed with Rp / rp / Rp.', () => {
      assert.strictEqual(parseCurrencyAmount('Rp 145.000'), 145000);
      assert.strictEqual(parseCurrencyAmount('rp145000'), 145000);
      assert.strictEqual(parseCurrencyAmount('RP 50.000,00'), 50000);
    });

    it('should reject invalid or non-positive amounts', () => {
      assert.strictEqual(parseCurrencyAmount('abc'), null);
      assert.strictEqual(parseCurrencyAmount('0'), null);
      assert.strictEqual(parseCurrencyAmount('-5000'), null);
      assert.strictEqual(parseCurrencyAmount(''), null);
    });
  });

  describe('Message Classification', () => {
    it('should classify image messages with mediaUrl', () => {
      const result = parseWhatsAppMessage({
        mediaUrl: 'https://cdn.fonnte.com/media/receipt123.jpg',
        message: 'Struk bensin',
      });

      assert.strictEqual(result.type, 'IMAGE');
      if (result.type === 'IMAGE') {
        assert.strictEqual(result.mediaUrl, 'https://cdn.fonnte.com/media/receipt123.jpg');
        assert.strictEqual(result.caption, 'Struk bensin');
      }
    });

    it('should classify help commands', () => {
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'bantuan' }), { type: 'HELP' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'HELP' }), { type: 'HELP' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: '?' }), { type: 'HELP' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'halo' }), { type: 'HELP' });
    });

    it('should classify history commands', () => {
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'riwayat' }), { type: 'HISTORY' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'History' }), { type: 'HISTORY' });
    });

    it('should classify month total commands', () => {
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'total bulan ini' }), { type: 'MONTH_TOTAL' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'total' }), { type: 'MONTH_TOTAL' });
      assert.deepStrictEqual(parseWhatsAppMessage({ message: 'Total Bulan' }), { type: 'MONTH_TOTAL' });
    });

    it('should parse manual expense command: "manual: merchant | amount | category"', () => {
      const result = parseWhatsAppMessage({
        message: 'manual: Indomaret Cipayung | 145000 | ATK & Perlengkapan',
      });

      assert.strictEqual(result.type, 'MANUAL_EXPENSE');
      if (result.type === 'MANUAL_EXPENSE') {
        assert.strictEqual(result.merchant, 'Indomaret Cipayung');
        assert.strictEqual(result.amount, 145000);
        assert.strictEqual(result.category, 'ATK & Perlengkapan');
      }
    });

    it('should parse category correction command: "kategori: transport"', () => {
      const result = parseWhatsAppMessage({
        message: 'kategori: Transport & Bensin',
      });

      assert.strictEqual(result.type, 'CATEGORY_CORRECTION');
      if (result.type === 'CATEGORY_CORRECTION') {
        assert.strictEqual(result.category, 'Transport & Bensin');
      }
    });

    it('should parse amount correction command: "nominal: 150000"', () => {
      const result = parseWhatsAppMessage({
        message: 'nominal: Rp 150.000',
      });

      assert.strictEqual(result.type, 'AMOUNT_CORRECTION');
      if (result.type === 'AMOUNT_CORRECTION') {
        assert.strictEqual(result.amount, 150000);
      }
    });

    it('should parse note correction command: "catatan: beli spidol"', () => {
      const result = parseWhatsAppMessage({
        message: 'catatan: beli spidol whiteboard 3 pcs',
      });

      assert.strictEqual(result.type, 'NOTE_CORRECTION');
      if (result.type === 'NOTE_CORRECTION') {
        assert.strictEqual(result.note, 'beli spidol whiteboard 3 pcs');
      }
    });

    it('should classify unrecognized text as UNRECOGNIZED', () => {
      const result = parseWhatsAppMessage({
        message: 'selamat siang bot mau tanya',
      });

      assert.strictEqual(result.type, 'UNRECOGNIZED');
      if (result.type === 'UNRECOGNIZED') {
        assert.strictEqual(result.rawText, 'selamat siang bot mau tanya');
      }
    });
  });
});
