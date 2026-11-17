import { auth } from '../lib/firebase';

export async function authorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다. Google 계정으로 로그인한 뒤 다시 시도해 주세요.');
  }

  const makeRequest = async (forceRefresh: boolean): Promise<Response> => {
    const token = await user.getIdToken(forceRefresh);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(false);
  if (res.status === 401) {
    // Token may have just expired or rotated; refresh once and retry
    res = await makeRequest(true);
  }
  return res;
}
