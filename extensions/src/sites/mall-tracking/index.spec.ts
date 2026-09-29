import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createKidkidsSite, KIDKIDS_ORDER_URL } from '../kidkids';
import { createOnchSite, ONCH_ORDER_URL } from '../onch';
import { courierName } from './couriers';
import { MALL_TRACKING_SITE } from './index';

// 몰 송장 업로드 사이트(KID-366 wave8b)를 가짜 탭으로 돌린다. 처리기 답은 페이지 스크립트 스펙이 잠근 모양 그대로다.
const ROWS = [
  { orderNo: 'O-1', trackingNumber: 'INV-1', courier: '1136' },
  { orderNo: 'O-2', trackingNumber: 'INV-2', courier: '1136' },
];

function tabs(reply: unknown, options: { existingTab?: (pattern: string) => number | null; currentUrl?: string } = {}) {
  const asked: Array<Record<string, unknown>> = [];
  const fake = fakeTabPages({
    ...options,
    answer: (message, injected) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      asked.push(message);
      return reply && typeof reply === 'object' && 'ok' in reply ? reply : { ok: true, value: reply };
    },
  });
  return { ...fake, asked };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/mall-tracking — 몰 송장 업로드 라우터', () => {
  it('업로드를 받는 몰(온채널·키드키즈)만 찾아 주고 다른 몰 키는 null', () => {
    const deps = { tabs: fakeTabPages({ answer: () => null }).tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const router = siteFactoryFor(MALL_TRACKING_SITE)!.create(deps, { tabId: null, credentials: null }) as { uploader(mallKey: string): { uploadTracking?: unknown } | null };
    expect(typeof router.uploader('onch')?.uploadTracking).toBe('function');
    expect(typeof router.uploader('kidkids')?.uploadTracking).toBe('function');
    expect(router.uploader('sellpia')).toBeNull();
    expect(router.uploader('domeggook')).toBeNull();
  });

  it('셀피아 택배사 코드는 몰이 쓰는 이름으로(1136 → CJ대한통운), 모르는 코드는 옛 웹 규칙대로 CJ대한통운, 이름은 그대로', () => {
    expect(courierName('1136')).toBe('CJ대한통운');
    expect(courierName('999')).toBe('CJ대한통운');
    expect(courierName('')).toBe('CJ대한통운');
    expect(courierName('로젠택배')).toBe('로젠택배');
  });
});

describe('sites/onch 송장 업로드(운영자 탭)', () => {
  const OK = {
    status: 'ok',
    listSize: 5,
    rows: [{ orderNo: 'O-1', status: 'uploaded', mallMessage: null }, { orderNo: 'O-2', status: 'already_uploaded', mallMessage: '이미 송장 등록됨' }],
  };

  it('온채널 주문 목록 탭을 재사용해 앞으로 가져오고, 택배사 이름으로 바꾼 행을 보내 몰이 확인한 결과를 돌려준다(운영자 탭은 닫지 않는다)', async () => {
    const fake = tabs(OK, { existingTab: (pattern) => (pattern.includes('/supplier/orders') ? 31 : null), currentUrl: ONCH_ORDER_URL });
    await expect(createOnchSite(fake.tabs).uploadTracking(ROWS)).resolves.toEqual({ rows: OK.rows, confirmedByMall: true });
    expect(fake.asked).toEqual([{
      type: 'KIDITEM_PAGE_CALL',
      call: 'onch.uploadTracking',
      args: { rows: [{ orderNo: 'O-1', trackingNumber: 'INV-1', courierName: 'CJ대한통운' }, { orderNo: 'O-2', trackingNumber: 'INV-2', courierName: 'CJ대한통운' }] },
    }]);
    expect(fake.log[0]).toBe('find https://www.onch3.co.kr/supplier/orders*');
    expect(fake.log).toContain('focus 31');
    expect(fake.log.at(-1)).toBe('leave 31');
  });

  it('plan에 같은 주문번호 행이 둘이면 첫 행만 보낸다(같은 주문에 두 번 POST하지 않는다)', async () => {
    const fake = tabs(OK);
    await createOnchSite(fake.tabs).uploadTracking([...ROWS, { orderNo: 'O-1', trackingNumber: 'INV-9', courier: '1136' }]);
    expect((fake.asked[0]!.args as { rows: Array<{ orderNo: string; trackingNumber: string }> }).rows.map((row) => [row.orderNo, row.trackingNumber])).toEqual([['O-1', 'INV-1'], ['O-2', 'INV-2']]);
  });

  it('탭이 없으면 열어 앞으로 가져오고, 모두 성공하면 우리가 연 탭을 닫는다', async () => {
    const fake = tabs(OK);
    await createOnchSite(fake.tabs).uploadTracking(ROWS);
    expect(fake.log.filter((line) => !line.startsWith('ask') && !line.startsWith('inject'))).toEqual([
      'find https://www.onch3.co.kr/supplier/orders*',
      'find https://www.onch3.co.kr/*',
      'open about:blank',
      `navigate ${ONCH_ORDER_URL}`,
      'focus 7',
      'close 7',
    ]);
  });

  it('실패한 행이 있으면 운영자가 보도록 연 탭도 남긴다', async () => {
    const fake = tabs({ ...OK, rows: [{ orderNo: 'O-1', status: 'failed', mallMessage: '응답 500' }] });
    await createOnchSite(fake.tabs).uploadTracking(ROWS);
    expect(fake.log.at(-1)).toBe('leave 7');
  });

  it('로그인 화면이면 SITE_LOGIN_REQUIRED(자격이 없으면 no_credentials)이고 탭을 남긴다', async () => {
    const fake = tabs({ status: 'login_required' });
    const error = await failure(createOnchSite(fake.tabs).uploadTracking(ROWS));
    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
    expect(fake.log.at(-1)).toBe('leave 7');
  });

  it('보내는 중 답이 끊기면(시간 초과) 몰에 일부 반영됐을 수 있어 모든 행을 확인 대기로 돌려준다', async () => {
    const fake = tabs({ ok: false, error: 'timeout' });
    await expect(createOnchSite(fake.tabs).uploadTracking(ROWS)).resolves.toEqual({
      rows: ROWS.map((row) => ({ orderNo: row.orderNo, status: 'failed', mallMessage: '몰 응답을 받지 못했습니다. 몰 화면에서 반영 여부를 확인해 주세요.' })),
      confirmedByMall: false,
    });
    expect(fake.log.at(-1)).toBe('leave 7');
  });
});

describe('sites/kidkids 송장 업로드·출고완료(운영자 탭)', () => {
  it('출고관리 탭에서 한 번 제출하고, 성공 코드가 없어 제출만 확인된 것(confirmedByMall:false)으로 돌려주며 탭을 남긴다', async () => {
    const reply = { status: 'ok', submitted: true, httpStatus: 200, listSize: 3, rows: [{ orderNo: 'O-1', status: 'uploaded', mallMessage: null }] };
    const fake = tabs(reply, { existingTab: (pattern) => (pattern.includes('/logis/management.htm') ? 44 : null), currentUrl: KIDKIDS_ORDER_URL });
    await expect(createKidkidsSite(fake.tabs).uploadTracking(ROWS)).resolves.toEqual({ rows: reply.rows, confirmedByMall: false });
    expect(fake.asked[0]).toMatchObject({ call: 'kidkids.uploadTracking' });
    expect(fake.log).toContain('focus 44');
    expect(fake.log.at(-1)).toBe('leave 44');
  });

  it('넣을 주문이 없어 제출하지 않았으면 몰에 쓴 것이 없다(confirmedByMall:true)', async () => {
    const fake = tabs({ status: 'ok', submitted: false, httpStatus: null, listSize: 3, rows: [{ orderNo: 'O-1', status: 'not_in_list', mallMessage: '목록에 없음' }] });
    await expect(createKidkidsSite(fake.tabs).uploadTracking(ROWS)).resolves.toMatchObject({ confirmedByMall: true });
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('출고관리 목록을 못 찾으면 SITE_REQUEST_FAILED(키드키즈의 말)로 멈추고 탭을 남긴다', async () => {
    const fake = tabs({ status: 'unreadable', error: '출고관리 목록을 찾지 못했습니다. (로그인/화면 확인)' });
    const error = await failure(createKidkidsSite(fake.tabs).uploadTracking(ROWS));
    expect(error).toMatchObject({ code: 'SITE_REQUEST_FAILED', message: '출고관리 목록을 찾지 못했습니다. (로그인/화면 확인)' });
    expect(fake.log.at(-1)).toBe('leave 7');
  });
});
