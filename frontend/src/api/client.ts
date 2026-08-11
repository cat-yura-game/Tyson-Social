export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/u, '') ?? 'http://localhost:8787';

export function mediaUrl(key: string | null): string | null {
  return key ? `${API_URL}/api/media/${encodeURIComponent(key)}` : null;
}

const ACCESS_TOKEN_KEY = 'tyson_access_token';

export function getAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details?: unknown) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const accessToken = getAccessToken();
  if (accessToken && !headers.has('authorization')) headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('content-type') && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: 'include' });
  const payload = await response.json().catch(() => null) as ({ data?: T } & ApiErrorPayload) | null;
  if (!response.ok) {
    if (response.status === 401) setAccessToken(null);
    throw new ApiError(payload?.error?.message ?? 'Не удалось выполнить запрос.', response.status, payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.details);
  }
  if (!payload || !('data' in payload)) throw new ApiError('Сервер вернул некорректный ответ.', 502, 'INVALID_RESPONSE');
  return payload.data as T;
}

export async function apiRawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const accessToken = getAccessToken();
  if (accessToken && !headers.has('authorization')) headers.set('authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
    if (response.status === 401) setAccessToken(null);
    throw new ApiError(payload?.error?.message ?? 'Не удалось выполнить запрос.', response.status, payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.details);
  }
  return response;
}
