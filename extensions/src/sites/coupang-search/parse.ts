/**
 * 쿠팡 검색 페이지 근거 → 추천 키워드·상품명 토큰(KID-360). 옛 `executeKeywordSuggestionPage`의 규칙을 옮겼다:
 * 자동완성 JSON에서 키워드 모양 값을 모으고, 오류 봉투는 제공자 오류로, 검색 화면의 연관 링크는 보조 근거로 본다.
 */
export interface CoupangSearchEvidence {
  autocomplete: { status: number; contentType: string; text: string; error?: string } | null;
  links: Array<{ text: string; href: string }>;
  productNames: string[];
}

export interface CoupangSuggestionItem {
  rank: number;
  keyword: string;
  source: 'coupang-autocomplete' | 'coupang-search-dom';
}

export type CoupangSuggestionResult =
  | { ok: true; items: CoupangSuggestionItem[]; productNameTokens: Array<{ keyword: string; count: number }>; warnings: string[] }
  | { ok: false; reason: 'provider_denied' | 'rate_limited' | 'no_evidence'; message: string; warnings: string[] };

const PROVIDER_ATTENTION = /access\s*denied|unauthori[sz]ed|forbidden|too\s*many\s*requests|로그인|인증|접근\s*거부/i;
const STOP_WORDS = new Set(['쿠팡', '로켓', '로켓배송', '무료배송', '무료', '배송', '정품', '국내', '당일', '오늘', '새상품', '상품', '구매', '할인', '특가', '옵션', '색상', '랜덤']);

export function parseCoupangSearchEvidence(evidence: CoupangSearchEvidence, seed: string, maxResults: number, origin = 'https://www.coupang.com'): CoupangSuggestionResult {
  const warnings: string[] = [];
  const candidates: Array<{ keyword: string; source: CoupangSuggestionItem['source'] }> = [];
  let structuredResponse = false;
  let domEvidence = false;
  let providerError: { message: string; reason: 'provider_denied' | 'rate_limited' } | null = null;

  const add = (value: unknown, source: CoupangSuggestionItem['source']) => {
    if (typeof value !== 'string') return;
    const keyword = value.replace(/\s+/g, ' ').trim();
    if (usableKeyword(keyword, seed)) candidates.push({ keyword, source });
  };
  const walk = (value: unknown) => {
    if (typeof value === 'string') return add(value, 'coupang-autocomplete');
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (/keyword|query|term|suggest|name|label|word/i.test(key) && typeof nested === 'string') add(nested, 'coupang-autocomplete');
      else walk(nested);
    }
  };

  const autocomplete = evidence.autocomplete;
  if (autocomplete?.error) warnings.push(autocomplete.error);
  if (autocomplete && autocomplete.status !== 0 && (autocomplete.status < 200 || autocomplete.status >= 300)) {
    warnings.push(`쿠팡 자동완성 호출 실패 (${autocomplete.status})`);
    if ([401, 403, 429].includes(autocomplete.status)) {
      providerError = autocomplete.status === 429
        ? { reason: 'rate_limited', message: '쿠팡 자동완성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
        : { reason: 'provider_denied', message: '쿠팡 자동완성 인증이 필요합니다. 쿠팡 탭에서 다시 로그인해주세요.' };
    }
  }
  const text = autocomplete?.text.trim() ?? '';
  if (text && (autocomplete?.contentType.includes('application/json') || /^[[{]/.test(text))) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (isErrorEnvelope(parsed)) {
          const message = errorEnvelopeMessage(parsed);
          providerError ??= { reason: 'provider_denied', message };
        } else {
          walk(parsed);
          structuredResponse = hasSuggestionCollection(parsed);
        }
      } else {
        warnings.push('쿠팡 자동완성 JSON 구조가 유효하지 않습니다');
      }
    } catch {
      warnings.push('쿠팡 자동완성 JSON 파싱 실패');
    }
  } else if (text) {
    warnings.push('쿠팡 자동완성 응답이 JSON이 아닙니다');
  }

  const beforeDom = candidates.length;
  for (const link of evidence.links) {
    add(link.text, 'coupang-search-dom');
    try {
      const parsed = new URL(link.href, origin);
      add(parsed.searchParams.get('q') || parsed.searchParams.get('keyword') || '', 'coupang-search-dom');
    } catch {
      // 링크 주소가 깨졌으면 글자만 쓴다.
    }
  }
  if (candidates.length > beforeDom) domEvidence = true;
  const productNames: string[] = [];
  for (const raw of evidence.productNames) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < 4 || name.length > 180 || /장바구니|구매|광고|무료배송|로켓배송만 보기/.test(name)) continue;
    productNames.push(name);
    domEvidence = true;
  }

  if (providerError) return { ok: false, ...providerError, warnings };
  if (!structuredResponse && !domEvidence) {
    return { ok: false, reason: 'no_evidence', message: '쿠팡 키워드 응답에서 사용할 수 있는 검색 근거를 찾지 못했습니다.', warnings };
  }

  const seen = new Set<string>();
  const items: CoupangSuggestionItem[] = [];
  for (const candidate of candidates) {
    const key = candidate.keyword.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ rank: items.length + 1, keyword: candidate.keyword, source: candidate.source });
    if (items.length >= maxResults) break;
  }
  return { ok: true, items, productNameTokens: countTokens(productNames, maxResults), warnings };
}

function usableKeyword(value: string, seed: string): boolean {
  if (value.length < 2 || value.length > 40) return false;
  if (/https?:\/\//i.test(value) || /^[\d\s,.-]+$/.test(value) || /[₩원%]/.test(value)) return false;
  if (['검색', '바로가기', '쿠팡', '로켓배송', '무료배송'].includes(value)) return false;
  const compact = value.replace(/\s+/g, '').toLowerCase();
  return compact.length > 1 && compact !== seed.replace(/\s+/g, '').toLowerCase();
}

function isErrorEnvelope(value: object): boolean {
  if (Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.success === false || record.ok === false) return true;
  for (const key of ['error', 'errors', 'errorCode', 'error_code']) {
    const nested = record[key];
    if (key in record && nested !== null && nested !== undefined && String(nested).trim()) return true;
  }
  if (record.code !== undefined && record.code !== null && record.code !== 0 && record.code !== '0' && String(record.code).trim() !== '') return true;
  return typeof record.message === 'string' && PROVIDER_ATTENTION.test(record.message);
}

function errorEnvelopeMessage(value: object): string {
  const record = value as Record<string, unknown>;
  for (const key of ['error', 'errors', 'message', 'errorCode', 'error_code', 'code']) {
    const nested = record[key];
    if (nested !== null && nested !== undefined && String(nested).trim()) return String(nested);
  }
  return '쿠팡 자동완성 응답에서 오류를 반환했습니다.';
}

function hasSuggestionCollection(value: unknown, depth = 0): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== 'object' || depth > 3) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (!/suggest|keyword|query|term|result|item|product|data|list/i.test(key)) continue;
    if (Array.isArray(nested) || (typeof nested === 'string' && nested.trim())) return true;
    if (nested && typeof nested === 'object' && hasSuggestionCollection(nested, depth + 1)) return true;
  }
  return false;
}

function countTokens(productNames: string[], maxResults: number): Array<{ keyword: string; count: number }> {
  const counts = new Map<string, number>();
  for (const name of productNames) {
    const tokens = new Set(name
      .replace(/[()[\]{}"'`~!@#$%^&*_+=|\\:;,.<>/?·•]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && token.length <= 20)
      .filter((token) => !/^[\d개입묶음세트]+$/.test(token))
      .filter((token) => !STOP_WORDS.has(token)));
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, 'ko'))
    .slice(0, maxResults);
}
