import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  ELEVENST_SALE_PERIOD,
  elevenstFormFromDraft,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/elevenst-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem, registrationOutcome } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 11번가 어댑터(셀러오피스 신규 상품등록).
 *
 * 이 몰만 **분류를 되돌릴 수 없다** — "상품을 등록한 후에는 카테고리 변경이 어렵다"고
 * 화면이 직접 경고한다. 그래서 분류를 필수로 받는다.
 *
 * 그리고 **상품명 클린체크**가 게이트다. 몰의 검사를 통과해야 등록 버튼이 먹는데
 * 그건 사람이 눌러야 하므로 안내로 넘긴다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'categoryPath',
    label: '11번가 분류',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    // 되돌릴 수 없는 선택이라 비운 채로 보내지 않는다.
    required: true,
    help: '`문구/사무용품>디자인/팬시용품>기능성 팬시` 처럼 `>` 로 잇습니다. 등록 후에는 바꾸기 어렵습니다.',
  },
  {
    key: 'deliveryTemplate',
    label: '배송정보 템플릿',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '화면 목록에 있는 이름 그대로 넣으면 배송 설정이 통째로 채워집니다. 비우면 사람이 고릅니다.',
  },
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
    key: 'consumerPrice',
    label: '권장 소비자가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '비우면 원본 상품명 앞의 숫자를 씁니다. 그 숫자도 없으면 판매가를 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export const elevenstAdapter: MallPublishAdapter = {
  mallKey: '11st',
  mallName: '11번가',
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
        label: '분류',
        value: values.categoryPath?.trim() || '미선택 (등록 후 변경 어려움)',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: values.deliveryTemplate?.trim() || '템플릿 미선택 — 화면에서 고르세요',
        origin: 'override',
        mallSpecific: true,
      },
      { label: '판매기간', value: ELEVENST_SALE_PERIOD, origin: 'template', mallSpecific: true },
      { label: '재고', value: '999개', origin: 'template', mallSpecific: true },
      {
        label: '클린체크',
        value: '상품명 클린체크는 사람이 눌러야 합니다',
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
    // 분류는 등록 후 바꾸기 어렵다. 비운 채로 열어 두면 사람이 대충 고를 위험이 크다.
    if (!values.categoryPath?.trim()) problems.push('분류를 입력하세요. 등록 후에는 바꾸기 어렵습니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, '11st');
    const form = elevenstFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(parsePositive(values.consumerPrice, 0) > 0
        ? { consumerPrice: parsePositive(values.consumerPrice, 0) }
        : {}),
      ...(values.categoryPath?.trim() ? { categoryPath: values.categoryPath.trim() } : {}),
      ...(values.deliveryTemplate?.trim() ? { deliveryTemplate: values.deliveryTemplate.trim() } : {}),
    });
    // [등록]까지 부탁한다(ADR-0015). 확장이 이 몰의 누르기를 확인하지 않았으면 폼만 채우고 사람에게 남긴다.
    const result = await fillMallRegistrationForm('11st', draft, form, { submit: true });
    return registrationOutcome(result);
  },
};
