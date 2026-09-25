import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import type { InjectFiles, TabPage, TabPages } from '../tab-page';

const SEARCH_ORIGIN = 'https://s.1688.com';
const NAVIGATION_TIMEOUT_MS = 30_000;
const EXTRACTION_TIMEOUT_MS = 20_000;
const MAX_RESULTS_PER_KEYWORD = 20;

/** 1688 페이지를 읽는 content script(옛 manifest 항목과 같은 파일; 이제 필요할 때만 주입한다). */
export const ALIBABA_CONTENT_FILES: InjectFiles = {
  isolated: [
    'content/sourcing/extractors/common.js',
    'content/sourcing/extractors/alibaba.js',
    'content/sourcing/extractors/1688.js',
    'content/sourcing/content.js',
  ],
};

export const SITE_VERIFICATION_REQUIRED = 'SITE_VERIFICATION_REQUIRED' as const;

/** 1688 검색(s.1688.com offer_search). 탭은 이 사이트가 열고 닫는다(잠금 키 `resource:ali1688:*`는 탭을 잡지 않는다). */
export const ALIBABA_1688_SITE: SiteDefinition = {
  name: 'ali1688',
  origin: SEARCH_ORIGIN,
  caller: { minIntervalMs: 0, displayName: '1688' },
};

export interface Offer1688 {
  offerId: string;
  [field: string]: unknown;
}

export function build1688SearchUrl(keyword: string): string {
  return `${SEARCH_ORIGIN}/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}&charset=utf8`;
}

/** 1688 슬라이더·차단 화면(옛 규칙): 경로에 `/punish`, 또는 `action=captcha`. */
export function is1688VerificationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.includes('/punish') || url.searchParams.get('action') === 'captcha';
  } catch {
    return false;
  }
}

/**
 * 1688 키워드 검색 결과 읽기(KID-360). 백그라운드 탭 하나를 키워드마다 옮겨 가며 content script(`content.js`의
 * `TRIGGER_1688_TREND_EXTRACT`)에게 상위 20개를 묻는다. 슬라이더 검증이 뜨면 탭을 열어 둔 채
 * `SITE_VERIFICATION_REQUIRED`로 멈춘다 — 운영자가 풀고 다시 수집한다.
 */
export function create1688SearchSite(tabs: TabPages) {
  let page: TabPage | null = null;
  let keepOpen = false;
  return {
    async offers(keyword: string): Promise<Offer1688[]> {
      page ??= await tabs.open('about:blank');
      const landed = await page.navigate(build1688SearchUrl(keyword), { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: is1688VerificationUrl });
      if (is1688VerificationUrl(landed)) throw verification(landed, keyword, () => { keepOpen = true; });
      const extracted = await page.ask<{ ok: boolean; items?: unknown[]; error?: string; status?: string; verificationUrl?: string }>(
        { type: 'TRIGGER_1688_TREND_EXTRACT', maxResults: MAX_RESULTS_PER_KEYWORD },
        { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: ALIBABA_CONTENT_FILES },
      );
      if (extracted.status === 'verification_required') {
        throw verification(extracted.verificationUrl ?? landed, keyword, () => { keepOpen = true; });
      }
      if (!extracted.ok) {
        throw new RuntimeError(SITE_REQUEST_FAILED, `1688 검색 '${keyword}' 결과를 읽지 못했습니다: ${extracted.error ?? '알 수 없음'}`, { status: null, keyword });
      }
      return (Array.isArray(extracted.items) ? extracted.items : [])
        .filter((item): item is Offer1688 => typeof (item as Offer1688)?.offerId === 'string' && (item as Offer1688).offerId.length > 0)
        .slice(0, MAX_RESULTS_PER_KEYWORD);
    },
    /** 수집이 끝나면 탭을 닫는다. 검증 화면에서 멈췄으면 운영자가 풀 수 있게 남긴다. */
    async close() {
      if (page && !keepOpen) await page.close();
      page = null;
    },
  };
}

export type Alibaba1688SearchSite = ReturnType<typeof create1688SearchSite>;

function verification(url: string, keyword: string, keep: () => void): RuntimeError {
  keep();
  return new RuntimeError(SITE_VERIFICATION_REQUIRED, '1688이 슬라이더 검증을 요구합니다. 열려 있는 1688 탭에서 검증한 뒤 다시 수집해 주세요.', { url, keyword });
}
