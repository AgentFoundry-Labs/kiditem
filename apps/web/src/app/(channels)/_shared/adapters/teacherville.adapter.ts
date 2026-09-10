import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  TEACHERVILLE_DEFAULT_CATEGORY,
  teachervilleFormFromDraft,
  teachervilleSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/teacherville-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 티처몰 어댑터(퍼스트몰 판매자 상품등록).
 *
 * 이 몰만 **사진에 파일 칸이 없다.** 몰 서버에 먼저 올리고 받은 주소를 표에 넣는다.
 * 한 번 올리면 서버가 일곱 크기를 만들어 준다 — 우리가 크기를 맞출 일이 없다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `(1p)` 형태로 붙고 고시 `제품 구성`·`개당 구성 수량` 에도 들어갑니다.',
  },
  {
    key: 'consumerPrice',
    label: '소비자가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '비우면 원본 상품명 앞의 숫자를 씁니다. 그 숫자도 없으면 판매가를 씁니다.',
  },
  {
    key: 'categoryPath',
    label: '티처몰 분류',
    origin: 'override',
    control: 'text',
    defaultValue: TEACHERVILLE_DEFAULT_CATEGORY,
    required: false,
    help: '`티처몰 > 학급운영` 처럼 `>` 로 잇습니다. 코드가 아니라 이름입니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export const teachervilleAdapter: MallPublishAdapter = {
  mallKey: 'teacher-mall',
  mallName: '티처몰',
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
        value: price > 0 ? `${formatNumber(teachervilleSupplyPrice(price))}원 (수수료 20%)` : '판매가 확인 후',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: values.categoryPath?.trim() || '미선택',
        origin: 'override',
        mallSpecific: true,
      },
      { label: '재고', value: '999개', origin: 'template', mallSpecific: true },
      {
        label: '사진',
        value: '대표 + 추가 이미지를 한 장씩 상품컷으로',
        origin: 'master',
        mallSpecific: false,
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
    const { draft } = await prepareMallRegistration(item.candidateId);
    const form = teachervilleFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(parsePositive(values.consumerPrice, 0) > 0
        ? { consumerPrice: parsePositive(values.consumerPrice, 0) }
        : {}),
      ...(values.categoryPath?.trim() ? { categoryPath: values.categoryPath.trim() } : {}),
    });
    const result = await fillMallRegistrationForm('teacherville', draft, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. 사람이 저장해야 등록이다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
