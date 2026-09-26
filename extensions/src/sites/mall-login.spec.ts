import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import { ART09_LOGIN, ART09_ORDER_URL } from './art09';
import { DOMEGGOOK_LOGIN, DOMEGGOOK_ORDER_LIST_API } from './domeggook';
import { ICECREAM_LOGIN, ICECREAM_MALL_URL } from './icecream-mall';
import { KIDKIDS_LOGIN, KIDKIDS_ORDER_URL } from './kidkids';
import { fakeLoginScreen, fastClock } from './login.fake';
import './mall-orders';
import { siteFactoryFor, type SiteDeps, type SiteLease } from './registry';
import { fakeTabPages } from './tab-page.fake';

// 몰 주문 1차 몰 넷의 자동 로그인(KID-377). 옛 `mall-session.js` SPECS 줄을 옮긴 로그인 입구와, 로그인 화면에서 멈춘
// 읽기가 실행 자격으로 한 번 로그인하고 같은 화면으로 돌아가 다시 읽는지를 몰 주문 라우터(`mall-orders`)로 본다.
const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password', supplierLoginId: 'fake-supplier-id' };
const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };
type Reader = { readOrders(input: typeof INPUT): Promise<{ rows: unknown[] }> };

function mall(mallKey: string, options: {
  loginAt: string;
  answer: (message: Record<string, unknown>) => unknown;
  frames?: (files: readonly string[], url: string, signedIn: boolean) => Array<{ frameId: number; result: unknown }> | null;
  fetch?: (url: string, signedIn: boolean) => Response;
  credentials?: typeof CREDENTIALS | null;
  accept?: boolean;
  dialog?: string;
}) {
  const login = fakeLoginScreen({ loginAt: options.loginAt, ...(options.accept === false ? { accept: false } : {}), ...(options.dialog ? { dialog: options.dialog } : {}) });
  const fake = fakeTabPages({
    landAt: login.landAt,
    frames: (files, call, url) => options.frames?.(files, url, login.state.signedIn) ?? login.frames(files, call, url),
    answer: (message, injected) => login.answer(message) ?? (injected ? options.answer(message) : { ok: false, error: 'content_script_missing' }),
  });
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...fastClock(),
    cookies: { async get() { return null; } },
    async fetch(input) {
      return options.fetch?.(String(input), login.state.signedIn) ?? new Response('', { status: 404 });
    },
  };
  const lease: SiteLease = { tabId: null, credentials: options.credentials === undefined ? CREDENTIALS : options.credentials };
  const router = siteFactoryFor('mall-orders')!.create(deps, lease) as { reader(mallKey: string): Reader | null };
  return { login, fake, reader: router.reader(mallKey)! };
}

describe('몰 주문 1차 몰 로그인 입구(옛 mall-session.js SPECS)', () => {
  it('키드키즈: 출고관리로 들어가 partner_login에서 두 칸, verify_user는 본인확인, 클라이언트 리다이렉트를 5초 기다린다', () => {
    expect(KIDKIDS_LOGIN).toMatchObject({ loginUrl: KIDKIDS_ORDER_URL, hosts: ['kidkids.net'], fields: ['loginId', 'password'], settleMs: 5_000 });
    expect(KIDKIDS_LOGIN.isLoginUrl(new URL('https://www.kidkids.net/join/partner_login.htm'))).toBe(true);
    expect(KIDKIDS_LOGIN.isLoginUrl(new URL('https://partner.kidkids.net/partnerLogin.htm'))).toBe(true);
    expect(KIDKIDS_LOGIN.isVerificationUrl?.(new URL('https://partner.kidkids.net/security/verify_user.htm'))).toBe(true);
    expect(KIDKIDS_LOGIN.isLoginUrl(new URL(KIDKIDS_ORDER_URL))).toBe(false);
  });

  it('아트공구: Cafe24 주문목록으로 들어가 쇼핑몰 아이디·공급사 아이디·비밀번호 세 칸', () => {
    expect(ART09_LOGIN).toMatchObject({ loginUrl: ART09_ORDER_URL, hosts: ['zzogzzog1.cafe24.com'], fields: ['supplierLoginId', 'loginId', 'password'] });
    expect(ART09_LOGIN.isLoginUrl(new URL('https://zzogzzog1.cafe24.com/admin/php/login.php'))).toBe(true);
    expect(ART09_LOGIN.isLoginUrl(new URL(ART09_ORDER_URL))).toBe(false);
  });

  it('도매꾹: 주문목록으로 들어가 두 칸 / 아이스크림몰: main.do → loginForm.do(JS로 늦게 뜬다)', () => {
    expect(DOMEGGOOK_LOGIN).toMatchObject({ loginUrl: 'https://domeggook.com/sc/order/lstAll', hosts: ['domeggook.com'], fields: ['loginId', 'password'] });
    expect(DOMEGGOOK_LOGIN.isLoginUrl(new URL('https://domeggook.com/ssl/member/mem_loginForm.php'))).toBe(true);
    expect(ICECREAM_LOGIN).toMatchObject({ loginUrl: ICECREAM_MALL_URL, hosts: ['i-screammall.co.kr'], fields: ['loginId', 'password'], settleMs: 8_000 });
    expect(ICECREAM_LOGIN.isLoginUrl(new URL('https://po.i-screammall.co.kr/loginForm.do'))).toBe(true);
  });
});

describe('몰 주문 읽기의 자동 로그인(KID-377)', () => {
  const KIDKIDS_LOGIN_PAGE = 'https://www.kidkids.net/join/partner_login.htm';
  const kidkidsOrders = (message: Record<string, unknown>) =>
    message.call === 'kidkids.orders' ? { ok: true, value: { status: 'ok', orders: [{ om: 'OM-1' }] } } : { ok: false, error: 'unexpected' };

  it('키드키즈: 로그인 화면이면 같은 탭에서 로그인하고 출고관리로 돌아가 읽은 뒤 탭을 닫는다', async () => {
    const { login, fake, reader } = mall('kidkids', { loginAt: KIDKIDS_LOGIN_PAGE, answer: kidkidsOrders });
    await expect(reader.readOrders(INPUT)).resolves.toEqual({ rows: [{ om: 'OM-1' }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
    expect(fake.log.filter((line) => line.startsWith('navigate') || line.startsWith('close'))).toEqual([
      `navigate ${KIDKIDS_ORDER_URL}`,
      `navigate ${KIDKIDS_ORDER_URL}`,
      'close 7',
    ]);
  });

  it('키드키즈: 자격이 없으면 no_credentials, 본인확인 화면이면 verification_required — 채우지 않고 탭을 남긴다', async () => {
    const none = mall('kidkids', { loginAt: KIDKIDS_LOGIN_PAGE, answer: kidkidsOrders, credentials: null });
    await expect(none.reader.readOrders(INPUT)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'no_credentials' } });
    expect(none.fake.log).not.toContain('close 7');

    const verify = mall('kidkids', { loginAt: 'https://partner.kidkids.net/security/verify_user.htm', answer: kidkidsOrders });
    await expect(verify.reader.readOrders(INPUT)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'verification_required' } });
    expect(verify.login.state.filled).toEqual([]);
    expect(verify.fake.log).not.toContain('close 7');
  });

  it('아트공구: 세 칸을 채워 로그인하고, 몰이 거절하면 credentials_rejected와 몰의 말로 멈춘다', async () => {
    const art09Rows = (message: Record<string, unknown>) =>
      message.call === 'art09.orders' ? { ok: true, value: { status: 'ok', rows: [{ n: 1 }], failures: [] } } : { ok: false, error: 'unexpected' };
    const loginAt = 'https://zzogzzog1.cafe24.com/admin/php/login.php';
    const ok = mall('art09', { loginAt, answer: art09Rows });
    await expect(ok.reader.readOrders(INPUT)).resolves.toEqual({ rows: [{ n: 1 }] });
    expect(ok.login.state.filled).toEqual([{ supplierLoginId: 'fake-supplier-id', loginId: 'fake-mall-id', password: 'fake-mall-password' }]);

    const rejected = mall('art09', { loginAt, answer: art09Rows, accept: false, dialog: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    await expect(rejected.reader.readOrders(INPUT)).rejects.toMatchObject({
      code: SITE_LOGIN_REQUIRED,
      details: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' },
    });
    expect(rejected.fake.log).not.toContain('close 7');
  });

  it('도매꾹: 엑셀 목록이 로그아웃이면 새 탭에서 로그인하고(로그인되면 닫는다) 목록부터 다시 읽는다', async () => {
    const { login, fake, reader } = mall('domeggook', {
      loginAt: 'https://domeggook.com/ssl/member/mem_loginForm.php',
      fetch: (url, signedIn) => (url === DOMEGGOOK_ORDER_LIST_API ? Response.json(signedIn ? { dat: [] } : { res: false, msg: '로그인이 필요합니다' }) : new Response('', { status: 404 })),
      answer: (message) => (message.call === 'domeggook.requestExcel' ? { ok: true, value: { status: 'empty' } } : { ok: false, error: 'unexpected' }),
    });
    await expect(reader.readOrders(INPUT)).resolves.toEqual({ rows: [] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
    expect(fake.log.filter((line) => /^(open|close|navigate)/.test(line))).toEqual([
      'open about:blank',
      'navigate https://domeggook.com/sc/order/lstAll (continue on timeout)',
      'close 7',
      'open about:blank',
      'navigate https://domeggook.com/sc/order/lstAll?dtbase=ord&dt1=2026.09.26&dt2=2026.09.26',
      'close 7',
    ]);
  });

  it('아이스크림몰: 프레임에 로그인 폼이 보이면 그 화면에서 로그인하고 main.do로 돌아가 배송목록을 읽는다', async () => {
    const { login, reader } = mall('icecream-mall', {
      loginAt: ICECREAM_MALL_URL,
      frames: (files, url, signedIn) => (files.some((file) => file.includes('icecream-frames'))
        ? [{ frameId: 0, result: signedIn ? { loginPage: false, deliveryScore: 9, deliveryMenu: true } : { loginPage: true } }]
        : [{ frameId: 0, result: { loginForm: !signedIn && url === ICECREAM_MALL_URL } }]),
      answer: (message) => (message.call === 'icecream.openDeliveryInquiry'
        ? { ok: true, value: { status: 'opened' } }
        : { ok: true, value: { status: 'ok', headers: ['No'], rows: [['1']], masked: false } }),
    });
    await expect(reader.readOrders(INPUT)).resolves.toEqual({ rows: [['1']], continuation: { headers: ['No'], masked: false } });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
  });
});
