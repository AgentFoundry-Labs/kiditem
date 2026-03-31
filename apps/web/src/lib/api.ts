export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// 회사 ID 캐시 — 앱 시작 시 1회 조회 후 재사용
let _companyIdCache: string | null = null;
let _companyIdPromise: Promise<string> | null = null;

export async function getCompanyId(): Promise<string> {
  if (_companyIdCache) return _companyIdCache;
  if (_companyIdPromise) return _companyIdPromise;

  _companyIdPromise = fetch(`${API_BASE}/api/companies`)
    .then((res) => res.json())
    .then((items: { id: string }[]) => {
      if (!items.length) throw new Error('No company found');
      _companyIdCache = items[0].id;
      return _companyIdCache!;
    })
    .finally(() => { _companyIdPromise = null; });

  return _companyIdPromise;
}
