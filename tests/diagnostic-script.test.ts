import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, TARGET_MODELS } from '../scripts/diagnostic-gemini-models';

describe('Gemini Multi-Model Diagnostic Script', () => {
  test('should include all required models to test', () => {
    assert.ok(TARGET_MODELS.includes('gemini-3.7-flash'));
    assert.ok(TARGET_MODELS.includes('gemini-3.6-flash'));
    assert.ok(TARGET_MODELS.includes('gemini-3.5-flash'));
    assert.ok(TARGET_MODELS.includes('gemini-3-flash'));
    assert.ok(TARGET_MODELS.includes('gemini-2.5-flash'));
  });

  test('should classify 503 high demand as SERVICE_UNAVAILABLE', () => {
    const err = new Error('[503 Service Unavailable] This model is currently experiencing high demand.');
    assert.equal(classifyError(err), 'SERVICE_UNAVAILABLE');
  });

  test('should classify 404 as MODEL_NOT_FOUND', () => {
    const err = new Error('404 Not Found: models/gemini-unsupported is not supported for api version');
    assert.equal(classifyError(err), 'MODEL_NOT_FOUND');
  });

  test('should classify 401 as AUTHENTICATION_ERROR', () => {
    const err = new Error('API_KEY_INVALID: 401 Unauthorized');
    assert.equal(classifyError(err), 'AUTHENTICATION_ERROR');
  });

  test('should classify 429 as RATE_LIMIT', () => {
    const err = new Error('429 Too Many Requests: RESOURCE_EXHAUSTED');
    assert.equal(classifyError(err), 'RATE_LIMIT');
  });
});
