import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import type { InjectFiles, TabPages } from '../tab-page';
import { allowedSupplierUrl, parseDescriptionHtml } from './description';
import { registerSite } from '../registry';

/** 추출 전체 상한(옛 수집기와 같은 20초 — 수집 경로를 옮기면서 시간 규칙은 바꾸지 않는다). */
const EXTRACTION_TIMEOUT_MS = 20_000;
const TRIGGER_TIMEOUT_MS = 5_000;
const EXTRACTOR_FILES = [
  'content/sourcing/extractors/common.js',
  'content/sourcing/extractors/alibaba.js',
  'content/sourcing/extractors/1688.js',
  'content/sourcing/content.js',
];

export const PRODUCT_PAGE_MOVED = 'PRODUCT_PAGE_MOVED' as const;
export const PRODUCT_EXTRACTION_TIMEOUT = 'PRODUCT_EXTRACTION_TIMEOUT' as const;

/** 운영자가 연 1688·Alibaba 상품 탭. 탭은 운영자 것이라 열지도 닫지도 않는다. */
export const PRODUCT_PAGE_SITE: SiteDefinition = {
  name: 'product-page',
  origin: 'https://detail.1688.com',
  caller: { minIntervalMs: 0, displayName: '1688·Alibaba 상품' },
};

export interface ProductDocument {
  product: Record<string, unknown> & { source_url: string };
  description?: Record<string, unknown>;
  hadDescription: boolean;
}

/** 호스트마다 페이지 변수를 읽는 브리지(MAIN world) — content script가 먼저 듣고 있어야 해서 뒤에 넣는다. */
export function productPageInjection(url: string): InjectFiles {
  const host = new URL(url).hostname;
  const main = host.endsWith('1688.com')
    ? ['content/sourcing/extractors/1688-bridge.js']
    : host.endsWith('alibaba.com') ? ['content/sourcing/extractors/page-bridge.js'] : [];
  return { isolated: EXTRACTOR_FILES, main };
}

/**
 * 현재 탭의 상품 추출(KID-360): content script(`content.js`)에게 `TRIGGER_EXTRACT`를 보내고(없으면 추출기·브리지 주입),
 * 탭이 보내는 `PRODUCT_DATA`·`DESCRIPTION_DATA`·`EXTRACTION_COMPLETE`를 이 추출의 표지로 모은다. 1688 상세면 설명 본문을
 * 상세 주소에서 따로 읽어 상품에 붙인다(옛 `enrichProductData`).
 */
export function createProductPageSite(tabs: TabPages, tabId: number, deps: { randomId(): string }) {
  return {
    async extract(sourceUrl: string): Promise<ProductDocument> {
      const page = tabs.attach(tabId);
      const current = await page.currentUrl();
      if (current !== sourceUrl) {
        throw new RuntimeError(PRODUCT_PAGE_MOVED, '수집을 시작한 뒤 탭 주소가 바뀌었습니다. 상품 페이지에서 다시 수집해 주세요.', { url: current });
      }
      const marker = deps.randomId();
      let product: Record<string, unknown> | null = null;
      let description: Record<string, unknown> | undefined;
      let settle!: (document: ProductDocument | RuntimeError) => void;
      const settled = new Promise<ProductDocument | RuntimeError>((resolve) => { settle = resolve; });
      const stop = page.listen((message) => {
        if (message.attemptId !== marker) return;
        if (message.type === 'PRODUCT_DATA' && !product && isRecord(message.data)) {
          product = message.data;
          if (product.page_type === 'search') settle({ product: withSourceUrl(product, sourceUrl), hadDescription: false });
        } else if (message.type === 'DESCRIPTION_DATA' && isRecord(message.data)) {
          description = message.data;
        } else if (message.type === 'EXTRACTION_COMPLETE' && product) {
          const hadDescription = message.hadDescription === true;
          if (hadDescription !== Boolean(description)) {
            settle(new RuntimeError(SITE_REQUEST_FAILED, '상품 설명 추출 완료를 확인할 수 없습니다.', { status: null, url: sourceUrl }));
          } else {
            settle({ product: withSourceUrl(product, sourceUrl), ...(description ? { description } : {}), hadDescription });
          }
        }
      });
      const timer = setTimeout(() => settle(new RuntimeError(PRODUCT_EXTRACTION_TIMEOUT, '상품 추출 시간이 초과되었습니다. 페이지를 새로고침한 뒤 다시 수집해 주세요.', { url: sourceUrl })), EXTRACTION_TIMEOUT_MS);
      try {
        const started = await page.ask({ type: 'TRIGGER_EXTRACT', attemptId: marker }, { timeoutMs: TRIGGER_TIMEOUT_MS, inject: productPageInjection(sourceUrl) });
        if (started.ok === false) {
          throw new RuntimeError(SITE_REQUEST_FAILED, '페이지를 새로고침한 뒤 다시 수집해 주세요.', { status: null, url: sourceUrl, reason: started.error });
        }
        const result = await settled;
        if (result instanceof RuntimeError) throw result;
        await enrich(result.product);
        return result;
      } finally {
        clearTimeout(timer);
        stop();
      }
    },
  };

  async function enrich(product: Record<string, unknown>): Promise<void> {
    const detailUrl = product.source_platform === '1688' ? allowedSupplierUrl(product._detail_url) : null;
    if (!detailUrl) return;
    const html = await tabs.fetchText(detailUrl);
    const content = html ? parseDescriptionHtml(html) : null;
    if (content) Object.assign(product, content);
  }
}

export type ProductPageSite = ReturnType<typeof createProductPageSite>;

function withSourceUrl(product: Record<string, unknown>, sourceUrl: string): ProductDocument['product'] {
  return { ...product, source_url: typeof product.source_url === 'string' ? product.source_url : sourceUrl };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const PRODUCT_TAB_REQUIRED = 'PRODUCT_TAB_REQUIRED' as const;

/**
 * 상품 확장은 운영자 탭이 있어야 한다. 팝업 입구(`entry/sourcing-product-collect`)만 탭을 임대로 묶어 부른다 —
 * 탭 없이 오면(웹에서 시작 등) 수집하지 않고 멈춘다.
 */
registerSite({
  name: PRODUCT_PAGE_SITE.name,
  create: (deps, lease) =>
    lease.tabId !== null
      ? createProductPageSite(deps.tabs, lease.tabId, { randomId: deps.randomId })
      : {
          extract: async () => {
            throw new RuntimeError(PRODUCT_TAB_REQUIRED, '상품 수집은 확장 팝업의 [현재 상품 수집]에서 시작해 주세요.');
          },
        },
});
