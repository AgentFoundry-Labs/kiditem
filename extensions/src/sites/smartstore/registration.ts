import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { amount, asRaw, digits, planInvalid, requireRaw, text } from '../mall-write/raw';
import { registerMallWriter } from '../mall-write/writer';
import { SMARTSTORE_LISTINGS_GUARD } from './listings';

export const SMARTSTORE_REGISTER_FILE = 'content/page-call/smartstore-register.js';

/**
 * 스마트스토어 폼 값(옛 `normalizeSmartstoreForm`). 번호(카테고리·원산지·인증)는 숫자만, 코드(원산지 구분·고시 분류)는 대문자만
 * 받는다 — 페이지 처리기가 그 값으로 selectize 옵션을 찾는다.
 */
export function normalizeSmartstoreForm(value: unknown): Record<string, unknown> {
  const raw = requireRaw(value, '스마트스토어 폼 데이터가 없습니다.');
  const code = (entry: unknown) => (/^[A-Z_]+$/.test(String(entry ?? '')) ? String(entry) : '');
  // 네이버가 상품명·모델명·태그에서 막는 글자(`\ * ? " < >`). 들어가면 저장이 거절된다.
  const clean = (entry: unknown, max: number) => text(entry, 1000).trim().replace(/[\\*?"<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  // 태그 상한은 UTF-8 30바이트다(한글 10자 · 영문 30자). 넘으면 화면이 안내창을 띄우고 버린다.
  const utf8Length = (entry: string) => new TextEncoder().encode(entry).length;

  const category = asRaw(raw.category);
  const categoryId = digits(category.id);
  const categoryKeyword = text(category.keyword, 60).trim();
  if (!categoryId || !categoryKeyword) throw planInvalid('스마트스토어 카테고리(번호·검색어)가 없습니다.');
  const productName = clean(raw.productName, 100);
  if (!productName) throw planInvalid('스마트스토어 상품명이 없습니다.');
  const salePrice = amount(raw.salePrice);
  if (salePrice <= 0) throw planInvalid('스마트스토어 판매가가 없습니다.');
  const discountWon = amount(raw.discountWon);

  // 인증기관·인증일자는 우리가 모른다(번호만 안다). 사람이 제품안전정보센터에서 보고 넣는다.
  const cert = asRaw(raw.childCert);
  const childCert = digits(cert.certId) && clean(cert.number, 60)
    ? { certId: digits(cert.certId), number: clean(cert.number, 60), companyName: text(cert.companyName, 60).trim() }
    : null;
  const rawOrigin = asRaw(raw.origin);
  const origin = code(rawOrigin.exposureType)
    ? { exposureType: code(rawOrigin.exposureType), firstSub: digits(rawOrigin.firstSub), secondSub: digits(rawOrigin.secondSub), importer: text(rawOrigin.importer, 60).trim() }
    : null;
  const tags: string[] = [];
  for (const entry of Array.isArray(raw.tags) ? raw.tags : []) {
    const tag = clean(entry, 30).replace(/\s+/g, '');
    if (!tag || tags.includes(tag) || utf8Length(tag) > 30) continue;
    tags.push(tag);
    if (tags.length >= 10) break;
  }
  const notice = asRaw(raw.notice);
  return {
    category: { id: categoryId, keyword: categoryKeyword },
    productName,
    salePrice,
    // 즉시할인은 판매가보다 작아야 한다. 아니면 할인 없이 넣는다.
    discountWon: discountWon > 0 && discountWon < salePrice ? discountWon : 0,
    stock: amount(raw.stock),
    modelName: clean(raw.modelName, 100),
    brandName: clean(raw.brandName, 50),
    manufacturerName: clean(raw.manufacturerName, 50),
    origin,
    childCert,
    notice: {
      type: code(notice.type) || 'ETC',
      itemName: text(notice.itemName, 200).trim(),
      modelName: text(notice.modelName, 200).trim(),
      certificateDetails: text(notice.certificateDetails, 500).trim(),
      manufacturer: text(notice.manufacturer, 100).trim(),
      afterServiceDirector: text(notice.afterServiceDirector, 100).trim(),
    },
    tags,
  };
}

/**
 * 네이버 스마트스토어센터(`sell.smartstore.naver.com`) 상품 등록(옛 SPECS `smartstore` 줄, 실측 2026-09-14). AngularJS 1.6 한
 * 화면이라 전용 처리기(`smartstore-register.js`)로 채운다: 해시 라우트(`#/products/create`가 새 등록, `#/products/edit/<번호>`는
 * 판매중 상품 수정), 카테고리·브랜드·원산지·인증·고시 분류·태그가 selectize, 접힌 섹션은 펼쳐야 칸이 그려지고, 화면을 열면
 * `이전에 작성하던 내용` 확인창이 뜰 수 있다(확인하면 옛 내용이 새 값을 덮는다 → 취소). 사진은 `이미지 등록 → 내 사진`에
 * 파일을 넣고, 상세는 네이버 사진 업로드 서비스로 올려 `HTML 작성`에 넣는다. `저장하기`·`임시저장`은 누르지 않는다.
 * 로그인 폼 명세가 없는 몰이라 네이버 로그인으로 넘어가면 멈추고 운영자가 그 탭에서 로그인한다.
 */
export const SMARTSTORE_REGISTRATION_FORM: MallFormSpec = {
  label: '스마트스토어',
  origin: 'https://sell.smartstore.naver.com',
  pathPrefix: '/',
  // 등록과 수정이 같은 문서의 해시만 다르다. 해시까지 똑같아야 받는다.
  hash: '#/products/create',
  noQuery: true,
  formSelector: 'form[name="vm.productForm"]',
  imageSlots: [],
  dedicated: {
    file: SMARTSTORE_REGISTER_FILE,
    call: 'smartstore.fill',
    // 첫 장이 대표이미지, 나머지가 추가이미지(최대 9장)다.
    imageGroupKey: 'smartstore',
    formKey: 'smartstore',
    normalize: normalizeSmartstoreForm,
    options: {
      maxExtraImages: 9,
      formWaitMs: 40_000,
      // 칸 하나가 반응(검색 목록·다음 selectize·창 열림)할 때까지 기다리는 시간.
      stepWaitMs: 10_000,
      // 사진을 넣은 뒤 화면이 네이버 사진 서버에 다 올리고 창을 닫을 때까지.
      imageWaitMs: 60_000,
    },
  },
  // 상세 이미지를 File로 받아 와야 네이버 사진 서버에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'smartstore',
  displayName: '스마트스토어',
  guard: registrationGuard(SMARTSTORE_LISTINGS_GUARD, '스마트스토어'),
  dialogHosts: ['sell.smartstore.naver.com'],
  form: SMARTSTORE_REGISTRATION_FORM,
});
