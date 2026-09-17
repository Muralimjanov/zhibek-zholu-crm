import { ApiError } from '@/lib/errors';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? 'http://localhost:3000/api/v1';

/**
 * The access token lives in memory only. The CSRF token (not a credential on
 * its own - the refresh cookie is HttpOnly) is kept in localStorage so that a
 * reload and other tabs can refresh the session when the API is on another
 * site and its CSRF cookie is unreadable.
 */
const CSRF_KEY = 'uzz-csrf';
let accessToken: string | null = null;
let csrfToken: string | null = readCsrf();
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

function readCsrf(): string | null {
  try {
    return localStorage.getItem(CSRF_KEY);
  } catch {
    return csrfToken;
  }
}

export function setSession(token: string | null, csrf: string | null) {
  accessToken = token;
  csrfToken = csrf;
  try {
    if (csrf) localStorage.setItem(CSRF_KEY, csrf);
    else localStorage.removeItem(CSRF_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

export function hasCsrf(): boolean {
  return Boolean(readCsrf());
}

export function onExpired(handler: () => void) {
  onSessionExpired = handler;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Do not try to refresh on 401 (auth endpoints). */
  noRefresh?: boolean;
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`;
  let details: string[] = [];
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') code = body.message;
    else if (Array.isArray(body.message)) {
      code = 'VALIDATION_FAILED';
      details = body.message.map(String);
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, code, details);
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, credentials: 'include' });
}

/**
 * Rotates the refresh cookie. Refresh tokens are single-use and the server
 * treats a replayed one as theft (the whole session is revoked), so rotation
 * is serialised across tabs with the Web Locks API, and the latest CSRF token
 * is re-read after waiting - another tab may have rotated meanwhile.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const run = () => doRefresh();
      return navigator.locks ? await navigator.locks.request('uzz-session-refresh', run) : await run();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const csrf = readCsrf();
  if (!csrf) return false;
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': csrf, Accept: 'application/json' },
    });
    if (!res.ok) {
      // Only drop the stored token if nobody rotated it while we were waiting.
      if (readCsrf() === csrf) setSession(null, null);
      return false;
    }
    const data = (await res.json()) as { accessToken: string; csrfToken: string };
    setSession(data.accessToken, data.csrfToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !opts.noRefresh && accessToken !== null) {
    const refreshed = await refreshSession();
    if (refreshed) res = await send(path, opts);
    else onSessionExpired?.();
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRaw(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // Nest sends an empty 200 body for a `null` result (e.g. no payroll settings yet).
  return (text ? JSON.parse(text) : null) as T;
}

export function csrfHeader(): Record<string, string> {
  const csrf = readCsrf();
  return csrf ? { 'x-csrf-token': csrf } : {};
}

/** Downloads a protected file (Authorization header) and saves it. */
export async function downloadFile(path: string, fallbackName: string, query?: RequestOptions['query'], headers?: Record<string, string>) {
  const res = await apiRaw(path, { query, headers });
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Loads a protected image into an object URL (caller revokes). */
export async function fetchObjectUrl(path: string): Promise<string> {
  const res = await apiRaw(path);
  return URL.createObjectURL(await res.blob());
}
