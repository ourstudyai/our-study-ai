import { auth } from '@/lib/firebase/config';

// fetch() that sends a fresh Firebase ID token, so API routes do not depend on the session cookie.
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch { /* fall back to the cookie */ }
  return fetch(input, { ...init, headers, credentials: 'include' });
}
