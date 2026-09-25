import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import { hostWithin, leftForOperator, type InjectFiles, type PageGuard, type TabPages } from '../tab-page';

const NAVIGATION_TIMEOUT_MS = 35_000;
const EXTRACTION_TIMEOUT_MS = 25_000;
const MAX_PRODUCTS = 100;
const CONTENT_FILES: InjectFiles = {
  isolated: ['content/sourcing/live-commerce-extractor.js', 'content/sourcing/live-commerce-content.js'],
};

export const SITE_VERIFICATION_REQUIRED = 'SITE_VERIFICATION_REQUIRED' as const;

/** 방송 탭이 있어도 되는 곳: 1688·도우인 호스트(확장 권한). 로그인은 타오바오·1688·도우인 로그인 화면이다. */
export const LIVE_COMMERCE_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['1688.com', 'douyin.com']),
  isLogin: (url) => hostWithin(url, ['login.taobao.com', 'login.1688.com', 'passport.1688.com', 'sso.douyin.com', 'passport.douyin.com'])
    || (hostWithin(url, ['douyin.com']) && /\/login/i.test(url.pathname)),
  loginMessage: '라이브 방송 사이트 로그인이 필요합니다. 열려 있는 탭에서 로그인한 뒤 다시 수집해 주세요.',
};

/** 1688·도우인 라이브 방송 페이지. 탭은 이 사이트가 방송 주소로 열고 닫는다. */
export const LIVE_COMMERCE_SITE: SiteDefinition = {
  name: 'live-commerce',
  origin: 'https://live.douyin.com',
  caller: { minIntervalMs: 0, displayName: '라이브 방송' },
};

export interface LiveCommerceCapture {
  source: '1688' | 'douyin';
  pageUrl: string;
  broadcast: Record<string, unknown>;
  products: Array<Record<string, unknown>>;
}

/** 로그인·검증 화면(옛 규칙): `/punish`, `action=captcha`, 경로의 verify·captcha·login. */
export function isLiveVerificationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.includes('/punish') || url.searchParams.get('action') === 'captcha' || /(?:verify|captcha|login)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * 방송 하나(KID-360): 방송 주소로 백그라운드 탭을 열고 다 그려지면 content script(`TRIGGER_LIVE_COMMERCE_EXTRACT`,
 * 없으면 주입)에게 방송과 상품(최대 100)을 묻는다. 검증·로그인 화면이면 탭을 남긴 채 `SITE_VERIFICATION_REQUIRED`.
 */
export function createLiveCommerceSite(tabs: TabPages) {
  return {
    async broadcast(pageUrl: string): Promise<LiveCommerceCapture> {
      const page = await tabs.open('about:blank');
      let keepOpen = false;
      try {
        const landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: isLiveVerificationUrl });
        if (isLiveVerificationUrl(landed)) {
          keepOpen = true;
          throw verification(landed);
        }
        let extracted: Partial<LiveCommerceCapture> & { ok?: boolean; error?: string; status?: string; verificationUrl?: string };
        try {
          extracted = await page.ask(
            { type: 'TRIGGER_LIVE_COMMERCE_EXTRACT' },
            { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: CONTENT_FILES, guard: LIVE_COMMERCE_PAGE_GUARD },
          );
        } catch (error) {
          // 로그인·예상 밖 주소면 운영자가 볼 수 있게 탭을 남긴다.
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        }
        if (extracted.status === 'verification_required') {
          keepOpen = true;
          throw verification(extracted.verificationUrl ?? landed);
        }
        if (!extracted.ok || !extracted.broadcast || !extracted.source || !extracted.pageUrl) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `방송 정보를 찾지 못했습니다(${extracted.error ?? '알 수 없음'}).`, { status: null, url: pageUrl });
        }
        return {
          source: extracted.source,
          pageUrl: extracted.pageUrl,
          broadcast: extracted.broadcast,
          products: (Array.isArray(extracted.products) ? extracted.products : []).slice(0, MAX_PRODUCTS),
        };
      } finally {
        if (!keepOpen) await page.close();
      }
    },
  };
}

export type LiveCommerceSite = ReturnType<typeof createLiveCommerceSite>;

function verification(url: string): RuntimeError {
  return new RuntimeError(SITE_VERIFICATION_REQUIRED, '방송 페이지가 로그인이나 검증을 요구합니다. 열려 있는 탭에서 처리한 뒤 다시 수집해 주세요.', { url });
}
