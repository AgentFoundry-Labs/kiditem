import { describe, expect, it } from 'vitest';
import { createSiteHandles } from './site-handles';
import '../collectors/channels.wing_catalog_list';
import { wingCatalogDetailsCollector, type WingCatalogDetailsSite } from '../collectors/channels.wing_catalog_details';
import '../collectors/test.echo';

describe('entry/site-handles — kind의 수집기에 넘길 사이트 핸들', () => {
  const deps = {
    fetch: async () => Response.json({}),
    cookies: { get: async () => null },
    now: () => 0,
    sleep: async () => undefined,
  };

  it('Wing 카탈로그 kind에는 Wing 사이트(목록·상세·엑셀 API)를, 사이트 없는 kind에는 null을 준다', () => {
    const siteFor = createSiteHandles(deps);
    const wing = siteFor('channels.wing_catalog_list', { tabId: 3 }) as Record<string, unknown>;
    expect(Object.keys(wing).sort()).toEqual([
      'catalogExcelRequest', 'downloadCatalogExcel', 'pause', 'probeDeleted', 'productDetail', 'requestCatalogExcel', 'searchInventory',
    ]);
    expect(siteFor('test.echo', { tabId: null })).toBeNull();
    expect(siteFor('unknown.kind', { tabId: null })).toBeNull();
  });

  it('브라우저 자원에 넘길 사이트 표는 wing 하나다', async () => {
    const { ENTRY_SITES } = await import('./site-handles');
    expect(ENTRY_SITES).toEqual({ wing: { origin: 'https://wing.coupang.com' } });
  });

  describe('Wing 상세 수집 — 가짜 fetch로 사이트와 수집기를 함께', () => {
    const DETAIL = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product/';

    function run(respond: (url: string) => Response) {
      let clock = 0;
      const sent: string[] = [];
      const sleeps: number[] = [];
      const siteFor = createSiteHandles({
        fetch: async (url) => { sent.push(String(url)); return respond(String(url)); },
        cookies: { get: async () => ({ value: 'token' }) },
        now: () => clock,
        sleep: async (ms) => { sleeps.push(ms); clock += ms; },
      });
      const site = siteFor('channels.wing_catalog_details', { tabId: 1 }) as WingCatalogDetailsSite;
      const plan = { channelAccountId: '11111111-1111-4111-8111-111111111111', detailTargetProductIds: ['1', '2', '3'], absentProductIds: [] };
      const collected = (async () => {
        const chunks = [];
        for await (const chunk of wingCatalogDetailsCollector.collect(plan, site, { signal: new AbortController().signal, tabId: 1 })) chunks.push(chunk);
        return chunks;
      })();
      return { collected, sent, sleeps };
    }
    const detailOf = (id: string) => Response.json({ sellerProductId: Number(id), items: [{ sellerProductItemId: Number(id) * 10 }] });

    it('상세 한 건이 2초·6초 뒤에도 HTML이면 그 상품만 건너뛰고 나머지를 보낸다', async () => {
      const { collected, sent, sleeps } = run((url) => url === `${DETAIL}2`
        ? new Response('<html>\n  <title>잠시 후 다시</title></html>', { status: 200 })
        : detailOf(url.slice(DETAIL.length)));
      const chunks = await collected;
      expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as { externalProductId: string }).externalProductId))).toEqual(['1', '3']);
      expect(chunks.at(-1)?.progress).toMatchObject({
        detailsDone: 2,
        detailsMissing: [{ externalProductId: '2', reason: 'not_json', bodyHead: '<html> <title>잠시 후 다시</title></html>' }],
      });
      expect(sent.filter((url) => url === `${DETAIL}2`)).toHaveLength(3);
      expect(sleeps.filter((ms) => ms === 6_000)).toHaveLength(1);
    });

    it('로그인이 풀리면(401) 다시 묻지 않고 SITE_LOGIN_REQUIRED로 멈춘다', async () => {
      const { collected, sent } = run(() => new Response('', { status: 401 }));
      await expect(collected).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
      expect(sent).toHaveLength(1);
    });
  });
});
