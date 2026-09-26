import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, createSiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import {
  WING_VENDOR_IDENTITY_AMBIGUOUS,
  WING_VENDOR_IDENTITY_UNAVAILABLE,
  readWingVendorId,
  wingVendorIdsInPage,
} from './vendor-identity';

const PAGE = 'https://wing.coupang.com/tenants/seller-price-management';

function wing(respond: () => Response) {
  const sent: Array<{ url: string; method: string | undefined; redirect: RequestRedirect | undefined }> = [];
  const deps: SiteCallerDeps = {
    async fetch(url, init) {
      sent.push({ url, method: init?.method, redirect: init?.redirect });
      return respond();
    },
    cookies: { get: async () => ({ value: 'token' }) },
    now: () => 0,
    sleep: async () => undefined,
  };
  return { caller: createSiteCaller({ minIntervalMs: 0 }, deps), sent };
}

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/wing/vendor-identity — 로그인한 Wing 세션의 판매자 식별자(옛 shared/wing-account-identity.js 근거)', () => {
  it('인라인 부트스트랩 스크립트·업체코드 라벨·data 속성에서 같은 식별자 하나를 읽는다, 외부 스크립트는 보지 않는다', () => {
    const html = `<html><head><script src="/app.js?vendorId='X9'"></script>
      <script>window.__APP__ = { vendorId: 'A00057379', other: "vendorId":null };</script></head>
      <body><div class="vendor-id-wrapper">업체코드 A00057379</div><span data-vendor-id="A00057379"></span></body></html>`;
    expect(wingVendorIdsInPage(html)).toEqual(['A00057379']);
  });

  it('GET 한 번(리다이렉트 안 따라감)으로 읽고, 근거가 없거나 둘 이상이면 닫힌 채로 멈춘다', async () => {
    const one = wing(() => new Response(`<script>var app = {"vendorId":"A0001"};</script>`, { headers: { 'Content-Type': 'text/html' } }));
    await expect(readWingVendorId(one.caller, PAGE)).resolves.toBe('A0001');
    expect(one.sent).toEqual([{ url: PAGE, method: 'GET', redirect: 'manual' }]);

    const none = wing(() => new Response('<html><body>Wing</body></html>'));
    expect((await rejection(readWingVendorId(none.caller, PAGE))).code).toBe(WING_VENDOR_IDENTITY_UNAVAILABLE);
    const several = wing(() => new Response(`<script>a={vendorId:'A0001'};b={vendorId:'B0002'}</script>`));
    expect((await rejection(readWingVendorId(several.caller, PAGE))).code).toBe(WING_VENDOR_IDENTITY_AMBIGUOUS);
    const loggedOut = wing(() => new Response('', { status: 302, headers: { Location: '/login' } }));
    const redirected = await readWingVendorId(loggedOut.caller, PAGE).then(() => null, (error: unknown) => error as RuntimeError);
    expect(redirected?.code === SITE_LOGIN_REQUIRED || redirected?.code === 'SITE_REQUEST_FAILED').toBe(true);
  });
});
