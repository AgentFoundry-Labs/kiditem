import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { amount, asRaw, digits, entriesOf, planInvalid, requireRaw, text } from '../mall-write/raw';
import { registerMallWriter } from '../mall-write/writer';
import { SSG_LOGIN, SSG_PAGE_GUARD } from './index';

export const SSG_REGISTER_FILE = 'content/page-call/ssg-register.js';

/**
 * 신세계 폼 값(옛 `normalizeSsgForm`). 번호(카테고리·배송비·주소지·고시 속성)는 숫자만 받는다 — 페이지 처리기가 그 번호로
 * 선택자를 만들기 때문이다. 글자가 섞이면 엉뚱한 요소를 집는다.
 */
export function normalizeSsgForm(value: unknown): Record<string, unknown> {
  const raw = requireRaw(value, '신세계 폼 데이터가 없습니다.');
  const category = (entry: unknown, label: string) => {
    const box = asRaw(entry);
    const id = digits(box.id);
    const keyword = text(box.keyword, 60).trim();
    if (!id || !keyword) throw planInvalid(`신세계 ${label}(번호·검색어)가 없습니다.`);
    return { id, keyword };
  };
  const notice = asRaw(raw.notice);
  const noticeValues: Record<string, string> = {};
  for (const [propId, entry] of entriesOf(notice.values)) {
    if (digits(propId) && entry !== null && entry !== undefined) noticeValues[propId] = text(entry, 1000);
  }
  const itemName = text(raw.itemName, 300).trim();
  if (!itemName) throw planInvalid('신세계 상품명이 없습니다.');
  const salePrice = amount(raw.salePrice);
  if (salePrice <= 0) throw planInvalid('신세계 판매가가 없습니다.');
  const shipping = asRaw(raw.shipping);
  return {
    itemName,
    brandName: text(raw.brandName, 60).trim(),
    siteNo: digits(raw.siteNo),
    displayCategory: category(raw.displayCategory, '전시카테고리'),
    standardCategory: category(raw.standardCategory, '표준분류'),
    salePrice,
    marginRate: amount(raw.marginRate),
    stock: amount(raw.stock),
    modelName: text(raw.modelName, 100).trim(),
    searchKeywords: text(raw.searchKeywords, 500).trim(),
    adultTypeCode: digits(raw.adultTypeCode) || '90',
    returnExchangeButton: raw.returnExchangeButton === 'N' ? 'N' : 'Y',
    notice: {
      classId: digits(notice.classId),
      values: noticeValues,
      importPropId: digits(notice.importPropId),
      importYn: notice.importYn === 'N' ? 'N' : 'Y',
    },
    manufacturer: text(raw.manufacturer, 100).trim(),
    originCountry: text(raw.originCountry, 40).trim(),
    shipping: {
      leadDays: amount(shipping.leadDays),
      outboundAddrId: digits(shipping.outboundAddrId),
      returnAddrId: digits(shipping.returnAddrId),
      fees: (Array.isArray(shipping.fees) ? shipping.fees : [])
        .map((entry) => {
          const fee = asRaw(entry);
          return { divCd: digits(fee.divCd), typeCd: digits(fee.typeCd), prepayCd: digits(fee.prepayCd), unitCd: digits(fee.unitCd), feeId: digits(fee.feeId) };
        })
        .filter((fee) => fee.feeId),
    },
  };
}

/**
 * 신세계 파트너오피스(`po.ssgadm.com`) 상품 등록(옛 SPECS `ssg` 줄, 실측 2026-09-14). 메인(`main.ssg`)은 탭 껍데기고 폼은
 * `/cp/item/item/itemNew.ssg`다 — 바로 열어도 온전하다. Vue 2 + jQuery + dhtmlx 화면이라 전용 처리기(`ssg-register.js`)로
 * 채운다: `<form>`이 없고, 검증을 alert으로 띄우며, 판매사이트 → 전시카테고리 → 표준분류를 골라야 가격 칸이 그려지고, 가격은
 * dhtmlx 그리드이며, 전시 시작일이 과거면 저장이 막힌다(몇 시간 뒤 정각으로 넣는다). 이미지·상세는 몰 서버에 올린다.
 * 저장(`goSave`)은 부르지 않는다.
 */
export const SSG_REGISTRATION_FORM: MallFormSpec = {
  label: '신세계',
  origin: 'https://po.ssgadm.com',
  pathPrefix: '/cp/item/item/itemNew.ssg',
  // ⚠️ 같은 주소에 `?srcItemId=`·`?itemId=`가 붙으면 기존 상품 수정 화면이다 — 쿼리는 받지 않는다.
  noQuery: true,
  formSelector: '#content',
  imageSlots: [],
  dedicated: {
    file: SSG_REGISTER_FILE,
    call: 'ssg.fill',
    imageGroupKey: 'ssg',
    formKey: 'ssg',
    normalize: normalizeSsgForm,
    options: {
      maxImages: 10,
      // 채운 시각 + 이만큼 뒤 정각을 전시 시작으로 넣는다. 사람이 그 전에 저장해야 한다.
      displayStartDelayHours: 3,
      formWaitMs: 30_000,
      // 칸 하나가 화면에 반응(서제스트 목록·다음 셀렉트·업로드)할 때까지 기다리는 시간.
      stepWaitMs: 8_000,
      // 에디터 이미지 업로드. 응답 `{uploadPath}`가 이미지 주소다(Synap 규약).
      detailUpload: { endpoint: '/upload/0/synapEditorUpload.ssg', field: 'file' },
    },
  },
  // 상세 이미지를 File로 받아 와야 몰 업로드에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'ssg',
  displayName: '신세계',
  guard: registrationGuard(SSG_PAGE_GUARD, '신세계'),
  dialogHosts: ['po.ssgadm.com'],
  login: SSG_LOGIN,
  form: SSG_REGISTRATION_FORM,
});
