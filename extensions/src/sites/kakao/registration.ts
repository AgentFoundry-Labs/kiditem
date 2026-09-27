import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { amount, asRaw, entriesOf, planInvalid, requireRaw } from '../mall-write/raw';
import { registerMallWriter } from '../mall-write/writer';
import { KAKAO_LISTINGS_GUARD } from './listings';

export const KAKAO_REGISTER_FILE = 'content/page-call/kakao-register.js';

/**
 * 카카오 톡스토어 폼 값(옛 `normalizeKakaoForm`). 상품명은 화면이 70자(글자 수)에서 자른다. 카테고리 코드는 세 자리씩 단계가
 * 붙는 숫자다(`102106101109`). 비면 AI 추천을 고른다. 고시 값은 화면 줄 제목(앞부분) → 값이다.
 */
export function normalizeKakaoForm(value: unknown): Record<string, unknown> {
  const raw = requireRaw(value, '카카오 톡스토어 폼 데이터가 없습니다.');
  const text = (entry: unknown, max = 1000) => (entry === null || entry === undefined ? '' : String(entry)).replace(/\s+/g, ' ').trim().slice(0, max);

  const productName = [...text(raw.productName, 400).replace(/[<>]/g, '')].slice(0, 70).join('').trim();
  if (!productName) throw planInvalid('카카오 톡스토어 상품명이 없습니다.');
  const salePrice = amount(raw.salePrice);
  if (salePrice <= 0) throw planInvalid('카카오 톡스토어 판매가가 없습니다.');
  const categoryText = String(raw.categoryId ?? '').trim();
  const categoryId = /^\d{9,15}$/.test(categoryText) && categoryText.length % 3 === 0 ? categoryText : '';
  const stock = amount(raw.stock);

  const originTypes = ['국내산', '수입산', '혼합', '기타'];
  const origin = asRaw(raw.origin);
  const originType = originTypes.includes(text(origin.type, 10)) ? text(origin.type, 10) : '수입산';
  const cert = asRaw(raw.cert);
  const certNumber = text(cert.number, 60);
  const notice = asRaw(raw.notice);
  const noticeValues: Record<string, string> = {};
  for (const [label, entry] of entriesOf(notice.values)) {
    const key = text(label, 60);
    const noticeValue = text(entry, 500);
    if (key && noticeValue) noticeValues[key] = noticeValue;
  }
  return {
    productName,
    categoryId,
    salePrice,
    stock: stock >= 1 ? Math.min(stock, 99_999) : 999,
    origin: {
      type: originType,
      region: originType === '수입산' ? text(origin.region, 20) : '',
      country: originType === '수입산' ? text(origin.country, 30) : '',
    },
    cert: /^[A-Za-z0-9-]{4,40}$/.test(certNumber) ? { type: text(cert.type, 40) || '[어린이제품] 안전확인', number: certNumber } : null,
    notice: { group: text(notice.group, 40) || '어린이제품', values: noticeValues },
    deliveryTemplate: text(raw.deliveryTemplate, 60),
    brand: text(raw.brand, 30),
    manufacturer: text(raw.manufacturer, 30),
    sellerCode: text(raw.sellerCode, 50),
    affiliate: raw.affiliate === true,
  };
}

/**
 * 카카오 톡스토어 판매자센터(`shopping-seller.kakao.com`) 상품 등록(옛 SPECS `kakao` 줄, 실측 2026-09-18). Angular 20 운영
 * 빌드라 폼 객체에 닿지 않는다 — 칸마다 컴포넌트(`formcontrolname`)가 있어 사람처럼 채운다: 글자는 치고, 목록(`cu-dropdown`)은
 * 펼쳐 고르고, 사진은 파일 칸에 넣는다. 카테고리를 골라야 원산지·부가세·인증 칸이 생기고, 고시는 설정 창에서 상품군을 골라
 * 그 창의 [확인]으로 폼에 넣는다(상품 [저장하기]가 아니다). 같은 화면이 `/modify/<번호>`로 판매중 상품을 연다. [저장하기]·
 * [상품정보 임시저장]은 누르지 않는다. 로그인 폼 명세가 없는 몰이라 카카오 로그인으로 넘어가면 멈춘다.
 */
export const KAKAO_REGISTRATION_FORM: MallFormSpec = {
  label: '카카오 톡스토어',
  origin: 'https://shopping-seller.kakao.com',
  pathPrefix: '/product/store-seller/insert',
  exactPath: true,
  noQuery: true,
  formSelector: 'form',
  imageSlots: [],
  dedicated: {
    file: KAKAO_REGISTER_FILE,
    call: 'kakao.fill',
    // 대표 1 + 추가 5.
    imageGroupKey: 'kakao',
    formKey: 'kakao',
    normalize: normalizeKakaoForm,
    options: {
      maxImages: 6,
      formWaitMs: 40_000,
      // 칸 하나(추천 카테고리·다음 목록·사진 업로드·KC 조회)가 반응할 때까지 기다리는 시간.
      stepWaitMs: 12_000,
    },
  },
  // 상세 이미지를 File로 받아 와야 편집기 업로드로 톡스토어에 올릴 수 있다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'kakao',
  displayName: '카카오 톡스토어',
  guard: registrationGuard(KAKAO_LISTINGS_GUARD, '카카오 톡스토어'),
  dialogHosts: ['shopping-seller.kakao.com'],
  form: KAKAO_REGISTRATION_FORM,
});
