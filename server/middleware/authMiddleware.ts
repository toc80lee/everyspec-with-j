import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'toc80.lee@gmail.com',
  'toc50.park@gmail.com',
];

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface FirebaseRuntimeConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

export interface VerifiedFirebaseCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: 'admin' | 'user';
  status: 'approved' | 'pending' | 'rejected';
  assignedProjects: string[];
  projectRole: string;
}

export type RateLimitTier = 'standard' | 'heavy';

export interface AuthenticatedRequest extends Request {
  caller?: VerifiedFirebaseCaller;
}

const RATE_LIMIT_WINDOWS_MS = 60_000;
const RATE_LIMIT_MAX_BY_TIER: Record<RateLimitTier, number> = {
  standard: 30,
  heavy: 10,
};

let cachedConfig: FirebaseRuntimeConfig | null = null;

export function getFirebaseRuntimeConfig(): FirebaseRuntimeConfig {
  if (cachedConfig) return cachedConfig;
  const fallbackProjectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0171535210';
  const fallbackDbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      cachedConfig = {
        projectId: String(parsed.projectId || fallbackProjectId),
        firestoreDatabaseId: String(parsed.firestoreDatabaseId || fallbackDbId),
      };
      return cachedConfig;
    }
  } catch (err) {
    console.warn('Could not read firebase-applet-config.json, using fallback config:', err);
  }
  cachedConfig = {
    projectId: fallbackProjectId,
    firestoreDatabaseId: fallbackDbId,
  };
  return cachedConfig;
}

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;
let lastCertRefreshAt = 0;

async function fetchGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certsExpiresAt > now && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  if (forceRefresh && now - lastCertRefreshAt < 10_000 && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  lastCertRefreshAt = now;
  let res: globalThis.Response;
  try {
    res = await fetch(GOOGLE_CERTS_URL, {
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new AuthHttpError(504, 'AUTH_LOOKUP_TIMEOUT', 'Google 인증 키 조회 응답 시간이 초과되었습니다.');
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys (HTTP ${res.status})`);
  }
  const data = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Math.max(Number(maxAgeMatch[1]), 60) * 1000 : 3600_000;
  cachedCerts = data;
  certsExpiresAt = now + maxAgeMs;
  return cachedCerts;
}

function decodeBase64UrlJson<T = Record<string, any>>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export class AuthHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthHttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function verifyFirebaseIdToken(
  token: string,
  options?: {
    projectId?: string;
    getPublicKeys?: (forceRefresh?: boolean) => Promise<Record<string, string>>;
    nowSeconds?: number;
  }
): Promise<{ uid: string; email: string; emailVerified: boolean }> {
  const cleanToken = (token || '').trim();
  const parts = cleanToken.split('.');
  if (parts.length !== 3) {
    throw new AuthHttpError(401, 'INVALID_TOKEN', '유효하지 않은 인증 토큰 형식입니다.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: Record<string, any>;
  try {
    header = decodeBase64UrlJson(headerB64);
    payload = decodeBase64UrlJson(payloadB64);
  } catch {
    throw new AuthHttpError(401, 'INVALID_TOKEN', '인증 토큰을 디코딩할 수 없습니다.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new AuthHttpError(401, 'INVALID_TOKEN', '지원되지 않는 JWT 서명 알고리즘입니다.');
  }

  const getKeys = options?.getPublicKeys || fetchGooglePublicCerts;
  let certs = await getKeys(false);
  let publicKey = certs[header.kid];
  if (!publicKey) {
    certs = await getKeys(true);
    publicKey = certs[header.kid];
  }
  if (!publicKey) {
    throw new AuthHttpError(401, 'INVALID_TOKEN', '인증 서명 키(kid)가 유효하지 않습니다.');
  }

  const signedContent = `${headerB64}.${payloadB64}`;
  const signatureBuf = decodeBase64UrlBuffer(signatureB64);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signedContent);
  verifier.end();
  const isSignatureValid = verifier.verify(publicKey, signatureBuf);
  if (!isSignatureValid) {
    throw new AuthHttpError(401, 'INVALID_TOKEN', '인증 토큰 서명 검증에 실패했습니다.');
  }

  const projectId = options?.projectId || getFirebaseRuntimeConfig().projectId;
  const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
    throw new AuthHttpError(401, 'INVALID_TOKEN_CLAIMS', '프로젝트 대상(aud/iss)이 일치하지 않습니다.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new AuthHttpError(401, 'TOKEN_EXPIRED', '로그인 세션이 만료되었습니다. 다시 시도해 주세요.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 60) {
    throw new AuthHttpError(401, 'INVALID_TOKEN_CLAIMS', '유효하지 않은 토큰 발급 시각입니다.');
  }
  const uid = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    throw new AuthHttpError(401, 'INVALID_TOKEN_CLAIMS', '사용자 식별자(sub)가 유효하지 않습니다.');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload.email_verified === true;
  if (!emailVerified) {
    throw new AuthHttpError(403, 'EMAIL_NOT_VERIFIED', '이메일 인증이 완료된 Google 계정만 API를 호출할 수 있습니다.');
  }

  return { uid, email, emailVerified };
}

interface CachedApprovalEntry {
  caller: VerifiedFirebaseCaller;
  expiresAt: number;
}

const approvalCache = new Map<string, CachedApprovalEntry>();
const APPROVAL_CACHE_TTL_MS = 30_000;

export function clearApprovalCache(uid?: string): void {
  if (uid) {
    approvalCache.delete(uid);
  } else {
    approvalCache.clear();
  }
}

async function fetchUserApprovalFromFirestoreRest(
  uid: string,
  email: string,
  idToken: string
): Promise<VerifiedFirebaseCaller> {
  if (BOOTSTRAPPED_ADMIN_EMAILS.includes(email.toLowerCase())) {
    return {
      uid,
      email,
      emailVerified: true,
      role: 'admin',
      status: 'approved',
      assignedProjects: [],
      projectRole: 'ADMIN',
    };
  }

  const now = Date.now();
  const cached = approvalCache.get(uid);
  if (cached && cached.expiresAt > now) {
    return cached.caller;
  }

  const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig();
  const encodedDb = encodeURIComponent(firestoreDatabaseId || '(default)');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodedDb}/documents/users/${encodeURIComponent(uid)}`;

  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new AuthHttpError(
        504,
        'AUTH_LOOKUP_TIMEOUT',
        '사용자 권한 확인 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
    throw new AuthHttpError(
      503,
      'AUTH_LOOKUP_UNAVAILABLE',
      '권한 조회 서비스에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
    );
  }

  if (res.status === 404) {
    throw new AuthHttpError(403, 'APPROVAL_REQUIRED', '등록된 사용자 프로필이 없습니다. 관리자 승인 후 이용해 주세요.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthHttpError(403, 'APPROVAL_REQUIRED', '사용자 권한 확인이 거부되었습니다. 로그인 상태를 확인해 주세요.');
  }
  if (!res.ok) {
    throw new AuthHttpError(503, 'AUTH_LOOKUP_UNAVAILABLE', `권한 조회 서비스 응답 오류 (HTTP ${res.status})`);
  }

  const docJson = (await res.json()) as { fields?: Record<string, any> };
  const fields = docJson?.fields || {};
  const role = fields.role?.stringValue === 'admin' ? 'admin' : 'user';
  const rawStatus = fields.status?.stringValue;
  const status: 'approved' | 'pending' | 'rejected' =
    rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'pending'
      ? rawStatus
      : 'pending';
  const projectRole = fields.projectRole?.stringValue || (role === 'admin' ? 'ADMIN' : 'FUNC');
  const assignedProjects: string[] = Array.isArray(fields.assignedProjects?.arrayValue?.values)
    ? fields.assignedProjects.arrayValue.values
        .map((v: any) => v?.stringValue)
        .filter((s: any): s is string => typeof s === 'string')
    : [];

  if (role !== 'admin' && status !== 'approved') {
    throw new AuthHttpError(
      403,
      'APPROVAL_REQUIRED',
      status === 'rejected'
        ? '관리자에 의해 접근 권한이 거절/차단된 계정입니다.'
        : '관리자 승인 대기 중인 계정은 AI API를 사용할 수 없습니다.'
    );
  }

  const caller: VerifiedFirebaseCaller = {
    uid,
    email,
    emailVerified: true,
    role,
    status,
    assignedProjects,
    projectRole,
  };
  approvalCache.set(uid, { caller, expiresAt: now + APPROVAL_CACHE_TTL_MS });
  return caller;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();

  consume(
    key: string,
    maxRequests: number,
    windowMs = RATE_LIMIT_WINDOWS_MS,
    now = Date.now()
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const cutoff = now - windowMs;
    const timestamps = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
      this.buckets.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - timestamps.length),
      retryAfterSeconds: 0,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

const defaultRateLimiter = new SlidingWindowRateLimiter();

export interface AuthMiddlewareDeps {
  verifyToken?: (token: string) => Promise<{ uid: string; email: string; emailVerified: boolean }>;
  checkApproval?: (uid: string, email: string, token: string) => Promise<VerifiedFirebaseCaller>;
  rateLimiter?: SlidingWindowRateLimiter;
}

export function extractBearerToken(authHeader?: string | string[]): string | null {
  const headerVal = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerVal || typeof headerVal !== 'string') return null;
  const match = headerVal.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]?.trim()) return null;
  return match[1].trim();
}

export function createAuthorizeCaller(tier: RateLimitTier = 'standard', deps?: AuthMiddlewareDeps) {
  const verifyFn = deps?.verifyToken || ((t: string) => verifyFirebaseIdToken(t));
  const checkFn = deps?.checkApproval || fetchUserApprovalFromFirestoreRest;
  const limiter = deps?.rateLimiter || defaultRateLimiter;
  const maxReqs = RATE_LIMIT_MAX_BY_TIER[tier];

  return async function authorizeRequest(req: AuthenticatedRequest, res: Response): Promise<VerifiedFirebaseCaller | null> {
    const token = extractBearerToken(req.headers?.authorization);
    if (!token) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        error: '인증 토큰이 필요합니다. Google 계정으로 로그인해 주세요.',
      });
      return null;
    }

    try {
      const verified = await verifyFn(token);
      if (!verified.emailVerified) {
        throw new AuthHttpError(403, 'EMAIL_NOT_VERIFIED', '이메일 인증이 완료된 계정만 접근할 수 있습니다.');
      }

      const caller = await checkFn(verified.uid, verified.email, token);
      if (caller.role !== 'admin' && caller.status !== 'approved') {
        throw new AuthHttpError(403, 'APPROVAL_REQUIRED', '관리자 승인 완료 후 이용할 수 있습니다.');
      }

      const rateRes = limiter.consume(`${tier}:${caller.uid}`, maxReqs);
      res.setHeader('X-RateLimit-Limit', String(maxReqs));
      res.setHeader('X-RateLimit-Remaining', String(rateRes.remaining));

      if (!rateRes.allowed) {
        res.setHeader('Retry-After', String(rateRes.retryAfterSeconds));
        res.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          error: `요청 한도를 초과했습니다. ${rateRes.retryAfterSeconds}초 후 다시 시도해 주세요.`,
        });
        return null;
      }

      req.caller = caller;
      return caller;
    } catch (err: any) {
      if (err instanceof AuthHttpError) {
        res.status(err.statusCode).json({
          code: err.code,
          error: err.message,
        });
        return null;
      }
      console.error('Auth verification error:', err);
      res.status(401).json({
        code: 'UNAUTHORIZED',
        error: '인증 확인 중 오류가 발생했습니다.',
      });
      return null;
    }
  };
}

export function createRequireApprovedAuth(tier: RateLimitTier = 'standard', deps?: AuthMiddlewareDeps) {
  const authorize = createAuthorizeCaller(tier, deps);
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const caller = await authorize(req, res);
    if (!caller) return;
    next();
  };
}

export const requireStandardAiAuth = createRequireApprovedAuth('standard');
export const requireHeavyAiAuth = createRequireApprovedAuth('heavy');

export const authorizeStandardRawRequest = createAuthorizeCaller('standard');
export const authorizeHeavyRawRequest = createAuthorizeCaller('heavy');
