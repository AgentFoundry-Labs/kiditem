import { prepareRegistration } from '../sales-product-registration';
import { fillMallRegistrationForm } from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  ICECREAM_DEFAULT_CATEGORY,
  ICECREAM_DEFAULT_CATEGORY_CODE,
  icecreamFormFromDraft,
  icecreamSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/icecream-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem, mallFormExecutionOptions, registrationOutcome } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 아이스크림몰 어댑터(아이스크림 PO/BO).
 *
 * 이 몰만 **네이버 최저가**를 요구한다 — 최저가와 조사 주소·조사일까지 적는 칸이 있다.
 * 우리 데이터에 없는 값이라 사람이 정하고, 비어도 막지는 않는다(화면에서 채울 수 있다).
 *
 * 등록 뒤 **승인요청**이 따로 있다. 온채널과 같은 부류라 확장은 아무 버튼도 누르지 않는다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `1p` 형태로 붙습니다.',
  },
  {
    key: 'sellpiaCode',
    label: '셀피아 상품코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '몰의 업체상품코드 칸에 심습니다. 심어 두면 나중에 등록 상품을 가져올 때 이름이 아니라 코드로 정확히 이어집니다. 여러 몰이 같은 값을 씁니다.',
  },
  {
    key: 'categoryPath',
    label: '아이스크림몰 분류',
    origin: 'override',
    control: 'text',
    defaultValue: ICECREAM_DEFAULT_CATEGORY,
    required: false,
    help: '`아이스크림몰>학급운영>학생선물>장난감/완구` 처럼 `>` 로 잇습니다.',
  },
  {
    key: 'categoryCode',
    label: '분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: ICECREAM_DEFAULT_CATEGORY_CODE,
    required: false,
    help: '`BC` 로 시작하는 표준분류 코드입니다. 분류 칸이 팝업 전용이라 코드까지 함께 넣습니다.',
  },
  {
    key: 'naverMinPrice',
    label: '네이버 최저가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '이 몰만 요구합니다. 비우면 화면에서 직접 넣어야 합니다.',
  },
  {
    key: 'naverMinPriceUrl',
    label: '최저가 조사 주소',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '네이버쇼핑 검색 결과 주소입니다.',
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '어린이제품이면 필요합니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export const icecreamMallAdapter: MallPublishAdapter = {
  mallKey: 'icecream-mall',
  mallName: '아이스크림몰',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const price = item.salePrice ?? 0;
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d+\s*/, '')} (${parsePositive(values.quantity, 1)}p) + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: price > 0 ? `${formatNumber(price)}원` : '상세에서 확인',
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '공급가',
        value: price > 0
          ? `${formatNumber(icecreamSupplyPrice(price))}원 (마진율 25%)`
          : '판매가 확인 후 계산',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: values.categoryPath?.trim() || ICECREAM_DEFAULT_CATEGORY,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '네이버 최저가',
        value: values.naverMinPrice?.trim()
          ? `${formatNumber(parsePositive(values.naverMinPrice, 0))}원`
          : '미입력 — 화면에서 넣어야 합니다',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '승인',
        value: '등록 뒤 승인요청까지 사람이 눌러야 합니다',
        origin: 'template',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    const problems: string[] = [];
    if (!item.name.trim()) problems.push('상품명이 비어 있습니다.');
    const price = listPriceProblem(item.salePrice);
    if (price) problems.push(price);
    if (parsePositive(values.quantity, 0) <= 0) problems.push('수량은 1 이상이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'icecream-mall');
    // 공통 안전인증번호 칸은 초안 고시로 넘긴다 — 몰 폼 빌더는 초안만 본다.
    const certNumber = values.certNumber?.trim();
    const withCert = certNumber
      ? { ...draft, notice: { ...draft.notice, fields: { ...draft.notice.fields, 안전인증번호: certNumber } } }
      : draft;
    const form = icecreamFormFromDraft(withCert, {
      quantity: parsePositive(values.quantity, 1),
      ...(values.sellpiaCode?.trim() ? { sellpiaCode: values.sellpiaCode.trim() } : {}),
      ...(values.categoryPath?.trim() ? { categoryPath: values.categoryPath.trim() } : {}),
      ...(values.categoryCode?.trim() ? { categoryCode: values.categoryCode.trim() } : {}),
      ...(parsePositive(values.naverMinPrice, 0) > 0
        ? { naverMinPrice: parsePositive(values.naverMinPrice, 0) }
        : {}),
      ...(values.naverMinPriceUrl?.trim() ? { naverMinPriceUrl: values.naverMinPriceUrl.trim() } : {}),
    });
    const result = await fillMallRegistrationForm('icecream-mall', withCert, form, mallFormExecutionOptions(item));
    return registrationOutcome(result);
  },
};
