import { RuntimeError } from '../../core/errors';
import { AVAILABILITY_FILE } from '../mall-write/availability';
import { RUNTIME_PLAN_INVALID } from '../mall-write/form';
import { REGISTRATION_FILL_FAILED } from '../mall-write/form-register';
import { openWriteTab } from '../mall-write/write-tab';
import { registerMallThumbnail, type MallThumbnailInput, type MallThumbnailSession, type MallWriteContext } from '../mall-write/writer';
import { callPage } from '../page-call';
import { WING_COMPAT_FILE, WING_IDENTITY_FILE } from './registration';

/**
 * 쿠팡 윙 대표이미지 바꾸기(KID-256 — 옛 `background/coupang/worker.js` `registerRepresentativeImage` + `content/coupang/
 * wing-thumbnail-register.js` 이식). 상품 수정 화면(formV2)을 쓰기 탭으로 열어 대표이미지 칸의 원래 사진을 지우고 새 사진을
 * 올린다. [저장]은 누르지 않는다 — 올린 화면을 운영자가 보고 저장한다(탭은 남긴다).
 *
 *  - 등록상품ID를 알면 수정 화면(`formV2?vendorInventoryId=`)을 바로 연다. 모르면 상품명으로 검색한 상품목록에서 그 줄의 [수정]
 *    주소를 읽어 연다(누르지 않는다). 수정 화면은 등록과 같은 런타임 호환 파일을 새 문서 스크립트로 먼저 건다.
 *  - 실행에 판매자 계정이 있으면 올리기 전에 화면의 업체코드를 대조한다 — 다른 계정의 상품에는 올리지 않는다.
 *  - 등록상품명이 다르면 다른 상품의 화면이다 — 올리지 않는다.
 */
const WING_ORIGIN = 'https://wing.coupang.com';
const WING_FORM_URL = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';
export const WING_THUMBNAIL_FILE = 'content/page-call/wing-thumbnail.js';
const FIND_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 3 * 60_000;
const IDENTITY_TIMEOUT_MS = 15_000;
const VENDOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export function wingProductSearchUrl(productName: string): string {
  return `${WING_ORIGIN}/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}`
    + '&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';
}

type FindAnswer = { ok?: boolean; editUrl?: string; error?: string };
type UploadAnswer = { ok?: boolean; steps?: string[]; error?: string };

function failed(message: string, stage: string): RuntimeError {
  return new RuntimeError(REGISTRATION_FILL_FAILED, message, { mallKey: 'coupang', stage });
}

/** 등록상품ID로 수정 화면 주소를 짓거나, 모르면 상품목록에서 그 상품의 [수정] 주소를 읽는다. */
async function editUrlOf(context: MallWriteContext, input: MallThumbnailInput): Promise<string> {
  const id = input.externalListingId?.trim() ?? '';
  if (/^\d{6,}$/.test(id)) return `${WING_FORM_URL}?vendorInventoryId=${id}`;
  if (!input.productName.trim()) throw new RuntimeError(RUNTIME_PLAN_INVALID, '대표이미지를 바꿀 쿠팡 윙 상품을 찾을 이름이 없습니다.', { mallKey: 'coupang' });
  const list = await openWriteTab(context, wingProductSearchUrl(input.productName), { signIn: context.signIn, dialogHosts: ['wing.coupang.com'] });
  let found: FindAnswer | null = null;
  try {
    found = await list.run((page) => callPage<FindAnswer>(page, 'wingThumb.findEdit', { productName: input.productName }, {
      timeoutMs: FIND_TIMEOUT_MS,
      guard: context.guard,
      isolated: [WING_THUMBNAIL_FILE],
      displayName: context.displayName,
    }));
    if (found?.ok !== true || !found.editUrl) throw failed(found?.error ?? '쿠팡 윙 상품 수정 화면을 찾지 못했습니다.', 'find_edit');
    const url = new URL(found.editUrl, WING_ORIGIN);
    if (url.origin !== WING_ORIGIN) throw failed('쿠팡 윙 밖의 수정 화면 주소라 열지 않았습니다.', 'find_edit');
    return url.href;
  } finally {
    // 찾기만 한 목록 탭은 찾았으면 닫는다(수정 화면은 새 쓰기 탭으로 연다). 못 찾았으면 운영자가 보게 남긴다.
    if (found?.ok === true) await list.page.close().catch(() => undefined);
    await list.done();
  }
}

async function updateWingThumbnail(context: MallWriteContext, input: MallThumbnailInput): Promise<MallThumbnailSession> {
  if (!input.image.dataUrl.startsWith('data:image/')) {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, '대표이미지 데이터가 없습니다.', { mallKey: 'coupang' });
  }
  const expected = input.expectedProviderAccountId?.trim() ?? '';
  if (expected && !VENDOR_ID.test(expected)) {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, '쿠팡 윙 판매자 식별자가 올바르지 않습니다.', { mallKey: 'coupang', reason: 'provider_account' });
  }
  const url = await editUrlOf(context, input);
  const tab = await openWriteTab(context, url, { signIn: context.signIn, dialogHosts: ['wing.coupang.com'], bootstrapFile: WING_COMPAT_FILE });
  try {
    const uploaded = await tab.run(async (page) => {
      let providerAccountId: string | null = null;
      if (expected) {
        const identity = await callPage<{ ok?: boolean; vendorId?: string }>(page, 'availability.wingIdentityOnPage', [expected], {
          timeoutMs: IDENTITY_TIMEOUT_MS,
          guard: context.guard,
          isolated: [WING_IDENTITY_FILE, AVAILABILITY_FILE],
          displayName: context.displayName,
        });
        if (identity?.ok !== true || identity.vendorId !== expected) {
          throw new RuntimeError('REGISTRATION_ACCOUNT_MISMATCH', '쿠팡 윙에 로그인된 판매자 계정을 확인하지 못했거나 실행할 계정과 다릅니다. 열린 탭의 계정을 확인해 주세요.', { mallKey: 'coupang' });
        }
        providerAccountId = identity.vendorId;
      }
      const answer = await callPage<UploadAnswer>(page, 'wingThumb.upload', { productName: input.productName, image: input.image }, {
        timeoutMs: UPLOAD_TIMEOUT_MS,
        guard: context.guard,
        isolated: [WING_THUMBNAIL_FILE],
        displayName: context.displayName,
      });
      if (answer?.ok !== true) throw failed(answer?.error ?? '쿠팡 윙 대표이미지를 올리지 못했습니다.', 'upload');
      return { steps: answer.steps ?? [], providerAccountId };
    });
    const observed = await tab.page.currentUrl().catch(() => null);
    return {
      fill: { steps: uploaded.steps, warnings: [], manualSteps: ['열린 쿠팡 윙 수정 화면에서 [저장]을 눌러 주세요.'], dialogs: [] },
      providerAccountId: uploaded.providerAccountId,
      observedUrl: observed ? observed.split(/[?#]/)[0]! : null,
      done: () => tab.done(),
    };
  } catch (error) {
    await tab.done();
    throw error;
  }
}

registerMallThumbnail('coupang', updateWingThumbnail);
