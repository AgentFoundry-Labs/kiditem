import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import './index';
import '../domeggook/registration';
import '../always/registration';
import '../11st/registration';
import '../thirtymall/registration';
import type { MallWriterHandle } from './index';

// 몰 쓰기 절차(옛 `mall-form-register.js` `register()` 이식, KID-256)를 몰 쓰기 라우터 경계에서 본다. 가짜는 탭 경계
// (`fakeTabPages` — 페이지 호출의 답)와 서비스워커 fetch(우리 저장소 사진·키즈노트 첨부 저장소)뿐이다.
const REGISTER_URL = 'https://www.domeggook.com/sc/item/regFrm';
const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };

type Answer = Record<string, unknown>;

function domeggookForm(overrides: Record<string, unknown> = {}) {
  return {
    url: REGISTER_URL,
    fields: { itemName: '말랑 키링 1p', itemPrice: 830 },
    groups: { keywords: ['키링', '말랑'] },
    selectorFields: { originType: '수입산' },
    fileUploads: [{ name: 'image1', url: 'http://localhost:9000/kiditem/rep.jpg' }],
    detailUploads: [{ url: 'http://localhost:9000/kiditem/detail.jpg' }],
    detailHtmlTarget: 'itemMemo[Item]',
    manualSteps: [],
    ...overrides,
  };
}

/** 서비스워커 fetch: 우리 저장소 사진과 키즈노트 첨부 저장소(빈 상품번호 → 올리기 → 첨부 목록). */
function storageFetch(options: { kidsnoteLoggedOut?: boolean } = {}) {
  const requests: string[] = [];
  const fetch = async (input: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${input}`);
    if (input.startsWith('http://localhost:9000/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    if (input.includes('product@product_register')) {
      return new Response(options.kidsnoteLoggedOut ? '<form>login</form>' : '<input name="pno" value="777">');
    }
    if (input.includes('product@product_file.frm')) return new Response('<img src="https://kids-wi.kakaocdn.net/dn/AA/BB/detail.jpg">');
    return new Response('ok');
  };
  return { fetch, requests };
}

function writerFor(mallKey: string, answer: (message: Answer, injected: boolean, frameId?: number) => unknown, options: { credentials?: typeof CREDENTIALS | null; loginAt?: string; kidsnoteLoggedOut?: boolean; frames?: Array<{ frameId: number; result: unknown }> } = {}) {
  const login = options.loginAt ? fakeLoginScreen({ loginAt: options.loginAt }) : null;
  const fake = fakeTabPages({
    ...(login ? { landAt: login.landAt, frames: login.frames } : {}),
    ...(options.frames ? { frames: () => options.frames! } : {}),
    logBookkeeping: true,
    answer: (message, injected, frameId) => login?.answer(message) ?? answer(message, injected, frameId),
  });
  const storage = storageFetch(options);
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...fastClock(),
    cookies: { async get() { return null; } },
    fetch: storage.fetch,
  };
  const router = siteFactoryFor('mall-write')!.create(deps, { tabId: null, credentials: options.credentials === undefined ? CREDENTIALS : options.credentials }) as { writer(mallKey: string): MallWriterHandle | null };
  return { fake, storage, login, writer: router.writer(mallKey)! };
}

const pageCalls = (fake: ReturnType<typeof fakeTabPages>) => fake.log.filter((line) => /^(open|navigate|ask|inject|leave|close|guard|unguard)/.test(line));

describe('몰 쓰기 — 등록 폼 채우기(도매꾹, KID-256)', () => {
  it('몰 폼 명세는 새 상품 등록 화면만 안다 — 구성 전환(기존 리스팅 수정)은 탭을 열지 않고 RUNTIME_PLAN_INVALID', async () => {
    const { fake, writer } = writerFor('domeggook', () => ({ ok: false, error: 'unexpected' }));
    await expect(writer.fill!({ form: domeggookForm(), submit: false, expectedProviderAccountId: null, executionKind: 'composition_change', externalListingId: '68010748' }))
      .rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    expect(fake.log.filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it('사진을 data URL로, 상세를 첨부 저장소에 올린 뒤 쓰기 탭에서 채우고 상세는 작성하기 에디터로 넣는다 — 누르지 않고 탭은 운영자에게 넘긴다', async () => {
    const asked: Answer[] = [];
    const { fake, storage, writer } = writerFor('domeggook', (message, injected) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      asked.push(message);
      if (message.call === 'mallForm.fill') return { ok: true, value: { ok: true, steps: ['상품명', '키워드'], warnings: [], dialogs: ['안내'] } };
      if (message.call === 'mallForm.detailEditor') return { ok: true, value: { ok: true, filled: true } };
      return { ok: false, error: 'unexpected' };
    });

    const session = await writer.fill!({ form: domeggookForm(), submit: true, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null });
    await session.done();

    expect(session.fill).toEqual({
      steps: ['상품명', '키워드', '상세설명(작성하기 에디터)'],
      warnings: [],
      manualSteps: [],
      dialogs: ['안내'],
    });
    expect(session.decision).toEqual({ press: false, skipped: 'no_verified_submit' });
    expect(storage.requests).toEqual([
      'GET http://localhost:9000/kiditem/rep.jpg',
      'GET http://localhost:9000/kiditem/detail.jpg',
      'GET https://shop.kidsnote.com/_manage/?body=product@product_register',
      'POST https://shop.kidsnote.com/_manage/',
      'GET https://shop.kidsnote.com/_manage/?body=product@product_file.frm&filetype=3&stat=1&content_id=content2&pno=777',
    ]);
    const fill = asked.find((message) => message.call === 'mallForm.fill')!.args as Record<string, unknown>;
    expect(fill).toMatchObject({
      formSelector: '#lFormRegItem',
      groupInputs: [{ key: 'keywords', selector: 'input.lKeywordTmp' }],
      groups: { keywords: ['키링', '말랑'] },
      fields: { itemName: '말랑 키링 1p', itemPrice: '830' },
      // 팝업 에디터 몰은 칸에 직접 쓰지 않는다.
      detailHtmlTarget: '',
      detailHtml: '',
    });
    expect((fill.images as Array<Record<string, unknown>>)[0]).toMatchObject({ name: 'image1', dataUrl: 'data:image/jpeg;base64,AQID', fileName: 'rep.jpg' });
    const editor = asked.find((message) => message.call === 'mallForm.detailEditor')!.args as Record<string, unknown>;
    expect(editor).toMatchObject({ target: 'itemMemo[Item]', buttonId: 'lBtnWriteItemMemo', html: '<center><img referrerpolicy="no-referrer" src="https://kids-wi.kakaocdn.net/dn/AA/BB/detail.jpg"></center>' });
    expect(pageCalls(fake)).toEqual([
      'guard dialogs domeggook.com',
      'open about:blank',
      `navigate ${REGISTER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/page-call/dialog-guard.js,content/page-call/form-fill.js',
      'ask KIDITEM_PAGE_CALL',
      'ask KIDITEM_PAGE_CALL',
      'leave 7',
      'unguard dialogs domeggook.com',
    ]);
  });

  it('도매꾹 등록 주소가 아니면 탭을 열지 않고 RUNTIME_PLAN_INVALID', async () => {
    const { fake, writer } = writerFor('domeggook', () => ({ ok: false, error: 'unexpected' }));
    for (const url of ['https://www.domeggook.com/sc/order/lstAll', 'https://evil.test/sc/item/regFrm']) {
      await expect(writer.fill!({ form: domeggookForm({ url }), submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null })).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    }
    expect(fake.log.filter((line) => line.startsWith('open'))).toEqual([]);
  });

  it('상세 저장소(키즈노트)에서 로그아웃이면 상세를 빼고 채우되 까닭을 경고로 남긴다 — 경고가 있으면 관문이 누르지 않는다', async () => {
    const { writer } = writerFor('domeggook', (message, injected) => (injected
      ? { ok: true, value: { ok: true, steps: ['상품명'], warnings: [] } }
      : { ok: false, error: 'content_script_missing' }), { kidsnoteLoggedOut: true });

    const session = await writer.fill!({ form: domeggookForm(), submit: true, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null });

    expect(session.fill.warnings).toEqual(['상세 이미지를 올리지 못했습니다 — 키즈노트 관리자에 로그인되어 있지 않습니다. 키즈노트 관리자에 로그인한 뒤 다시 채우세요.']);
    expect(session.fill.steps).toEqual(['상품명']);
  });

  it('폼이 없으면(로그인이 풀렸다) 그 탭에서 실행 자격으로 한 번 로그인하고 등록 주소로 돌아가 다시 채운다', async () => {
    let fills = 0;
    const { fake, login, writer } = writerFor('domeggook', (message, injected) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      if (message.call !== 'mallForm.fill') return { ok: true, value: { ok: true, filled: true } };
      fills += 1;
      return { ok: true, value: { ok: true, steps: ['상품명'], warnings: [] } };
    }, { loginAt: 'https://domeggook.com/ssl/member/mem_loginForm.php' });

    const session = await writer.fill!({ form: domeggookForm({ detailUploads: [] }), submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null });
    await session.done();

    expect(login!.state.filled).toEqual([CREDENTIALS]);
    expect(fills).toBe(1);
    // 로그인 화면에 닿았으니 그 화면에서 채우고 등록 주소로 돌아간다.
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${REGISTER_URL}`, `navigate ${REGISTER_URL}`]);
  });

  it('폼을 찾았는데 채우다 실패하면 로그인하지 않고 REGISTRATION_FILL_FAILED — 탭은 운영자에게 남긴다', async () => {
    const { fake, writer } = writerFor('domeggook', (message, injected) => (injected
      ? { ok: true, value: { ok: false, error: '분류를 고르지 못했습니다.', steps: ['상품명'] } }
      : { ok: false, error: 'content_script_missing' }));

    await expect(writer.fill!({ form: domeggookForm({ detailUploads: [] }), submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null }))
      .rejects.toMatchObject({ code: 'REGISTRATION_FILL_FAILED', message: '분류를 고르지 못했습니다.' });
    expect(fake.log).toContain('leave 7');
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toHaveLength(1);
  });

  it('로그인 폼 명세가 없는 몰(올웨이즈 JWT)은 폼이 없으면 로그인하지 않고 SITE_LOGIN_REQUIRED — 탭을 남긴다', async () => {
    const { fake, writer } = writerFor('always', (message, injected) => (injected
      ? { ok: true, value: { ok: false, noForm: true, error: '몰에 로그인되어 있지 않습니다. 열린 탭에서 직접 로그인한 뒤 다시 누르세요.' } }
      : { ok: false, error: 'content_script_missing' }));

    await expect(writer.fill!({ form: { url: 'https://alwayzseller.ilevit.com/items/registrations', manualSteps: [] }, submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null }))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log).toContain('leave 7');
  });
});

describe('몰 쓰기 — 폼이 iframe에 있는 몰(11번가, KID-256)', () => {
  it('모든 프레임을 살펴 맨 위부터 차례로 채우고, 폼이 없는 프레임의 답(noForm)은 실패로 올리지 않는다', async () => {
    const asked: Array<number | undefined> = [];
    const { fake, writer } = writerFor('11st', (message, injected, frameId) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      asked.push(frameId);
      return frameId === 3
        ? { ok: true, value: { ok: true, steps: ['상품명'], warnings: [] } }
        : { ok: true, value: { ok: false, noForm: true, error: '상품등록 폼이 없습니다.' } };
    }, {
      frames: [{ frameId: 3, result: { href: 'https://soffice.11st.co.kr/pages/product-reg/index.html', doc: 2 } }, { frameId: 0, result: { href: 'https://soffice.11st.co.kr/view/123124025', doc: 1 } }],
    });

    const session = await writer.fill!({ form: { url: 'https://soffice.11st.co.kr/view/123124025', manualSteps: [] }, submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null });

    expect(session.fill.steps).toEqual(['상품명']);
    expect(asked).toEqual([0, 3]);
    expect(fake.log).toContain('frames content/page-call/form-frame.js');
  });
});

describe('몰 쓰기 — 폼이 다른 도메인 iframe에 있는 몰(떠리몰, KID-256)', () => {
  it('폼 프레임이 붙고 칸이 그려진 같은 문서가 가라앉을 때까지 기다린 뒤 그 프레임에서만 채운다', async () => {
    const calls: string[] = [];
    let states = 0;
    const { writer } = writerFor('thirtymall', (message, injected, frameId) => {
      if (!injected) return { ok: false, error: 'content_script_missing' };
      calls.push(`${String(message.call)}@${frameId}`);
      if (message.call === 'mallForm.state') {
        states += 1;
        // 처음엔 칸이 아직 없다(앱이 늦게 그린다).
        return { ok: true, value: { form: true, ready: states > 1 } };
      }
      return { ok: true, value: { ok: true, steps: ['상품명'], warnings: [] } };
    }, {
      frames: [{ frameId: 0, result: { href: 'https://partner.shopby.co.kr/product/add', doc: 1 } }, { frameId: 5, result: { href: 'https://partner-remote.shopby.co.kr/product/management/single/add', doc: 7 } }],
    });

    const session = await writer.fill!({ form: { url: 'https://partner.shopby.co.kr/product/add', manualSteps: [] }, submit: false, expectedProviderAccountId: null, executionKind: 'register', externalListingId: null });

    expect(session.fill.steps).toEqual(['상품명']);
    expect(calls).toEqual(['mallForm.state@5', 'mallForm.state@5', 'mallForm.state@5', 'mallForm.fill@5']);
  });
});
