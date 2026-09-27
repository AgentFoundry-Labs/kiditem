import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { amount, asRaw, code, cutBytes, digits, entriesOf, planInvalid, requireRaw, text } from '../mall-write/raw';
import { registerMallWriter } from '../mall-write/writer';
import { GS_SHOP_LOGIN, GS_SHOP_PAGE_GUARD } from './index';

export const GS_SHOP_REGISTER_FILE = 'content/page-call/gs-shop-register.js';

/** GS샵 화면의 글자 수(한글 2 · 영숫자 1 바이트). */
const gsBytes = (entry: string) => [...entry].reduce((sum, char) => sum + (/^[\x00-\x7f]$/.test(char) ? 1 : 2), 0);

/**
 * GS샵 폼 값(옛 `normalizeGsshopForm`). 글자 수는 화면과 같이 바이트로 센다 — 노출상품명 160, 송장상품명 30, 모델명 60. 넘으면
 * 저장할 때 화면이 막고, 어떤 칸은 값을 지운다.
 */
export function normalizeGsshopForm(value: unknown): Record<string, unknown> {
  const raw = requireRaw(value, 'GS샵 폼 데이터가 없습니다.');
  const trimmed = (entry: unknown, max = 1000) => text(entry).trim().slice(0, max);
  const category = code(raw.category, /^[A-Z]\d{8}$/);
  if (!category) throw planInvalid('GS샵 상품분류 코드(예: B35012701)가 없습니다.');
  const sectionId = digits(raw.sectionId);
  if (!sectionId) throw planInvalid('GS샵 전시 카테고리 번호가 없습니다.');
  const supplierProductCode = code(raw.supplierProductCode, /^[A-Za-z0-9\-_()]{1,20}$/);
  if (!supplierProductCode) throw planInvalid('GS샵 협력사 상품코드는 영문·숫자·-_() 20자 이내여야 합니다.');
  // 화면이 막는 글자: 노출상품명 `" < > | \ ? *`, 송장상품명 `: " < > | \ '`(? * 는 공백으로 바뀐다).
  const exposureName = cutBytes(trimmed(raw.exposureName, 400).replace(/["<>|\\?*]/g, '').replace(/\s+/g, ' '), 160, gsBytes);
  const invoiceName = cutBytes(trimmed(raw.invoiceName, 200).replace(/[:"<>|\\']/g, '').replace(/[?*]/g, ' ').replace(/\s+/g, ' '), 30, gsBytes);
  if (!exposureName || !invoiceName) throw planInvalid('GS샵 노출상품명·송장상품명이 없습니다.');
  const salePrice = amount(raw.salePrice);
  if (salePrice <= 0) throw planInvalid('GS샵 판매가가 없습니다.');
  const marginRate = amount(raw.marginRate);
  const brand = asRaw(raw.brand);
  const brandCode = digits(brand.code);
  if (!brandCode) throw planInvalid('GS샵 브랜드 코드가 없습니다.');

  const delivery = asRaw(raw.delivery);
  const remote = asRaw(delivery.remote);
  const notice = asRaw(raw.notice);
  const noticeValues: Record<string, string> = {};
  for (const [itemCode, entry] of entriesOf(notice.values)) {
    if (digits(itemCode) && entry !== null && entry !== undefined) noticeValues[itemCode] = trimmed(entry, 1000);
  }
  const composition = asRaw(raw.composition);
  return {
    category,
    sectionId,
    supplierProductCode,
    mdId: digits(raw.mdId),
    employeeNo: digits(raw.employeeNo),
    exposureName,
    invoiceName,
    brand: { code: brandCode, name: trimmed(brand.name, 60) },
    modelName: cutBytes(trimmed(raw.modelName, 200), 60, gsBytes),
    composition: {
      content: trimmed(composition.content, 200),
      packageCount: Math.max(1, amount(composition.packageCount)),
      maker: trimmed(composition.maker, 60),
      origin: trimmed(composition.origin, 40),
    },
    salePrice,
    marginRate: marginRate > 0 && marginRate < 100 ? marginRate : 0,
    delivery: {
      courier: code(delivery.courier, /^[A-Z0-9]{2,4}$/),
      convenienceReturn: delivery.convenienceReturn === 'Y' ? 'Y' : 'N',
      fee: amount(delivery.fee),
      freeOver: amount(delivery.freeOver),
      returnFee: amount(delivery.returnFee),
      exchangeFee: amount(delivery.exchangeFee),
      remote: { fee: amount(remote.fee), returnFee: amount(remote.returnFee), exchangeFee: amount(remote.exchangeFee) },
      refundType: delivery.refundType === '20' ? '20' : '10',
      shipAddress: code(delivery.shipAddress, /^\d{4}$/),
      returnAddress: code(delivery.returnAddress, /^\d{4}$/),
      bundle: code(delivery.bundle, /^[A-Z]\d{2}$/),
      weight: code(delivery.weight, /^A\d{2}$/),
      length: code(delivery.length, /^B\d{2}$/),
    },
    stock: amount(raw.stock),
    safeStock: amount(raw.safeStock),
    notice: { groupCode: digits(notice.groupCode), values: noticeValues },
  };
}

/**
 * GS SHOP 파트너스(`partners.gsshop.com`) 상품 등록(옛 SPECS `gs-shop` 줄, 실측 2026-09-14). React + MUI 화면이고 폼 상태는
 * zustand 저장소 하나(`product-store`)다. 칸마다 화면이 부르는 처리 함수(`baseInfo.onChangePrdNm` 등)를 사람이 누른 것처럼
 * 부른다 — 분류를 고르면 고시·과세·안전인증이 따라 바뀌는 연쇄도 화면이 스스로 돈다. 사진은 사진 칸 처리(`imgInfo.uploadPrdImg`),
 * 기술서 사진은 편집기 임시 업로드로 GS 서버에 올린다. `임시저장`·`전체저장`은 부르지 않는다.
 */
export const GS_SHOP_REGISTRATION_FORM: MallFormSpec = {
  label: 'GS샵',
  origin: 'https://partners.gsshop.com',
  pathPrefix: '/product/products/create',
  // 같은 화면이 `/update/<번호>`·`/copy/<번호>`로도 열린다. 등록 주소와 정확히 같아야 받는다.
  exactPath: true,
  noQuery: true,
  formSelector: 'body',
  imageSlots: [],
  dedicated: {
    file: GS_SHOP_REGISTER_FILE,
    call: 'gsshop.fill',
    // 대표 1 + 추가 7.
    imageGroupKey: 'gsshop',
    formKey: 'gsshop',
    normalize: normalizeGsshopForm,
    options: {
      maxImages: 8,
      formWaitMs: 40_000,
      // 처리 함수 하나(분류 연쇄·담당MD 수수료 조회 등)가 끝날 때까지 기다리는 시간.
      stepWaitMs: 15_000,
    },
  },
  // 상세 이미지를 File로 받아 와야 GS 편집기 업로드에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'gs-shop',
  displayName: 'GS샵',
  guard: registrationGuard(GS_SHOP_PAGE_GUARD, 'GS샵'),
  dialogHosts: ['partners.gsshop.com'],
  login: GS_SHOP_LOGIN,
  form: GS_SHOP_REGISTRATION_FORM,
});
