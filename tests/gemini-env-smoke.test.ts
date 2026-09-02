import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiError } from '../scripts/smoke-gemini-3.7';
import { loadEnvConfig } from '@next/env';
import path from 'path';

describe('Gemini Smoke Test Environment & Error Classifier', () => {
  test('should load environment files without exposing secret values to client code', () => {
    const projectDir = path.resolve(__dirname, '..');
    const { loadedEnvFiles } = loadEnvConfig(projectDir, true);

    // Verify .env.local or .env is detected by Next.js env loader
    assert.ok(loadedEnvFiles.length > 0);
    assert.ok(loadedEnvFiles.some((f) => f.path.includes('.env')));

    // Ensure NEXT_PUBLIC prefix is not misused for server secret
    assert.equal(process.env.NEXT_PUBLIC_GEMINI_API_KEY, undefined);
  });

  test('should classify authentication and permission errors correctly', () => {
    const err = new Error('API_KEY_INVALID: User not found or key revoked');
    assert.equal(classifyGeminiError(err), 'AUTHENTICATION_ERROR');

    const permErr = new Error('403 Forbidden: PERMISSION_DENIED on generative model');
    assert.equal(classifyGeminiError(permErr), 'AUTHENTICATION_ERROR');
  });

  test('should classify service unavailable / high demand errors correctly', () => {
    const highDemandErr = new Error('Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.');
    assert.equal(classifyGeminiError(highDemandErr), 'SERVICE_UNAVAILABLE');
  });

  test('should classify rate limit and quota errors correctly', () => {
    const rateErr = new Error('429 Too Many Requests: RESOURCE_EXHAUSTED quota exceeded');
    assert.equal(classifyGeminiError(rateErr), 'RATE_LIMIT');
  });

  test('should classify model not found errors correctly', () => {
    const notFoundErr = new Error('404 Not Found: models/gemini-invalid is not supported');
    assert.equal(classifyGeminiError(notFoundErr), 'MODEL_NOT_FOUND');
  });

  test('should classify timeout and network errors correctly', () => {
    const timeoutErr = new Error('The operation was aborted due to timeout');
    assert.equal(classifyGeminiError(timeoutErr), 'TIMEOUT');

    const netErr = new Error('fetch failed: getaddrinfo ENOTFOUND generativelanguage.googleapis.com');
    assert.equal(classifyGeminiError(netErr), 'NETWORK_ERROR');
  });
});
