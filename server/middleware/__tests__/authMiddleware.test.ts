import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  AuthHttpError,
  SlidingWindowRateLimiter,
  createAuthorizeCaller,
  createRequireApprovedAuth,
  verifyFirebaseIdToken,
  type AuthenticatedRequest,
  type VerifiedFirebaseCaller,
} from '../authMiddleware';

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSignedJwt(
  payload: Record<string, any>,
  privateKeyPem: string,
  header: { alg?: string; kid?: string } = { alg: 'RS256', kid: 'key-1' }
): string {
  const headerB64 = toBase64Url(JSON.stringify({ typ: 'JWT', ...header }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${toBase64Url(signature)}`;
}

function createMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: any = undefined;

  const res = {
    setHeader(name: string, value: string) {
      headers[name] = String(value);
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: any) {
      jsonBody = body;
      return res;
    },
  } as unknown as Response;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
    getHeaders: () => headers,
  };
}

describe('verifyFirebaseIdToken', () => {
  const projectId = 'test-firebase-project';
  const nowSec = 1_760_000_000;
  const keyPair1 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const keyPair2 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const basePayload = {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'user_uid_123',
    email: 'User@Example.com',
    email_verified: true,
    iat: nowSec - 60,
    exp: nowSec + 3600,
  };

  it('passes for a valid RS256 Firebase ID token and normalizes email', async () => {
    const token = createSignedJwt(basePayload, keyPair1.privateKey, { alg: 'RS256', kid: 'key-1' });
    const verified = await verifyFirebaseIdToken(token, {
      projectId,
      nowSeconds: nowSec,
      getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
    });

    expect(verified).toEqual({
      uid: 'user_uid_123',
      email: 'user@example.com',
      emailVerified: true,
    });
  });

  it('throws 401 TOKEN_EXPIRED when exp is at or before current time', async () => {
    const token = createSignedJwt(
      { ...basePayload, exp: nowSec - 1 },
      keyPair1.privateKey,
      { alg: 'RS256', kid: 'key-1' }
    );

    await expect(
      verifyFirebaseIdToken(token, {
        projectId,
        nowSeconds: nowSec,
        getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('throws 401 INVALID_TOKEN_CLAIMS for wrong aud or iss', async () => {
    const wrongAudToken = createSignedJwt(
      { ...basePayload, aud: 'other-project' },
      keyPair1.privateKey,
      { alg: 'RS256', kid: 'key-1' }
    );
    await expect(
      verifyFirebaseIdToken(wrongAudToken, {
        projectId,
        nowSeconds: nowSec,
        getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN_CLAIMS',
    });

    const wrongIssToken = createSignedJwt(
      { ...basePayload, iss: 'https://securetoken.google.com/other-project' },
      keyPair1.privateKey,
      { alg: 'RS256', kid: 'key-1' }
    );
    await expect(
      verifyFirebaseIdToken(wrongIssToken, {
        projectId,
        nowSeconds: nowSec,
        getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN_CLAIMS',
    });
  });

  it('throws 401 INVALID_TOKEN when signature does not match public key', async () => {
    const forgedToken = createSignedJwt(basePayload, keyPair2.privateKey, {
      alg: 'RS256',
      kid: 'key-1',
    });

    await expect(
      verifyFirebaseIdToken(forgedToken, {
        projectId,
        nowSeconds: nowSec,
        getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('throws 403 EMAIL_NOT_VERIFIED when email_verified is false', async () => {
    const unverifiedToken = createSignedJwt(
      { ...basePayload, email_verified: false },
      keyPair1.privateKey,
      { alg: 'RS256', kid: 'key-1' }
    );

    await expect(
      verifyFirebaseIdToken(unverifiedToken, {
        projectId,
        nowSeconds: nowSec,
        getPublicKeys: async () => ({ 'key-1': keyPair1.publicKey }),
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('forces a single public-key refresh when kid is missing from cached keys', async () => {
    const rotatedToken = createSignedJwt(basePayload, keyPair2.privateKey, {
      alg: 'RS256',
      kid: 'key-rotated',
    });

    const getPublicKeys = vi.fn(async (forceRefresh = false): Promise<Record<string, string>> => {
      if (!forceRefresh) {
        return { 'key-1': keyPair1.publicKey };
      }
      return {
        'key-1': keyPair1.publicKey,
        'key-rotated': keyPair2.publicKey,
      };
    });

    const verified = await verifyFirebaseIdToken(rotatedToken, {
      projectId,
      nowSeconds: nowSec,
      getPublicKeys,
    });

    expect(getPublicKeys).toHaveBeenCalledTimes(2);
    expect(getPublicKeys).toHaveBeenNthCalledWith(1, false);
    expect(getPublicKeys).toHaveBeenNthCalledWith(2, true);
    expect(verified.uid).toBe('user_uid_123');
  });
});

describe('createRequireApprovedAuth & SlidingWindowRateLimiter', () => {
  const approvedCaller: VerifiedFirebaseCaller = {
    uid: 'uid-approved',
    email: 'dev@example.com',
    emailVerified: true,
    role: 'user',
    status: 'approved',
    assignedProjects: ['2601'],
    projectRole: 'FUNC',
  };

  it('returns 401 UNAUTHORIZED when Bearer Authorization header is missing', async () => {
    const middleware = createRequireApprovedAuth('standard', {
      verifyToken: vi.fn(),
      checkApproval: vi.fn(),
      rateLimiter: new SlidingWindowRateLimiter(),
    });
    const req = { headers: {} } as AuthenticatedRequest;
    const mockRes = createMockResponse();
    const next = vi.fn();

    await middleware(req, mockRes.res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockRes.getStatus()).toBe(401);
    expect(mockRes.getBody().code).toBe('UNAUTHORIZED');
  });

  it('returns 403 APPROVAL_REQUIRED for pending or rejected non-admin callers', async () => {
    for (const status of ['pending', 'rejected'] as const) {
      const middleware = createRequireApprovedAuth('standard', {
        verifyToken: async () => ({
          uid: `uid-${status}`,
          email: `${status}@example.com`,
          emailVerified: true,
        }),
        checkApproval: async () => ({
          uid: `uid-${status}`,
          email: `${status}@example.com`,
          emailVerified: true,
          role: 'user',
          status,
          assignedProjects: [],
          projectRole: 'FUNC',
        }),
        rateLimiter: new SlidingWindowRateLimiter(),
      });

      const req = {
        headers: { authorization: 'Bearer valid-token' },
      } as AuthenticatedRequest;
      const mockRes = createMockResponse();
      const next = vi.fn();

      await middleware(req, mockRes.res, next);

      expect(next).not.toHaveBeenCalled();
      expect(mockRes.getStatus()).toBe(403);
      expect(mockRes.getBody().code).toBe('APPROVAL_REQUIRED');
    }

    // Also verify when checkApproval throws AuthHttpError(403, 'APPROVAL_REQUIRED', ...)
    const throwingAuthorize = createAuthorizeCaller('standard', {
      verifyToken: async () => ({
        uid: 'uid-pending-doc',
        email: 'pending@example.com',
        emailVerified: true,
      }),
      checkApproval: async () => {
        throw new AuthHttpError(403, 'APPROVAL_REQUIRED', 'Approval required');
      },
      rateLimiter: new SlidingWindowRateLimiter(),
    });
    const req = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
    const mockRes = createMockResponse();
    const caller = await throwingAuthorize(req, mockRes.res);

    expect(caller).toBeNull();
    expect(mockRes.getStatus()).toBe(403);
    expect(mockRes.getBody().code).toBe('APPROVAL_REQUIRED');
  });

  it('attaches req.caller, sets rate-limit headers, and calls next() for approved callers', async () => {
    const middleware = createRequireApprovedAuth('standard', {
      verifyToken: async () => ({
        uid: approvedCaller.uid,
        email: approvedCaller.email,
        emailVerified: true,
      }),
      checkApproval: async () => approvedCaller,
      rateLimiter: new SlidingWindowRateLimiter(),
    });

    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as AuthenticatedRequest;
    const mockRes = createMockResponse();
    const next = vi.fn();

    await middleware(req, mockRes.res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.caller).toEqual(approvedCaller);
    expect(mockRes.getHeaders()['X-RateLimit-Limit']).toBe('30');
    expect(mockRes.getHeaders()['X-RateLimit-Remaining']).toBe('29');
  });

  it('enforces 429 RATE_LIMIT_EXCEEDED + Retry-After for heavy (10/min) and standard (30/min) tiers', async () => {
    const heavyLimiter = new SlidingWindowRateLimiter();
    const heavyMiddleware = createRequireApprovedAuth('heavy', {
      verifyToken: async () => ({
        uid: approvedCaller.uid,
        email: approvedCaller.email,
        emailVerified: true,
      }),
      checkApproval: async () => approvedCaller,
      rateLimiter: heavyLimiter,
    });

    for (let i = 0; i < 10; i++) {
      const req = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
      const mockRes = createMockResponse();
      const next = vi.fn();
      await heavyMiddleware(req, mockRes.res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRes.getHeaders()['X-RateLimit-Limit']).toBe('10');
      expect(mockRes.getHeaders()['X-RateLimit-Remaining']).toBe(String(9 - i));
    }

    const blockedReq = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
    const blockedRes = createMockResponse();
    const blockedNext = vi.fn();
    await heavyMiddleware(blockedReq, blockedRes.res, blockedNext);

    expect(blockedNext).not.toHaveBeenCalled();
    expect(blockedRes.getStatus()).toBe(429);
    expect(blockedRes.getBody().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(blockedRes.getHeaders()['Retry-After'])).toBeGreaterThanOrEqual(1);

    const standardLimiter = new SlidingWindowRateLimiter();
    const standardMiddleware = createRequireApprovedAuth('standard', {
      verifyToken: async () => ({
        uid: approvedCaller.uid,
        email: approvedCaller.email,
        emailVerified: true,
      }),
      checkApproval: async () => approvedCaller,
      rateLimiter: standardLimiter,
    });

    for (let i = 0; i < 30; i++) {
      const req = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
      const mockRes = createMockResponse();
      const next = vi.fn();
      await standardMiddleware(req, mockRes.res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }

    const stdBlockedReq = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest;
    const stdBlockedRes = createMockResponse();
    const stdBlockedNext = vi.fn();
    await standardMiddleware(stdBlockedReq, stdBlockedRes.res, stdBlockedNext);
    expect(stdBlockedNext).not.toHaveBeenCalled();
    expect(stdBlockedRes.getStatus()).toBe(429);
  });

  it('recovers capacity in SlidingWindowRateLimiter after the sliding window elapses', () => {
    const limiter = new SlidingWindowRateLimiter();
    const t0 = 1_000_000;
    const windowMs = 60_000;

    for (let i = 0; i < 10; i++) {
      expect(limiter.consume('heavy:u1', 10, windowMs, t0 + i * 100).allowed).toBe(true);
    }
    const denied = limiter.consume('heavy:u1', 10, windowMs, t0 + 5_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);

    const recovered = limiter.consume('heavy:u1', 10, windowMs, t0 + windowMs + 1_000);
    expect(recovered.allowed).toBe(true);
    expect(recovered.remaining).toBe(9);
  });
});
