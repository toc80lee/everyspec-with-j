import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetIdToken, mockAuthState } = vi.hoisted(() => {
  const getIdToken = vi.fn<(...args: any[]) => Promise<string>>();
  return {
    mockGetIdToken: getIdToken,
    mockAuthState: {
      currentUser: {
        uid: 'user-1',
        getIdToken,
      } as { uid: string; getIdToken: typeof getIdToken } | null,
    },
  };
});

vi.mock('../../lib/firebase', () => ({
  auth: mockAuthState,
}));

import {
  AuthorizedFetchAbortError,
  AuthorizedFetchTimeoutError,
  authorizedFetch,
} from '../authorizedFetch';
import {
  AiBlockingError,
  requestAiMeetingMinutes,
  requestAiSampleRecommendation,
} from '../aiLogicGenerator';

describe('authorizedFetch timeout, token guard, and abort resilience', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockAuthState.currentUser = {
      uid: 'user-1',
      getIdToken: mockGetIdToken,
    };
    mockGetIdToken.mockReset();
    mockGetIdToken.mockResolvedValue('mock-jwt-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws AuthorizedFetchTimeoutError (phase=token) when Firebase getIdToken hangs', async () => {
    vi.useFakeTimers();
    mockGetIdToken.mockImplementation(() => new Promise(() => {}));

    const pending = authorizedFetch('/api/summarize-meeting-minutes', {
      method: 'POST',
      tokenTimeoutMs: 1000,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AuthorizedFetchTimeoutError',
      code: 'REQUEST_TIMEOUT',
      phase: 'token',
    });

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('throws AuthorizedFetchTimeoutError (phase=network) when fetch stalls past timeoutMs', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted.');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    }) as any;

    const pending = authorizedFetch('/api/summarize-meeting-minutes', {
      method: 'POST',
      timeoutMs: 2000,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AuthorizedFetchTimeoutError',
      code: 'REQUEST_TIMEOUT',
      phase: 'network',
    });

    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });

  it('throws AuthorizedFetchAbortError when caller signal is aborted', async () => {
    globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    }) as any;

    const controller = new AbortController();
    const pending = authorizedFetch('/api/summarize-meeting-minutes', {
      method: 'POST',
      signal: controller.signal,
      timeoutMs: 10_000,
    });

    // Yield microtasks so getIdToken resolves and fetch starts
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AuthorizedFetchAbortError);
  });

  it('retries once with forceRefresh=true when server returns 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'expired' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as any;

    const res = await authorizedFetch('/api/summarize-meeting-minutes', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(mockGetIdToken).toHaveBeenNthCalledWith(1, false);
    expect(mockGetIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AI wizard request blocking errors vs structured fallback reasons', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockAuthState.currentUser = {
      uid: 'user-2',
      getIdToken: mockGetIdToken,
    };
    mockGetIdToken.mockReset();
    mockGetIdToken.mockResolvedValue('valid-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-throws AiBlockingError on 403 APPROVAL_REQUIRED in requestAiMeetingMinutes', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 'APPROVAL_REQUIRED',
          error: '관리자 승인이 필요합니다.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    await expect(
      requestAiMeetingMinutes({
        mode: 'create',
        rawTranscript: 'FI 전표 상세 조회 프로그램',
      })
    ).rejects.toMatchObject({
      name: 'AiBlockingError',
      statusCode: 403,
      code: 'APPROVAL_REQUIRED',
    });
  });

  it('re-throws AiBlockingError on 429 RATE_LIMIT_EXCEEDED in requestAiSampleRecommendation', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 'RATE_LIMIT_EXCEEDED',
          error: '요청이 너무 많습니다.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    await expect(
      requestAiSampleRecommendation({
        minutesMarkdown: '## 1. 회의 개요\nFI 전표 조회',
      })
    ).rejects.toBeInstanceOf(AiBlockingError);
  });

  it('re-throws AuthorizedFetchAbortError instead of returning fallback when user cancels', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestAiMeetingMinutes(
        {
          mode: 'create',
          rawTranscript: 'MM 구매오더 조회',
        },
        { signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(AuthorizedFetchAbortError);
  });

  it('falls back with fallbackReason=timeout when request times out', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as any;

    const pending = requestAiMeetingMinutes(
      {
        mode: 'create',
        rawTranscript: 'FI 전표 상세 조회 프로그램을 만들려고 합니다',
      },
      { timeoutMs: 1500 }
    );

    await vi.advanceTimersByTimeAsync(1500);
    const result = await pending;

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('timeout');
    expect(result.detectedModule).toBe('FI');
    expect(result.minutesMarkdown).toContain('FI 전표 상세 조회');
  });

  it('falls back with fallbackReason=server_unavailable when backend returns 503', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const rec = await requestAiSampleRecommendation({
      minutesMarkdown: '## 1. 회의 개요\n상단 전표 리스트 및 하단 품목 상세 조회',
    });

    expect(rec.source).toBe('fallback');
    expect(rec.fallbackReason).toBe('server_unavailable');
    expect(rec.recommendedSampleType).toBe('02');
  });
});
