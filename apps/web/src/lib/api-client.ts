import { API_BASE } from './api';
import { ApiError } from './api-error';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let code: string | null = null;
    let detail = `API error: ${res.status}`;
    try {
      const body = await res.json();
      code = body.error ?? null;
      detail = typeof body.message === 'string' ? body.message : body.detail ?? detail;
    } catch { /* text body or empty */ }
    throw new ApiError(res.status, code, detail);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  /** Response 객체 직접 반환 (blob, stream 등 non-JSON 응답용) */
  fetchRaw: (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${API_BASE}${path}`, init),
};
