import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import '../mall-orders';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createKidsnoteSite, KIDSNOTE_LOGIN, KIDSNOTE_ORDER_URL } from './index';

const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };

/** 페이지 스크립트가 돌려주는 주문(옛 `scrapeKidsnoteOrders`의 원소). */
const SCRAPED = {
  ono: '20260926-00002',
  pno: 'P2',
  orderDate: '2026-09-26',
  orderedAt: '2026-09-26 15:10:00',
  productName: '색종이 외 1건',
  ordererName: '박영희',
  totalAmount: 12000,
  paidAmount: 11000,
  payMethod: '무통장입금',
  status: '결제완료',
  receiver: '행복유치원',
  mobile: '010-1234-5678',
  tel: '',
  zip: '06000',
  address: '서울 강남구 테헤란로 1',
  request: '문 앞에 두세요',
  paidAt: '2026-09-26 15:12',
  items: [{ productName: '색종이 세트', qty: 2, option: '', amount: 6000, shipFee: 3000 }],
};

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/kidsnote — 몰 주문 읽기(KID-380)', () => {
  it('몰 키 이름으로 등록되고 몰 주문 라우터가 찾는다', () => {
    expect(siteFactoryFor('kidsnote')).not.toBeNull();
    const deps = { tabs: fakeTabPages({ answer: () => null }).tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const router = siteFactoryFor('mall-orders')!.create(deps, { tabId: null, credentials: null }) as { reader(mallKey: string): unknown };
    expect(router.reader('kidsnote')).not.toBeNull();
  });

  it('새 백그라운드 탭에서 전체주문조회를 열어 그날 주문을 상세까지 읽고, 옛 변환 본문의 주문 모양으로 바꾼 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', orders: [SCRAPED, { ...SCRAPED, ono: '20260926-00001', items: [], receiver: '', paidAt: undefined }] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    const { rows } = await createKidsnoteSite(fake.tabs).readOrders(INPUT);
    // 옛 `order-collection-server-converter.js` kidsnotePayload 그대로: 구매자·결제 금액 이름이 바뀌고, 수취인이 없으면
    // 주문자, 품목이 없으면 목록 상품 하나.
    expect(rows).toEqual([
      {
        ono: '20260926-00002',
        orderedAt: '2026-09-26 15:10:00',
        paidAt: '2026-09-26 15:12',
        buyer: '박영희',
        total: 12000,
        paid: 11000,
        payMethod: '무통장입금',
        status: '결제완료',
        receiver: '행복유치원',
        mobile: '010-1234-5678',
        tel: '',
        zip: '06000',
        address: '서울 강남구 테헤란로 1',
        request: '문 앞에 두세요',
        items: [{ productName: '색종이 세트', qty: 2, option: '', amount: 6000, shipFee: 3000 }],
      },
      expect.objectContaining({
        ono: '20260926-00001',
        paidAt: '',
        receiver: '박영희',
        items: [{ productName: '색종이 외 1건', qty: 1, option: '', shipFee: 0 }],
      }),
    ]);
    expect(asked[0]).toEqual({
      type: 'KIDITEM_PAGE_CALL',
      call: 'kidsnote.orders',
      args: { from: '2026-09-26', to: '2026-09-26', status: '', withDetail: true },
    });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${KIDSNOTE_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/kidsnote-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('세션 만료는 SITE_LOGIN_REQUIRED(탭을 남긴다), 페이지 실패는 SITE_REQUEST_FAILED(탭을 닫는다)', async () => {
    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createKidsnoteSite(expired.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');

    const broken = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'failed', error: '키즈노트 주문 조회 실패 (HTTP 500)' } }) });
    expect(await failure(createKidsnoteSite(broken.tabs).readOrders(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'page_error' } });
    expect(broken.log.at(-1)).toBe('close 7');
  });

  it('로그인 입구는 옛 mall-session.js kidsnote 줄: 전체주문조회로 들어가 아이디·비밀번호 두 칸', () => {
    expect(KIDSNOTE_LOGIN).toMatchObject({ loginUrl: KIDSNOTE_ORDER_URL, hosts: ['shop.kidsnote.com'], fields: ['loginId', 'password'] });
    expect(KIDSNOTE_LOGIN.isLoginUrl(new URL('https://shop.kidsnote.com/_manage/login.php'))).toBe(true);
    expect(KIDSNOTE_LOGIN.isLoginUrl(new URL(KIDSNOTE_ORDER_URL))).toBe(false);
  });

  it('로그인 화면이면 실행 자격으로 한 번 로그인하고 전체주문조회로 돌아가 다시 읽는다(자격은 폼 채우기에만)', async () => {
    const loginAt = 'https://shop.kidsnote.com/_manage/login.php';
    const login = fakeLoginScreen({ loginAt });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message, injected) => login.answer(message)
        ?? (injected ? { ok: true, value: { status: 'ok', orders: [SCRAPED] } } : { ok: false, error: 'content_script_missing' }),
    });
    const deps = { tabs: fake.tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const credentials = { loginId: 'fake-id', password: 'fake-password' };
    const site = siteFactoryFor('kidsnote')!.create(deps, { tabId: null, credentials }) as ReturnType<typeof createKidsnoteSite>;
    await expect(site.readOrders(INPUT)).resolves.toMatchObject({ rows: [{ ono: '20260926-00002' }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-id', password: 'fake-password' }]);
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${KIDSNOTE_ORDER_URL}`, `navigate ${KIDSNOTE_ORDER_URL}`]);
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('로그인 폼이 주문 화면 주소 자체에 뜨면(옛 mall-session.js 줄: entry = login) 처리기의 login_required로 그 탭에서 로그인하고 다시 읽는다', async () => {
    const login = fakeLoginScreen({ loginAt: KIDSNOTE_ORDER_URL });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message, injected) => login.answer(message)
        ?? (!injected ? { ok: false, error: 'content_script_missing' }
          : login.state.signedIn ? { ok: true, value: { status: 'ok', orders: [SCRAPED] } } : { ok: true, value: { status: 'login_required' } }),
    });
    const deps = { tabs: fake.tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const site = siteFactoryFor('kidsnote')!.create(deps, { tabId: null, credentials: { loginId: 'fake-id', password: 'fake-password' } }) as { readOrders(input: typeof INPUT): Promise<{ rows: unknown[] }> };
    const { rows } = await site.readOrders(INPUT);
    expect(rows).toHaveLength(1);
    expect(login.state.filled).toEqual([{ loginId: 'fake-id', password: 'fake-password' }]);
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${KIDSNOTE_ORDER_URL}`, `navigate ${KIDSNOTE_ORDER_URL}`]);
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('로그인 주소 추측은 경로의 /login 마디만 본다(쿼리의 login은 로그인 화면이 아니다)', () => {
    expect(KIDSNOTE_LOGIN.isLoginUrl(new URL('https://shop.kidsnote.com/member/login.php'))).toBe(true);
    expect(KIDSNOTE_LOGIN.isLoginUrl(new URL('https://shop.kidsnote.com/_manage/?body=3010&from=login'))).toBe(false);
    expect(KIDSNOTE_LOGIN.hosts).toEqual(['shop.kidsnote.com']);
  });
});
