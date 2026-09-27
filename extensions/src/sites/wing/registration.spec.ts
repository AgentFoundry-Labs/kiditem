import { describe, expect, it } from 'vitest';
import { fakeLoginScreen, fastClock } from '../login.fake';
import type { MallWriterHandle } from '../mall-write';
import '../mall-write';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import './registration';

// 쿠팡 WING 등록 쓰기 모듈(KID-256): 몰 쓰기 라우터 경계에서 본다. 가짜는 탭 경계(페이지 호출의 답)와 서비스워커 fetch뿐이다.
const FORM_V2 = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';
const PRODUCT = {
  categoryCell: '[64687] 생활용품>생활소품>열쇠고리/키홀더',
  productName: '말랑 키링',
  additionalImageUrls: ['http://localhost:9000/kiditem/extra.jpg', 'https://image1.coupangcdn.com/cdn.jpg'],
  detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  variants: [{ representativeImageUrl: 'http://localhost:9000/kiditem/rep.jpg' }],
};

type Answer = Record<string, unknown>;

function wing(answer: (message: Answer) => unknown, options: { loginAt?: string } = {}) {
  const asked: Answer[] = [];
  const login = options.loginAt ? fakeLoginScreen({ loginAt: options.loginAt }) : null;
  const fake = fakeTabPages({
    ...(login ? { landAt: login.landAt, frames: login.frames } : {}),
    answer: (message, injected) => {
      const fromLogin = login?.answer(message);
      if (fromLogin !== undefined) return fromLogin;
      if (!injected) return { ok: false, error: 'content_script_missing' };
      asked.push(message);
      return answer(message);
    },
  });
  const fetched: string[] = [];
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...fastClock(),
    cookies: { async get() { return null; } },
    fetch: async (url) => {
      fetched.push(url);
      return new Response(new Uint8Array([7]), { headers: { 'content-type': 'image/jpeg' } });
    },
  };
  const router = siteFactoryFor('mall-write')!.create(deps, { tabId: null, credentials: { loginId: 'fake-wing-id', password: 'fake-wing-password' } }) as { writer(mallKey: string): MallWriterHandle | null };
  return { fake, asked, fetched, login, handle: router.writer('coupang')! };
}

const filled = (message: Answer) => {
  if (message.call === 'wing.compat') return { ok: true, value: { ok: true, status: 'installed' } };
  if (message.call === 'wing.fill') return { ok: true, value: { ok: true, steps: ['formReady', 'category'], evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:vendor-code-label' } } };
  if (message.call === 'wing.submit') return { ok: true, value: { attempted: true, clicked: true, ok: true, status: 'registered', externalListingId: '16311492950' } };
  return { ok: false, error: 'unexpected' };
};

describe('쿠팡 WING 등록 쓰기 모듈(sites/wing/registration.ts)', () => {
  it('formV2를 호환 스크립트와 함께 열고, 호환 확인 → 채우기(판매자 계정 대조) 순서로 부른다 — 우리 저장소 사진은 서비스워커가 읽어 넘긴다', async () => {
    const { fake, asked, fetched, handle } = wing(filled);

    const session = await handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: false, expectedProviderAccountId: 'A00012345' });
    await session.done();

    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${FORM_V2} (bootstrap content/page-call/wing-form-compat.js)`]);
    expect(asked.map((message) => message.call)).toEqual(['wing.compat', 'wing.fill']);
    const args = asked[1]!.args as { product: Answer; expectedVendorId: string; imageData: Record<string, string> };
    expect(args.product).toEqual(PRODUCT);
    expect(args.expectedVendorId).toBe('A00012345');
    expect(Object.keys(args.imageData).sort()).toEqual(['http://localhost:9000/kiditem/detail.jpg', 'http://localhost:9000/kiditem/extra.jpg', 'http://localhost:9000/kiditem/rep.jpg']);
    expect(fetched).not.toContain('https://image1.coupangcdn.com/cdn.jpg');
    expect(session.providerAccountId).toBe('A00012345');
    // 실행이 [상품등록]을 부탁하지 않았으면 누르지 않는다.
    expect(session.decision).toEqual({ press: false, skipped: null });
  });

  it('실행이 부탁하고 채우기에 경고가 없으면 관문이 누르라고 하고, 누르기는 확인 모달까지 가 새 등록상품ID를 읽는다', async () => {
    const { asked, handle } = wing(filled);

    const session = await handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: true, expectedProviderAccountId: 'A00012345' });
    expect(session.decision).toEqual({ press: true });
    const submission = await session.submit();
    await session.done();

    expect(asked.map((message) => message.call)).toEqual(['wing.compat', 'wing.fill', 'wing.submit']);
    expect(submission).toMatchObject({ pressed: true, accepted: true, externalListingId: '16311492950' });
  });

  it('완료 안내를 못 보면 받았는지 모른다(null) — 추측으로 성공을 보고하지 않는다; 버튼을 못 찾으면 누르지 않은 것이다', async () => {
    const unknown = wing((message) => (message.call === 'wing.submit'
      ? { ok: true, value: { attempted: true, clicked: true, ok: false, status: 'unknown', externalListingId: null, error: '완료 안내를 확인하지 못했습니다.' } }
      : filled(message)));
    const session = await unknown.handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: true, expectedProviderAccountId: 'A00012345' });
    await expect(session.submit()).resolves.toMatchObject({ pressed: true, accepted: null, mallMessage: '완료 안내를 확인하지 못했습니다.' });

    const missing = wing((message) => (message.call === 'wing.submit'
      ? { ok: true, value: { attempted: true, clicked: false, ok: false, status: 'no_button', error: '상품등록 버튼을 찾지 못했습니다.' } }
      : filled(message)));
    const second = await missing.handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: true, expectedProviderAccountId: 'A00012345' });
    await expect(second.submit()).resolves.toMatchObject({ pressed: false });
  });

  it('구성 변경·수정은 새 등록 폼이 아니라 그 리스팅의 수정 화면을 연다 — 등록상품ID가 없으면 열지 않는다', async () => {
    const { fake, handle } = wing(filled);
    const session = await handle.fill!({ executionKind: 'composition_change', externalListingId: '16290876620', form: PRODUCT, submit: false, expectedProviderAccountId: 'A00012345' });
    await session.done();
    expect(fake.log.filter((line) => line.startsWith('navigate'))[0]).toBe(`navigate ${FORM_V2}?vendorInventoryId=16290876620 (bootstrap content/page-call/wing-form-compat.js)`);

    const none = wing(filled);
    await expect(none.handle.fill!({ executionKind: 'composition_change', externalListingId: null, form: PRODUCT, submit: false, expectedProviderAccountId: 'A00012345' }))
      .rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    expect(none.fake.log.filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it('승인된 판매자 식별자가 없으면 채우지 않는다 · 화면의 계정이 다르면(영어 답) 운영자 말로 REGISTRATION_ACCOUNT_MISMATCH', async () => {
    const { handle } = wing(filled);
    await expect(handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: true, expectedProviderAccountId: null }))
      .rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });

    const other = wing((message) => (message.call === 'wing.fill'
      ? { ok: true, value: { ok: false, error: 'WING account identity does not match the approved account.', steps: [] } }
      : filled(message)));
    await expect(other.handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: true, expectedProviderAccountId: 'A00012345' }))
      .rejects.toMatchObject({ code: 'REGISTRATION_ACCOUNT_MISMATCH', message: expect.not.stringMatching(/[A-Za-z]{4,}/) });
  });

  it('옛 웹의 `{ product }` 래퍼도 받는다 — 서버 plan은 평평한 WingProduct를 싣는다', async () => {
    const { asked, handle } = wing(filled);
    const session = await handle.fill!({ executionKind: 'register', externalListingId: null, form: { product: PRODUCT }, submit: false, expectedProviderAccountId: 'A00012345' });
    await session.done();
    expect((asked[1]!.args as { product: Answer }).product).toEqual(PRODUCT);
  });

  it('윙 로그인 화면(xauth)으로 넘어가면 그 탭에서 실행 자격으로 한 번 로그인하고 formV2로 돌아가 다시 채운다', async () => {
    const { login, handle } = wing(filled, { loginAt: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth' });
    const session = await handle.fill!({ executionKind: 'register', externalListingId: null, form: PRODUCT, submit: false, expectedProviderAccountId: 'A00012345' });
    await session.done();
    expect(login!.state.filled).toEqual([{ loginId: 'fake-wing-id', password: 'fake-wing-password' }]);
  });
});
