export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/u, '') ?? 'http://localhost:8787';

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
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: 'include' });
  const payload = await response.json().catch(() => null) as ({ data?: T } & ApiErrorPayload) | null;
  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? 'Не удалось выполнить запрос.', response.status, payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.details);
  }
  if (!payload || !('data' in payload)) throw new ApiError('Сервер вернул некорректный ответ.', 502, 'INVALID_RESPONSE');
  return payload.data as T;
}
