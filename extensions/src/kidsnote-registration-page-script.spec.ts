// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import kidsnoteSource from '../kiditem-os/content/page-call/kidsnote-register.js?raw';
import { fastClock } from './sites/login.fake';
import { isKidsnoteRegisterUrl, normalizeKidsnoteForm } from './sites/kidsnote/registration';
import './sites/mall-write';
import type { MallWriterHandle } from './sites/mall-write';
import { dom, loadWritePage, runPageCall } from './sites/mall-write/write-page.fake';
import { siteFactoryFor, type SiteDeps } from './sites/registry';
import { fakeTabPages } from './sites/tab-page.fake';

// 키즈노트(WISA 스마트윙) 입점사 상품등록(KID-256 — 옛 `kidsnote-product-register.js`와 node 스펙 이식). 등록은 몰 승인이 붙는
// 신청이라 폼만 채우고 보내지 않는다. 고시는 `fieldset`을 고른 뒤에야 `field{N}` 칸이 생기고, 분류는 계단식이다.
const REGISTER_URL = 'https://shop.kidsnote.com/_manage/?body=product@product_register';

function baseForm(overrides: Record<string, unknown> = {}) {
  return {
    url: REGISTER_URL,
    formId: 'prdFrm',
    fields: { name: '키링', fieldset: '1083', field437: '키링', sell_prc: '7900', big: '10', mid: '20' },
    checks: ['auto_code'],
    radios: { ea_type: '1' },
    fileUploads: [{ name: 'upfile1', url: 'http://localhost:9000/kiditem/rep.jpg' }],
    manualSteps: ['중분류를 선택하세요.'],
    ...overrides,
  };
}

describe('키즈노트 폼 지시 검사(탭을 열기 전)', () => {
  it('키즈노트 상품등록 화면만 받는다', () => {
    expect(isKidsnoteRegisterUrl(REGISTER_URL)).toBe(true);
    expect(isKidsnoteRegisterUrl('https://shop.kidsnote.com/_manage/?body=product@product_list')).toBe(false);
    expect(isKidsnoteRegisterUrl('https://evil.example/_manage/?body=product@product_register')).toBe(false);
    expect(isKidsnoteRegisterUrl('http://shop.kidsnote.com/_manage/?body=product@product_register')).toBe(false);
    expect(isKidsnoteRegisterUrl('')).toBe(false);
  });

  it('우리 폼이 아니면 거절하고, 실제 사진 칸 셋 밖의 파일은 버린다', () => {
    expect(() => normalizeKidsnoteForm({ url: REGISTER_URL, formId: 'other' })).toThrow(/알 수 없는 폼/);
    expect(() => normalizeKidsnoteForm({ url: 'https://evil.example', formId: 'prdFrm' })).toThrow(/주소가 아닙니다/);
    expect(() => normalizeKidsnoteForm(null)).toThrow(/폼 데이터가 없습니다/);
    const form = normalizeKidsnoteForm(baseForm({
      fileUploads: [
        { name: 'upfile1', url: 'http://localhost:9000/kiditem/a.jpg' },
        { name: 'upfile9', url: 'http://localhost:9000/kiditem/b.jpg' },
        { name: 'prd_upfile1', url: 'http://localhost:9000/kiditem/c.jpg' },
      ],
    }));
    expect(form.fileUploads.map((upload) => upload.name)).toEqual(['upfile1']);
  });
});

describe('키즈노트 쓰기 절차(sites/kidsnote/registration.ts)', () => {
  function writer(answer: (message: Record<string, unknown>) => unknown, fetchOk = true) {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        if (!injected) return { ok: false, error: 'content_script_missing' };
        asked.push(message);
        return answer(message);
      },
    });
    const deps: SiteDeps = {
      tabs: fake.tabs,
      randomId: () => 'id',
      ...fastClock(),
      cookies: { async get() { return null; } },
      fetch: async () => (fetchOk ? new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }) : new Response('', { status: 404 })),
    };
    const router = siteFactoryFor('mall-write')!.create(deps, { tabId: null, credentials: null }) as { writer(mallKey: string): MallWriterHandle | null };
    return { fake, asked, handle: router.writer('kidsnote')! };
  }

  it('사진을 서비스워커가 읽어 채우기에 넘기고, 사람이 할 일을 그대로 돌려주며 누르지 않는다 — 탭은 운영자에게 남긴다', async () => {
    const { fake, asked, handle } = writer(() => ({ ok: true, value: { ok: true, steps: ['fields:3/3'], warnings: [] } }));

    const session = await handle.fill({ form: baseForm(), submit: true, expectedProviderAccountId: null });
    await session.done();

    expect(session.decision).toEqual({ press: false, skipped: 'no_verified_submit' });
    expect(session.fill).toEqual({ steps: ['fields:3/3'], warnings: [], manualSteps: ['중분류를 선택하세요.'], dialogs: [] });
    const args = asked[0]!.args as Record<string, any>;
    expect(asked[0]!.call).toBe('kidsnote.fill');
    expect(args.fields.field437).toBe('키링');
    expect(args.images).toEqual([{ name: 'upfile1', dataUrl: 'data:image/jpeg;base64,AQI=', fileName: 'rep.jpg' }]);
    expect(fake.log.filter((line) => /^(open|navigate|leave)/.test(line))).toEqual(['open about:blank', `navigate ${REGISTER_URL}`, 'leave 7']);
  });

  it('사진을 못 받았으면 빼고 채우되 까닭을 경고로 남긴다 — 조용히 사진 없이 등록하지 않는다', async () => {
    const { asked, handle } = writer(() => ({ ok: true, value: { ok: true, steps: [], warnings: [] } }), false);
    const session = await handle.fill({ form: baseForm(), submit: false, expectedProviderAccountId: null });
    expect(session.fill.warnings.join(' ')).toMatch(/이미지 다운로드 실패/);
    expect((asked[0]!.args as Record<string, unknown>).images).toEqual([]);
  });

  it('남의 주소를 가리키는 폼 지시는 탭을 열지 않고 거절한다', async () => {
    const { fake, handle } = writer(() => ({ ok: true, value: { ok: true } }));
    await expect(handle.fill({ form: baseForm({ url: 'https://evil.example/_manage/?body=product@product_register' }), submit: false, expectedProviderAccountId: null }))
      .rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    expect(fake.log.filter((line) => line.startsWith('open'))).toEqual([]);
  });
});

describe('키즈노트 페이지 처리기(content/page-call/kidsnote-register.js)', () => {
  const PAGE = `
<form id="prdFrm" name="prdFrm">
  <input name="name"><input name="sell_prc">
  <select name="fieldset"><option value="">선택</option><option value="1083">완구</option></select>
  <div id="notice"></div>
  <select name="big"><option value="">선택</option><option value="10">문구</option></select>
  <select name="mid"><option value="">선택</option></select>
  <input type="checkbox" name="auto_code">
  <input type="radio" name="ea_type" value="1"><input type="radio" name="ea_type" value="2" checked>
  <button type="submit">등록하기</button>
</form>`;

  function load() {
    const page = loadWritePage(PAGE, [guardSource, fillSource, kidsnoteSource]);
    const { document } = dom;
    // 고시 분류를 고르면 고시 칸이 늦게 생기고, 대분류를 고르면 중분류 목록이 늦게 온다.
    document.querySelector('[name=fieldset]').addEventListener('change', () => setTimeout(() => {
      document.querySelector('#notice').innerHTML = '<textarea name="field437"></textarea>';
    }, 1_000));
    document.querySelector('[name=big]').addEventListener('change', () => setTimeout(() => {
      document.querySelector('[name=mid]').innerHTML = '<option value="">선택</option><option value="20">팬시</option>';
    }, 1_000));
    return page;
  }

  it('고시 분류를 고른 뒤 생긴 고시 칸과 계단식 분류를 채우고, 등록 폼은 보내지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const payload = { ...normalizeKidsnoteForm(baseForm()), images: [], detailImages: [] };

    const outcome = await runPageCall(page, 'kidsnote.fill', payload);

    const { document } = dom;
    expect(outcome.ok).toBe(true);
    expect(document.querySelector('[name=field437]').value).toBe('키링');
    expect(document.querySelector('[name=mid]').value).toBe('20');
    expect(document.querySelector('[name=auto_code]').checked).toBe(true);
    expect(document.querySelector('[name=ea_type]:checked').value).toBe('1');
    expect(outcome.steps).toEqual(expect.arrayContaining(['fieldset:1083', 'category:big=10', 'category:mid=20']));
    expect(page.saves).toEqual([]);
  });

  it('등록 폼이 없으면(로그인이 풀렸다) noForm으로 답해 런타임이 그 탭에서 로그인한다', async () => {
    const page = loadWritePage('<div>로그인</div>', [guardSource, fillSource, kidsnoteSource]);
    await expect(runPageCall(page, 'kidsnote.fill', { ...normalizeKidsnoteForm(baseForm()), images: [], detailImages: [] }))
      .resolves.toMatchObject({ ok: false, noForm: true });
  });
});
