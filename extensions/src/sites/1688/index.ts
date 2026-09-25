import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import { hostWithin, leftForOperator, waitForOperator, type AttentionListener, type InjectFiles, type PageGuard, type TabPage, type TabPages } from '../tab-page';

const SEARCH_ORIGIN = 'https://s.1688.com';
const NAVIGATION_TIMEOUT_MS = 30_000;
const EXTRACTION_TIMEOUT_MS = 20_000;
const MAX_RESULTS_PER_KEYWORD = 20;
/** 한 키워드에서 검증을 통과한 뒤에도 다시 걸리면 몇 번까지 기다리나. */
const MAX_VERIFICATION_ROUNDS = 5;

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

/** 1688 탭이 있어도 되는 곳: 1688 호스트(로그인 화면 제외). 로그인은 1688·타오바오 통합 로그인이다. */
export const ALIBABA_1688_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['1688.com']),
  isLogin: (url) => hostWithin(url, ['login.taobao.com', 'login.1688.com', 'passport.1688.com', 'passport.taobao.com']),
  loginMessage: '1688 로그인이 필요합니다. 열려 있는 1688 탭에서 로그인한 뒤 다시 수집해 주세요.',
};

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

/** 1688 슬라이더·차단 화면(옛 규칙): 경로에 `/punish`·`/_____tmd_____/`, 또는 `action=captcha`. */
export function is1688VerificationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.includes('/punish') || url.pathname.includes('/_____tmd_____/') || url.searchParams.get('action') === 'captcha';
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
    /**
     * 키워드 하나. 슬라이더 검증이 뜨면 실패하지 않고 운영자를 기다렸다가(`onAttention`으로 알림) 같은 키워드를 다시
     * 시도한다 — 실행과 이미 올린 청크는 그대로다(KID-355 QA). 10분 안에 통과하지 않으면 `SITE_VERIFICATION_REQUIRED`.
     */
    async offers(keyword: string, options: { onAttention?: AttentionListener } = {}): Promise<Offer1688[]> {
      page ??= await tabs.open('about:blank');
      const current = page;
      const attention = { kind: 'verification' as const, site: '1688', label: keyword };
      const waitOrFail = async (url: string) => {
        if (await waitForOperator(current, is1688VerificationUrl, attention, options.onAttention)) return;
        throw verification(url, keyword, () => { keepOpen = true; });
      };
      for (let round = 1; ; round += 1) {
        const landed = await current.navigate(build1688SearchUrl(keyword), { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: is1688VerificationUrl, continueOnTimeout: true });
        if (is1688VerificationUrl(landed)) {
          if (round > MAX_VERIFICATION_ROUNDS) throw verification(landed, keyword, () => { keepOpen = true; });
          await waitOrFail(landed);
          continue;
        }
        let extracted: { ok: boolean; items?: unknown[]; error?: string; status?: string; verificationUrl?: string };
        try {
          extracted = await current.ask(
            { type: 'TRIGGER_1688_TREND_EXTRACT', maxResults: MAX_RESULTS_PER_KEYWORD },
            { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: ALIBABA_CONTENT_FILES, guard: ALIBABA_1688_PAGE_GUARD },
          );
        } catch (error) {
          // 로그인·예상 밖 주소면 운영자가 볼 수 있게 탭을 남긴다(로그인은 기다리지 않는다 — 세션 문제다).
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        }
        if (extracted.status === 'verification_required') {
          const here = await current.currentUrl().catch(() => extracted.verificationUrl ?? landed);
          if (round > MAX_VERIFICATION_ROUNDS || !is1688VerificationUrl(here)) {
            throw verification(extracted.verificationUrl ?? landed, keyword, () => { keepOpen = true; });
          }
          await waitOrFail(here);
          continue;
        }
        if (!extracted.ok) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `1688 검색 '${keyword}' 결과를 읽지 못했습니다: ${extracted.error ?? '알 수 없음'}`, { status: null, keyword });
        }
        return (Array.isArray(extracted.items) ? extracted.items : [])
          .filter((item): item is Offer1688 => typeof (item as Offer1688)?.offerId === 'string' && (item as Offer1688).offerId.length > 0)
          .slice(0, MAX_RESULTS_PER_KEYWORD);
      }
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
