import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiMissingKeyError,
  GeminiTimeoutError,
  getConfiguredGeminiApiKey,
  getGeminiClient,
  isCredentialOrMissingKeyError,
  withGeminiTimeout,
} from './geminiClient';

describe('geminiClient credential validation', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.useRealTimers();
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('treats missing or placeholder GEMINI_API_KEY as unconfigured', () => {
    delete process.env.GEMINI_API_KEY;
    expect(getConfiguredGeminiApiKey()).toBeNull();

    process.env.GEMINI_API_KEY = '   ';
    expect(getConfiguredGeminiApiKey()).toBeNull();

    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
    expect(getConfiguredGeminiApiKey()).toBeNull();
  });

  it('throws GeminiMissingKeyError instead of triggering Google Auth ADC when key is absent', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => getGeminiClient()).toThrow(GeminiMissingKeyError);
  });

  it('detects Google default credentials and missing key errors cleanly', () => {
    expect(
      isCredentialOrMissingKeyError(
        new Error(
          'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started'
        )
      )
    ).toBe(true);
    expect(isCredentialOrMissingKeyError(new GeminiMissingKeyError())).toBe(true);
    expect(isCredentialOrMissingKeyError(new Error('Network timeout'))).toBe(false);
  });

  it('withGeminiTimeout resolves when inner promise completes before deadline', async () => {
    const result = await withGeminiTimeout(Promise.resolve('ok'), 500, 'Unit test AI');
    expect(result).toBe('ok');
  });

  it('withGeminiTimeout rejects with GeminiTimeoutError (status 504) after timeoutMs', async () => {
    vi.useFakeTimers();
    const neverResolving = new Promise<string>(() => {});
    const pending = withGeminiTimeout(neverResolving, 2500, 'Meeting AI');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'GeminiTimeoutError',
      statusCode: 504,
    });

    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
    await expect(pending).rejects.toBeInstanceOf(GeminiTimeoutError);
  });
});

