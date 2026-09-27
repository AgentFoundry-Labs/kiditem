import { describe, expect, it } from 'vitest';
import { fastClock } from '../login.fake';
import type { MallWriterHandle } from '../mall-write';
import '../mall-write';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import './registration';
import './thumbnail';

// 쿠팡 WING 대표이미지 바꾸기(KID-256): 몰 쓰기 라우터 경계에서 본다. 가짜는 탭 경계(페이지 호출의 답)뿐이다.
const FORM_V2 = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';
const IMAGE = { dataUrl: 'data:image/png;base64,AAAA', filename: 'thumb.png', mimeType: 'image/png' };
type Answer = Record<string, unknown>;

function wing(answer: (message: Answer) => unknown) {
  const asked: Answer[] = [];
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
    fetch: async () => new Response(''),
  };
  const router = siteFactoryFor('mall-write')!.create(deps, { tabId: null, credentials: null }) as { writer(mallKey: string): MallWriterHandle | null };
  return { fake, asked, handle: router.writer('coupang')! };
}

const uploads = (message: Answer) => {
  if (message.call === 'availability.wingIdentityOnPage') return { ok: true, value: { ok: true, vendorId: 'A00012345' } };
  if (message.call === 'wingThumb.findEdit') return { ok: true, value: { ok: true, editUrl: `${FORM_V2}?vendorInventoryId=15966710321` } };
  if (message.call === 'wingThumb.upload') return { ok: true, value: { ok: true, steps: ['원래 대표이미지 지우기', '새 대표이미지 올리기'] } };
  return { ok: false, error: 'unexpected' };
};

describe('쿠팡 WING 대표이미지(sites/wing/thumbnail.ts)', () => {
  it('등록상품ID가 있으면 수정 화면을 호환 스크립트와 함께 바로 열고, 계정을 대조한 뒤 사진을 올린다 — [저장]은 누르지 않고 탭을 남긴다', async () => {
    const { fake, asked, handle } = wing(uploads);
    const session = await handle.thumbnail!({ externalListingId: '15966710321', productName: '말랑 키링', expectedProviderAccountId: 'A00012345', image: IMAGE });
    expect(fake.log.filter((line) => line.startsWith('navigate '))).toEqual([
      `navigate ${FORM_V2}?vendorInventoryId=15966710321 (bootstrap content/page-call/wing-form-compat.js)`,
    ]);
    expect(asked.map((message) => message.call)).toEqual(['availability.wingIdentityOnPage', 'wingThumb.upload']);
    expect(asked[1]!.args).toEqual({ productName: '말랑 키링', image: IMAGE });
    expect(session).toMatchObject({
      fill: { steps: ['원래 대표이미지 지우기', '새 대표이미지 올리기'], manualSteps: ['열린 쿠팡 윙 수정 화면에서 [저장]을 눌러 주세요.'] },
      providerAccountId: 'A00012345',
      observedUrl: FORM_V2,
    });
    await session.done();
    expect(fake.log).toContain('leave 7');
    expect(fake.log).not.toContain('close 7');
  });

  it('등록상품ID가 없으면 상품명으로 검색한 목록에서 [수정] 주소를 읽어(누르지 않고) 수정 화면을 연다', async () => {
    const { fake, asked, handle } = wing(uploads);
    await handle.thumbnail!({ externalListingId: null, productName: '말랑 키링', expectedProviderAccountId: null, image: IMAGE });
    const opened = fake.log.filter((line) => line.startsWith('navigate '));
    expect(opened[0]).toContain('vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=%EB%A7%90%EB%9E%91%20%ED%82%A4%EB%A7%81');
    expect(opened[1]).toBe(`navigate ${FORM_V2}?vendorInventoryId=15966710321 (bootstrap content/page-call/wing-form-compat.js)`);
    expect(asked.map((message) => message.call)).toEqual(['wingThumb.findEdit', 'wingThumb.upload']);
  });

  it('화면 계정이 다르면 올리지 않는다 · 올리기가 실패하면 REGISTRATION_FILL_FAILED로 탭을 남긴다', async () => {
    const other = wing((message) => (message.call === 'availability.wingIdentityOnPage' ? { ok: true, value: { ok: false, vendorId: 'B999' } } : uploads(message)));
    await expect(other.handle.thumbnail!({ externalListingId: '15966710321', productName: '말랑 키링', expectedProviderAccountId: 'A00012345', image: IMAGE }))
      .rejects.toMatchObject({ code: 'REGISTRATION_ACCOUNT_MISMATCH' });
    expect(other.asked.map((message) => message.call)).toEqual(['availability.wingIdentityOnPage']);

    const broken = wing((message) => (message.call === 'wingThumb.upload' ? { ok: true, value: { ok: false, error: '상품명 불일치: 다른 상품' } } : uploads(message)));
    await expect(broken.handle.thumbnail!({ externalListingId: '15966710321', productName: '말랑 키링', expectedProviderAccountId: null, image: IMAGE }))
      .rejects.toMatchObject({ code: 'REGISTRATION_FILL_FAILED', message: '상품명 불일치: 다른 상품' });
    expect(broken.fake.log).toContain('leave 7');
  });
});
