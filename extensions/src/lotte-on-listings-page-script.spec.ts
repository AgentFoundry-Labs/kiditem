import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/lotte-on-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 롯데ON 등록 상품 목록 처리기(MAIN world, 옛 `readLotteonListings` 이식, KID-381). 판매자센터 화면 함수로 요청 머리를 붙여 우리
// 거래처로 좁힌 상품 조회를 읽는다 — 토큰은 밖으로 나가지 않는다. 픽스처는 옛 스위트 그대로다.
const LOTTE = 'https://store.lotteon.com';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'lotte-on',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: LOTTE,
  pageSize: 100,
};
const DATA = Array.from({ length: 3 }, (_, index) => ({ spdNo: `LO21000000${index}`, trNo: '0012345', spdNm: `상품 ${index}`, slStatCd: ['SALE', 'SOUT', 'END'][index], slPrc: 3000 }));
const OURS = { getTrGrpCd: () => 'SR', getTrNo: () => '0012345' };

function lotte(user: unknown, answer: { total: number; rows: unknown[] }, href = `${LOTTE}/cm/main/index_SO.wsp`) {
  const sent: unknown[] = [];
  class FakeXhr {
    status = 0;
    responseText = '';
    onload: () => void = () => undefined;
    open() {}
    setRequestHeader() {}
    send(body: string) {
      sent.push(JSON.parse(body));
      this.status = 200;
      this.responseText = JSON.stringify({ returnCode: 'SUCCESS', totalCount: answer.total, data: answer.rows });
      setTimeout(() => this.onload(), 0);
    }
  }
  const read = listingsPageCall(source, 'lotte-on.listings', {
    gcm: { _sbm_setRequestHeader: (xhr: FakeXhr) => xhr.setRequestHeader(), user },
    sessionStorage: { getItem: (key: string) => (key === 'AuthToken' ? 'secret' : null) },
    XMLHttpRequest: FakeXhr,
    location: { href },
  });
  return { read: () => read(PLAN), sent };
}

describe('lotte-on listings page script (MAIN)', () => {
  it('우리 거래처로 좁혀 상품 조회를 읽고, 판매상태 코드를 몰 글자로 넘긴다(토큰은 결과에 없다)', async () => {
    const { read, sent } = lotte(OURS, { total: DATA.length, rows: DATA });
    const result = await read();
    expect(result.success).toBe(true);
    // 우리 거래처로 좁힌다 — 거래처 없이 부르면 롯데ON 전체 상품이 온다.
    expect(sent).toEqual([{ trGrpCd: 'SR', trNo: '0012345', pageNo: 1, rowsPerPage: 100 }]);
    expect(result.snapshot.rows.map((row: { mallProductCode: string; statusWords: string[] }) => [row.mallProductCode, row.statusWords[0]])).toEqual([
      ['LO210000000', '판매중'], ['LO210000001', '품절'], ['LO210000002', '판매종료'],
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.snapshot.collection.totalRecords).toBe(3);
  });

  it('거래처 정보가 없는 탭 · 로그인 화면은 읽지 않고 로그인이 필요하다', async () => {
    const noUser = lotte({ getTrNo: () => { throw new Error('no user'); } }, { total: 3, rows: DATA });
    expect(await noUser.read()).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect(noUser.sent).toHaveLength(0);
    const loginPage = lotte(OURS, { total: 3, rows: DATA }, `${LOTTE}/cm/main/login_SO.wsp`);
    expect(await loginPage.read()).toEqual({ success: false, errorCode: 'mall_login_required' });
  });

  it('좁혔는데도 몇만 건이거나 남의 거래처 줄이 오면 멈춘다', async () => {
    expect(await lotte(OURS, { total: 164_084_736, rows: DATA }).read()).toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'row_limit' });
    expect(await lotte(OURS, { total: 1, rows: [{ ...DATA[0], trNo: '9999999' }] }).read())
      .toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'trade_scope' });
  });
});
