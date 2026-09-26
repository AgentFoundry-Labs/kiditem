import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { hostWithin, leftForOperator, waitForOperator, type AttentionListener, type InjectFiles, type PageGuard, type TabPages } from '../tab-page';
import { registerSite } from '../registry';

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

/** 검증 화면(옛 규칙): `/punish`, `action=captcha`, 경로의 verify·captcha. 운영자가 통과하길 기다린다. */
export function isLiveVerificationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname.includes('/punish') || url.searchParams.get('action') === 'captcha' || /(?:verify|captcha)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** 로그인 화면: 사이트 로그인 호스트나 경로의 login. 기다리지 않는다(세션 문제). */
export function isLiveLoginUrl(value: string): boolean {
  try {
    return LIVE_COMMERCE_PAGE_GUARD.isLogin(new URL(value)) || /\/login/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/** 한 방송에서 검증을 통과한 뒤에도 다시 걸리면 몇 번까지 기다리나. */
const MAX_VERIFICATION_ROUNDS = 5;

/**
 * 방송 하나(KID-360): 방송 주소로 백그라운드 탭을 열고 다 그려지면 content script(`TRIGGER_LIVE_COMMERCE_EXTRACT`,
 * 없으면 주입)에게 방송과 상품(최대 100)을 묻는다. 검증·로그인 화면이면 탭을 남긴 채 `SITE_VERIFICATION_REQUIRED`.
 */
export function createLiveCommerceSite(tabs: TabPages) {
  return {
    async broadcast(pageUrl: string, options: { onAttention?: AttentionListener } = {}): Promise<LiveCommerceCapture> {
      const page = await tabs.open('about:blank');
      let keepOpen = false;
      try {
        const stopAt = (url: string) => isLiveVerificationUrl(url) || isLiveLoginUrl(url);
        let landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt });
        // 검증 화면이면 운영자를 기다렸다가 같은 방송을 다시 연다(KID-355 QA). 로그인은 기다리지 않는다.
        for (let round = 1; isLiveVerificationUrl(landed) && !isLiveLoginUrl(landed); round += 1) {
          const cleared = round <= MAX_VERIFICATION_ROUNDS
            && await waitForOperator(page, isLiveVerificationUrl, { kind: 'verification', site: '라이브 방송', label: '방송' }, options.onAttention);
          if (!cleared) {
            keepOpen = true;
            throw verification(landed);
          }
          landed = await page.navigate(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt });
        }
        if (isLiveLoginUrl(landed)) {
          keepOpen = true;
          throw new RuntimeError(SITE_LOGIN_REQUIRED, LIVE_COMMERCE_PAGE_GUARD.loginMessage, { url: landed });
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

registerSite({ name: LIVE_COMMERCE_SITE.name, create: (deps) => createLiveCommerceSite(deps.tabs) });
