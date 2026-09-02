import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, GET } from '../app/api/worker/process-receipt/route';

describe('Receipt Worker Route (POST /api/worker/process-receipt)', () => {
  test('should reject GET requests with 405 Method Not Allowed', async () => {
    const res = await GET();
    assert.equal(res.status, 405);
  });

  test('should reject requests with invalid worker authorization token', async () => {
    const originalSecret = process.env.WORKER_SECRET;
    process.env.WORKER_SECRET = 'correct_worker_secret_123';

    try {
      const req = new NextRequest('http://localhost:3000/api/worker/process-receipt', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderPhone: '+6281234567890',
          mediaUrl: 'https://example.com/receipt.jpg',
        }),
      });

      const res = await POST(req);
      assert.equal(res.status, 401);
    } finally {
      process.env.WORKER_SECRET = originalSecret;
    }
  });

  test('should reject invalid payload schema with 400 Bad Request', async () => {
    const originalSecret = process.env.WORKER_SECRET;
    process.env.WORKER_SECRET = 'test_secret';

    try {
      const req = new NextRequest('http://localhost:3000/api/worker/process-receipt', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing senderPhone and invalid mediaUrl
          mediaUrl: 'not-a-valid-url',
        }),
      });

      const res = await POST(req);
      assert.equal(res.status, 400);
    } finally {
      process.env.WORKER_SECRET = originalSecret;
    }
  });
});
