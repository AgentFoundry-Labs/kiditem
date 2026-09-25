import { describe, expect, it } from 'vitest';
import { createSiteHandles } from './site-handles';
import '../collectors/channels.wing_catalog_list';
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
});
