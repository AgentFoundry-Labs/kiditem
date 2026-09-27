import type { MallFormSpec } from '../mall-write/form';
import { registrationGuard } from '../mall-write/guard';
import { amount, asRaw, code, cutBytes, digits, entriesOf, planInvalid, requireRaw, text } from '../mall-write/raw';
import { registerMallWriter } from '../mall-write/writer';
import { LOTTE_ON_LOGIN, LOTTE_ON_PAGE_GUARD } from './index';

export const LOTTE_ON_REGISTER_FILE = 'content/page-call/lotte-on-register.js';

const encoder = new TextEncoder();
const utf8Bytes = (entry: string) => encoder.encode(entry).length;

/**
 * 롯데ON 폼 값(옛 `normalizeLotteonForm`). 글자 수는 화면(`WebSquare.util.getStringByteSize`)과 같이 UTF-8 바이트로 센다
 * (한글 3) — 상품명 150, 판매자내부상품번호 30. 모델명은 화면이 영문·숫자·`-_+/.`만 받는다.
 */
export function normalizeLotteonForm(value: unknown): Record<string, unknown> {
  const raw = requireRaw(value, '롯데ON 폼 데이터가 없습니다.');
  const trimmed = (entry: unknown, max = 1000) => text(entry).trim().slice(0, max);
  const category = code(String(raw.category ?? '').trim().toUpperCase(), /^BC\d{8}$/);
  if (!category) throw planInvalid('롯데ON 표준카테고리 코드(예: BC55031100)가 없습니다.');
  const productName = cutBytes(trimmed(raw.productName, 400).replace(/[<>]/g, '').replace(/\s+/g, ' '), 150, utf8Bytes);
  if (!productName) throw planInvalid('롯데ON 판매자상품명이 없습니다.');
  const salePrice = amount(raw.salePrice);
  if (salePrice <= 0) throw planInvalid('롯데ON 판매가가 없습니다.');
  const origin = asRaw(raw.origin);
  const domestic = origin.typeCode === 'DMST';
  const delivery = asRaw(raw.delivery);
  const notice = asRaw(raw.notice);
  const noticeValues: Record<string, string> = {};
  for (const [itemCode, entry] of entriesOf(notice.values)) {
    if (/^\d{4}$/.test(itemCode) && entry !== null && entry !== undefined) noticeValues[itemCode] = trimmed(entry, 1000);
  }
  const purchase = asRaw(raw.purchase);
  const maxQty = amount(purchase.maxQty);
  const periodDays = amount(purchase.periodDays);
  return {
    category,
    productName,
    salePrice,
    stockManaged: raw.stockManaged === true,
    stock: amount(raw.stock),
    modelNo: code(String(raw.modelNo ?? '').replace(/\s/g, ''), /^[A-Za-z0-9\-_+/.]{1,40}$/),
    maker: trimmed(raw.maker, 30),
    origin: domestic
      ? { typeCode: 'DMST', code: 'KR' }
      : { typeCode: 'OVS', code: code(String(origin.code ?? '').toUpperCase(), /^[A-Z]{2}$/) || 'CN' },
    notice: { groupCode: code(notice.groupCode, /^\d{1,3}$/), values: noticeValues },
    delivery: {
      costPolicy: digits(delivery.costPolicy),
      extraCostPolicy: digits(delivery.extraCostPolicy),
      shipPlace: code(delivery.shipPlace, /^[A-Z0-9]{3,20}$/),
      returnPlace: code(delivery.returnPlace, /^[A-Z0-9]{3,20}$/),
      courier: code(delivery.courier, /^\d{4}$/),
      returnCourier: code(delivery.returnCourier, /^\d{4}$/),
      sameDay: delivery.sameDay === true,
      closeTime: code(delivery.closeTime, /^([01]\d|2[0-3])[0-5]\d$/),
      saturday: delivery.saturday === 'Y' ? 'Y' : 'N',
      retrieveType: code(delivery.retrieveType, /^[A-Z]+_RTRV$/),
    },
    purchase: {
      maxQty: maxQty >= 1 ? Math.min(maxQty, 99_999) : 0,
      periodDays: periodDays >= 1 && periodDays <= 31 ? periodDays : 1,
    },
    asText: trimmed(raw.asText, 1000),
    sellerCode: cutBytes(trimmed(raw.sellerCode, 60), 30, utf8Bytes),
  };
}

/**
 * 롯데ON 판매자센터(`store.lotteon.com`) 상품 등록(옛 SPECS `lotte-on` 줄, 실측 2026-09-14). 화면은 WebSquare 한 페이지
 * (`index_SO.wsp`)이고 상품등록은 그 안의 탭이라 처리기가 화면의 `com.openTab`으로 연다. 칸마다 화면 데이터와 섹션 함수
 * (`scwin.*`)를 사람이 고른 것처럼 부른다 — 표준카테고리를 고르면 전시카테고리·수수료·단품 줄이 따라온다. 사진은 단품이미지 창이
 * 쓰는 업로드(티켓 → 파일)로, 상세는 편집기 사진 업로드로 넣는다. `저장`·`임시저장`은 부르지 않는다. 세션이 탭에 묶여 있어
 * 로그인은 그 탭에서 한다(`LOTTE_ON_LOGIN`).
 */
export const LOTTE_ON_REGISTRATION_FORM: MallFormSpec = {
  label: '롯데ON',
  origin: 'https://store.lotteon.com',
  pathPrefix: '/cm/main/index_SO.wsp',
  exactPath: true,
  noQuery: true,
  formSelector: 'body',
  imageSlots: [],
  dedicated: {
    file: LOTTE_ON_REGISTER_FILE,
    call: 'lotteon.fill',
    // 단품 이미지 창이 받는 최대 장수.
    imageGroupKey: 'lotteon',
    formKey: 'lotteon',
    normalize: normalizeLotteonForm,
    options: {
      maxImages: 10,
      // 로그인 확인 → 탭 열기 → 화면 초기화(공통코드 1.5초 대기 포함)까지.
      formWaitMs: 60_000,
      // 섹션 하나(분류 연관정보·고시 항목·배송비 정책 조회 등)가 끝날 때까지 기다리는 시간.
      stepWaitMs: 20_000,
    },
  },
  // 상세 이미지는 사람이 편집기에 끌어다 놓는 것과 같은 편집기 업로드로 넣는다. File로 받아 와야 한다.
  detailSelfUpload: { editorTab: null },
};

registerMallWriter({
  mallKey: 'lotte-on',
  displayName: '롯데ON',
  guard: registrationGuard(LOTTE_ON_PAGE_GUARD, '롯데ON'),
  dialogHosts: ['store.lotteon.com'],
  login: LOTTE_ON_LOGIN,
  form: LOTTE_ON_REGISTRATION_FORM,
});
