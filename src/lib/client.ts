'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Identity } from './contracts';

export type SessionUser = Identity;
let sessionAccount: string | null = null;
export function setSessionAccount(id: string | null) { sessionAccount = id; }
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public fields?: Record<string, string>, public requestId?: string) { super(message); this.name = 'ApiError'; }
}
export async function api<T>(path: string, options: Omit<RequestInit, 'body'> & { body?: unknown } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (sessionAccount && !headers.has('X-Teumgil-Account') && !path.startsWith('/api/auth/') && path !== '/api/me') headers.set('X-Teumgil-Account', sessionAccount);
  const body = options.body instanceof FormData ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetch(path, { ...options, body, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, options.method && options.method !== 'GET' ? '서버 응답을 확인하지 못했어요. 입력은 남아 있어요. 저장된 내용을 확인한 뒤 다시 시도해 주세요.' : '연결을 확인하고 다시 불러와 주세요.', 'CONNECTION_UNKNOWN');
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/me') window.dispatchEvent(new Event('teumgil:session-expired'));
    throw new ApiError(response.status, value?.error ?? value?.message ?? '요청을 처리하지 못했어요. 다시 시도해 주세요.', value?.code, value?.fields, value?.requestId);
  }
  return value as T;
}
export const SessionContext = createContext<{ user: SessionUser | null; loading: boolean; reload: () => Promise<void> }>({ user: null, loading: true, reload: async () => {} });
export function useSession() { return useContext(SessionContext); }

export function useApi<T>(path: string | null) {
  const { user, loading: sessionLoading } = useSession();
  const scope = user?.id ?? 'anonymous';
  const [result, setResult] = useState<{ path: string | null; scope: string; data: T | null }>({ path, scope, data: null });
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<ApiError | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort();
    const request = ++sequence.current;
    if (sessionLoading) { setLoading(Boolean(path)); return; }
    if (!path) { setResult({ path, scope, data: null }); setLoading(false); setError(null); return; }
    const current = new AbortController(); controller.current = current;
    setLoading(true); setError(null);
    try {
      const data = await api<T>(path, { signal: current.signal });
      if (request === sequence.current) setResult({ path, scope, data });
    } catch (cause) {
      if (!current.signal.aborted && request === sequence.current) {
        const failure = cause instanceof ApiError ? cause : new ApiError(0, '내용을 불러오지 못했어요.');
        setError(failure);
        if ([401, 403, 404].includes(failure.status)) setResult({ path, scope, data: null });
      }
    } finally { if (request === sequence.current) setLoading(false); }
  }, [path, scope, sessionLoading]);
  // Fetch lifecycle state belongs to this remote resource. The sequence is a request counter, not a DOM ref.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void reload(); return () => { controller.current?.abort(); sequence.current++; }; }, [reload]);
  return { data: !sessionLoading && result.path === path && result.scope === scope ? result.data : null, loading: Boolean(path) && (sessionLoading || loading), error: sessionLoading ? null : error, reload };
}

export function safeNext(value: string | null, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value) || /^\/(login|signup)([/?#]|$)/.test(value)) return fallback;
  return value;
}
