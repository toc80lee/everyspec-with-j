import { afterEach, describe, expect, it } from 'vitest';
import {
  GeminiMissingKeyError,
  getConfiguredGeminiApiKey,
  getGeminiClient,
  isCredentialOrMissingKeyError,
} from './geminiClient';

describe('geminiClient credential validation', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
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
});
