import { auth } from '../lib/firebase';

export const DEFAULT_AUTHORIZED_FETCH_TIMEOUT_MS = 25_000;
export const DEFAULT_TOKEN_TIMEOUT_MS = 8_000;

export class AuthorizedFetchTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  readonly phase: 'token' | 'network';

  constructor(
    message = '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
    phase: 'token' | 'network' = 'network'
  ) {
    super(message);
    this.name = 'AuthorizedFetchTimeoutError';
    this.phase = phase;
  }
}

export class AuthorizedFetchAbortError extends Error {
  readonly code = 'REQUEST_ABORTED';

  constructor(message = '요청이 사용자에 의해 취소되었습니다.') {
    super(message);
    this.name = 'AuthorizedFetchAbortError';
  }
}

export function isAuthorizedFetchAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof AuthorizedFetchAbortError) return true;
  const anyErr = err as { name?: string; code?: string };
  return anyErr.code === 'REQUEST_ABORTED' || anyErr.name === 'AbortError';
}

export function isAuthorizedFetchTimeoutError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof AuthorizedFetchTimeoutError) return true;
  const anyErr = err as { code?: string };
  return anyErr.code === 'REQUEST_TIMEOUT';
}

export interface AuthorizedFetchOptions extends RequestInit {
  timeoutMs?: number;
  tokenTimeoutMs?: number;
}

async function getIdTokenWithGuard(
  user: NonNullable<typeof auth.currentUser>,
  forceRefresh: boolean,
  tokenTimeoutMs: number,
  externalSignal?: AbortSignal | null
): Promise<string> {
  if (externalSignal?.aborted) {
    throw new AuthorizedFetchAbortError();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const tokenPromise = user.getIdToken(forceRefresh);

  const guardPromise = new Promise<never>((_, reject) => {
    if (tokenTimeoutMs > 0) {
      timer = setTimeout(() => {
        reject(
          new AuthorizedFetchTimeoutError(
            '인증 토큰 확인 시간이 초과되었습니다. 네트워크 상태를 확인하거나 다시 로그인해 주세요.',
            'token'
          )
        );
      }, tokenTimeoutMs);
    }

    if (externalSignal) {
      onAbort = () => {
        reject(new AuthorizedFetchAbortError());
      };
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    return await Promise.race([tokenPromise, guardPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (externalSignal && onAbort) {
      externalSignal.removeEventListener('abort', onAbort);
    }
  }
}

export async function authorizedFetch(
  input: RequestInfo | URL,
  init: AuthorizedFetchOptions = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다. Google 계정으로 로그인한 뒤 다시 시도해 주세요.');
  }

  const {
    timeoutMs = DEFAULT_AUTHORIZED_FETCH_TIMEOUT_MS,
    tokenTimeoutMs = DEFAULT_TOKEN_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchInit
  } = init;

  if (externalSignal?.aborted) {
    throw new AuthorizedFetchAbortError();
  }

  const startedAt = Date.now();

  const makeRequest = async (forceRefresh: boolean): Promise<Response> => {
    const token = await getIdTokenWithGuard(
      user,
      forceRefresh,
      tokenTimeoutMs,
      externalSignal
    );

    const headers = new Headers(fetchInit.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onExternalAbort = () => {
      controller.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new AuthorizedFetchAbortError();
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    if (timeoutMs > 0) {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(1_000, timeoutMs - elapsed);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, remaining);
    }

    try {
      return await fetch(input, {
        ...fetchInit,
        headers,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (timedOut) {
        throw new AuthorizedFetchTimeoutError(
          `AI 서버 응답 시간이 초과되었습니다 (${Math.round(timeoutMs / 1000)}초). 잠시 후 다시 시도해 주세요.`,
          'network'
        );
      }
      if (externalSignal?.aborted || err?.name === 'AbortError') {
        throw new AuthorizedFetchAbortError();
      }
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };

  let res = await makeRequest(false);
  if (res.status === 401) {
    // Token may have just expired or rotated; refresh once and retry
    res = await makeRequest(true);
  }
  return res;
}
