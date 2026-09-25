import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import { hostWithin, leftForOperator, type InjectFiles, type PageGuard, type TabPage, type TabPages } from '../tab-page';

const NAVIGATION_TIMEOUT_MS = 35_000;
const EXTRACTION_TIMEOUT_MS = 25_000;
/** Creative Center 트렌드 화면(영문). 지역은 화면에서 고르고, 잡은 API의 country_info에서 다시 읽는다. */
const BASE_URLS = {
  hashtag: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
  product: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
  keyword: 'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en',
} as const;
/** TikTok 탭이 있어도 되는 곳: ads.tiktok.com(확장 권한). 로그인은 passport·www 로그인 화면과 ads의 로그인 경로다. */
export const TIKTOK_CC_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['ads.tiktok.com']),
  isLogin: (url) => hostWithin(url, ['passport.tiktok.com']) || /(?:\/login|\/passport|\/signup)/i.test(url.pathname),
  loginMessage: 'TikTok 로그인이 필요합니다. 열려 있는 TikTok 탭에서 로그인한 뒤 다시 수집해 주세요.',
};
/** content script 둘(ISOLATED)과 API를 잡는 훅(MAIN). 훅은 manifest의 document_start 선언이 1차 경로다. */
const CONTENT_FILES: InjectFiles = {
  isolated: ['content/sourcing/tiktok-cc-extractor.js', 'content/sourcing/tiktok-cc-content.js'],
  main: ['content/sourcing/tiktok-cc-hook.js'],
};

/** TikTok Creative Center(실사이트 검증 안 됨 — 옛 수집기 주석 그대로). 탭은 이 사이트가 열고 닫는다. */
export const TIKTOK_CC_SITE: SiteDefinition = {
  name: 'tiktok',
  origin: 'https://ads.tiktok.com',
  caller: { minIntervalMs: 0, displayName: 'TikTok' },
};

export interface TiktokTarget {
  id: string;
  trendType: 'hashtag' | 'product' | 'keyword';
  url: string;
  sourceKeyword: string | null;
}

export interface TiktokTargetCapture {
  region: string | null;
  items: Array<Record<string, unknown>>;
}

/** 서버 plan의 대상 id(`hashtag`·`product`·`keyword:<키워드>`) → 방문할 화면. */
export function tiktokTargetFor(targetId: string): TiktokTarget {
  if (targetId === 'hashtag' || targetId === 'product') {
    return { id: targetId, trendType: targetId, url: BASE_URLS[targetId], sourceKeyword: null };
  }
  const keyword = targetId.startsWith('keyword:') ? targetId.slice('keyword:'.length) : targetId;
  return { id: targetId, trendType: 'keyword', url: `${BASE_URLS.keyword}?keyword=${encodeURIComponent(keyword)}`, sourceKeyword: keyword };
}

export function isTiktokBlockedUrl(value: string): boolean {
  try {
    return /(?:\/login|\/passport|\/signup)/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function sanitizeTiktokRegion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
}

/**
 * 대상 하나(KID-360): 탭을 그 화면으로 옮기고 content script(`TRIGGER_TIKTOK_CC_EXTRACT`, 없으면 주입)에게 잡은
 * 트렌드 항목을 묻는다. 로그인 화면이면 `SITE_LOGIN_REQUIRED`.
 */
export function createTiktokCcSite(tabs: TabPages) {
  let page: TabPage | null = null;
  let keepOpen = false;
  return {
    targetFor: tiktokTargetFor,
    async target(target: TiktokTarget, defaultRegion: string | null): Promise<TiktokTargetCapture> {
      page ??= await tabs.open('about:blank');
      try {
        return await readTarget(page, target, defaultRegion);
      } catch (error) {
        // 로그인·예상 밖 주소면 운영자가 볼 수 있게 탭을 남긴다.
        if (leftForOperator(error)) keepOpen = true;
        throw error;
      }
    },
    async close() {
      if (!keepOpen) await page?.close();
      page = null;
    },
  };

  async function readTarget(page: TabPage, target: TiktokTarget, defaultRegion: string | null): Promise<TiktokTargetCapture> {
    const landed = await page.navigate(target.url, { timeoutMs: NAVIGATION_TIMEOUT_MS, stopAt: isTiktokBlockedUrl, continueOnTimeout: true });
    if (isTiktokBlockedUrl(landed)) {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, 'TikTok 로그인 또는 지역 차단으로 수집할 수 없습니다.', { url: landed, target: target.id });
    }
    const extracted = await page.ask<{ ok?: boolean; error?: string; items?: unknown[]; region?: unknown }>(
      { type: 'TRIGGER_TIKTOK_CC_EXTRACT', trendType: target.trendType, sourceKeyword: target.sourceKeyword, defaultRegion },
      { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: CONTENT_FILES, guard: TIKTOK_CC_PAGE_GUARD },
    );
    if (!extracted.ok) {
      throw new RuntimeError(SITE_REQUEST_FAILED, `TikTok 트렌드 '${target.id}'를 읽지 못했습니다: ${extracted.error ?? '알 수 없음'}`, { status: null, target: target.id });
    }
    return {
      region: sanitizeTiktokRegion(extracted.region),
      items: (Array.isArray(extracted.items) ? extracted.items : [])
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'),
    };
  }
}

export type TiktokCcSite = ReturnType<typeof createTiktokCcSite>;
