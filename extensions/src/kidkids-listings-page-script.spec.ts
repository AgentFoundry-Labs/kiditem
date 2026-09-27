// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kidkids-listings.js?raw';

// 키드키즈 등록 상품 목록 페이지 스크립트(ISOLATED)를 실제 파일 그대로 돌린다. 가짜는 페이지 경계(fetch·location·EUC-KR)뿐이다.
const ORIGIN = 'https://partner.kidkids.net';
const PLAN = { mallKey: 'kidkids', sourceOrigin: ORIGIN, pageSize: 20000 };

function load(listHtml: string) {
  const isolated: Record<string, unknown> = {};
  const fetch = async (path: string) => ({
    ok: true,
    url: `${ORIGIN}${path}`,
    arrayBuffer: async () => new TextEncoder().encode(listHtml).buffer,
  });
  class Utf8AsEucKr {
    decode(buffer: ArrayBuffer) {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
  new Function('globalThis', 'fetch', 'location', 'TextDecoder', source)(isolated, fetch, new URL(`${ORIGIN}/sales/goods_list_renewal.htm`), Utf8AsEucKr);
  return (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Record<string, unknown>>>)['kidkids.listings']!;
}

describe('kidkids listings page script', () => {
  it('목록 대신 서비스 점검 안내면 형식 변경(counter)이 아니라 mall_maintenance(KID-380 D3)', async () => {
    const handler = load('<html><body><h2>서비스 점검 안내</h2><p>시스템 점검 중입니다.</p></body></html>');
    await expect(handler({ plan: PLAN })).resolves.toEqual({ success: false, errorCode: 'mall_maintenance' });
  });

  it('점검 안내가 아닌데 건수가 없으면 그대로 형식 변경이다', async () => {
    const handler = load('<html><body><p>상품 목록</p></body></html>');
    await expect(handler({ plan: PLAN })).resolves.toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'counter' });
  });
});
