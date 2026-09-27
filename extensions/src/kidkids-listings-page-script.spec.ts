// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kidkids-listings.js?raw';

// 키드키즈 등록 상품 목록 페이지 스크립트(ISOLATED)를 실제 파일 그대로 돌린다. 가짜는 페이지 경계(fetch·location·EUC-KR)뿐이다.
const ORIGIN = 'https://partner.kidkids.net';
const PLAN = { mallKey: 'kidkids', sourceOrigin: ORIGIN, pageSize: 20000 };

function load(listHtml: string, response: { status?: number; contentType?: string } = {}) {
  const isolated: Record<string, unknown> = {};
  const status = response.status ?? 200;
  const fetch = async (path: string) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': response.contentType ?? 'text/html' }),
    url: `${ORIGIN}${path}`,
    arrayBuffer: async () => new TextEncoder().encode(listHtml).buffer,
  });
  // 테스트 본문은 UTF-8 바이트다 — 어느 문자셋 이름이 와도 UTF-8로 풀고 이름만 적는다.
  const labels: string[] = [];
  class Utf8AsEucKr {
    constructor(label = 'utf-8') {
      labels.push(String(label).toLowerCase());
    }
    decode(buffer: ArrayBuffer) {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
  new Function('globalThis', 'fetch', 'location', 'TextDecoder', source)(isolated, fetch, new URL(`${ORIGIN}/sales/goods_list_renewal.htm`), Utf8AsEucKr);
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Record<string, unknown>>>)['kidkids.listings']!;
  return Object.assign(handler, { labels });
}

describe('kidkids listings page script', () => {
  it('목록 대신 서비스 점검 안내면 형식 변경(counter)이 아니라 mall_maintenance(KID-380 D3)', async () => {
    const handler = load('<html><body><h2>서비스 점검 안내</h2><p>시스템 점검 중입니다.</p></body></html>');
    await expect(handler({ plan: PLAN })).resolves.toEqual({ success: false, errorCode: 'mall_maintenance' });
  });

  it('점검 안내가 아닌데 건수가 없으면 그대로 형식 변경이다', async () => {
    const handler = load('<html><body><p>상품 목록</p></body></html>', { contentType: 'text/html; charset=UTF-8' });
    await expect(handler({ plan: PLAN })).resolves.toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'counter' });
    // 응답 머리의 문자셋을 따르고(재QA 3 D2 — 2xx에도 utf-8), 머리에 없을 때만 EUC-KR.
    expect(handler.labels).toEqual(['utf-8']);
    const bare = load('<html><body><p>상품 목록</p></body></html>');
    await bare({ plan: PLAN });
    expect(bare.labels).toEqual(['euc-kr']);
  });

  it('목록 화면이 404 UTF-8 점검 화면이면 mall_maintenance, 다른 HTTP 오류는 mall_network_failed(실기기 R2)', async () => {
    const maintenance = load('<html><body><h1>서비스 점검 안내</h1></body></html>', { status: 404, contentType: 'text/html; charset=UTF-8' });
    await expect(maintenance({ plan: PLAN })).resolves.toEqual({ success: false, errorCode: 'mall_maintenance' });
    expect(maintenance.labels).toEqual(['utf-8']);
    await expect(load('<html><body>Bad Gateway</body></html>', { status: 502 })({ plan: PLAN }))
      .resolves.toEqual({ success: false, errorCode: 'mall_network_failed' });
  });
});
