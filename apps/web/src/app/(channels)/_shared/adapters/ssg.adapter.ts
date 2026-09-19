import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  SSG_BRAND_NAME,
  SSG_DEFAULT_DISPLAY_CATEGORY,
  SSG_DEFAULT_STANDARD_CATEGORY,
  SSG_MARGIN_RATE,
  parseSsgCategory,
  ssgFormFromDraft,
  ssgSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/ssg-registration-form';
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
 * 신세계 파트너오피스 어댑터(`po.ssgadm.com`).
 *
 * 실측 2026-09-14. 규칙은 폼 빌더(`ssg-registration-form.ts`)에 적었다. 화면은 Vue 로 된
 * 한 페이지라 확장의 전용 채움 함수가 사람 순서대로 칸을 채운다. [저장] 은 사람이 누른다 —
 * 저장하면 MD 승인 대기로 올라간다.
 */

const DISPLAY_CATEGORY_DEFAULT = `${SSG_DEFAULT_DISPLAY_CATEGORY.id}:${SSG_DEFAULT_DISPLAY_CATEGORY.keyword}`;
const STANDARD_CATEGORY_DEFAULT = `${SSG_DEFAULT_STANDARD_CATEGORY.id}:${SSG_DEFAULT_STANDARD_CATEGORY.keyword}`;

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
    key: 'ssgDisplayCategory',
    label: '신세계 전시카테고리',
    origin: 'override',
    control: 'text',
    defaultValue: DISPLAY_CATEGORY_DEFAULT,
    required: false,
    help: `SSG.COM몰 전시카테고리 \`번호:이름\`. 기본은 기존 등록물과 같은 ${SSG_DEFAULT_DISPLAY_CATEGORY.label} 입니다. 예) 보드게임 6000161769:보드게임`,
  },
  {
    key: 'ssgStandardCategory',
    label: '신세계 표준분류',
    origin: 'override',
    control: 'text',
    defaultValue: STANDARD_CATEGORY_DEFAULT,
    required: false,
    help: `표준분류 \`번호:마지막 단 이름\`. 기본은 ${SSG_DEFAULT_STANDARD_CATEGORY.label} 입니다. 상품에 안 맞으면 승인 반려될 수 있습니다.`,
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 상품고시를 어린이제품으로 채웁니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 칸이 비었으면 기본값, 적었는데 모양이 틀리면 `null`(막는다). */
function categoryFrom(raw: string | undefined, fallback: typeof SSG_DEFAULT_DISPLAY_CATEGORY) {
  const text = (raw ?? '').trim();
  if (!text) return fallback;
  return parseSsgCategory(text);
}

export const ssgAdapter: MallPublishAdapter = {
  mallKey: 'ssg',
  mallName: '신세계',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const display = categoryFrom(values.ssgDisplayCategory, SSG_DEFAULT_DISPLAY_CATEGORY);
    const standard = categoryFrom(values.ssgStandardCategory, SSG_DEFAULT_STANDARD_CATEGORY);
    const cert = values.certNumber?.trim();
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d{3,}(?=\S)/, '')} ${parsePositive(values.quantity, 1)}p + 키워드 (브랜드 ${SSG_BRAND_NAME})`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가 / 마진 / 공급가',
        value: salePrice > 0
          ? `${formatNumber(salePrice)}원 / ${SSG_MARGIN_RATE}% / 약 ${formatNumber(ssgSupplyPrice(salePrice))}원`
          : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '전시카테고리 · 표준분류',
        value: `${display?.label ?? '형식 확인 필요'} · ${standard?.label ?? '형식 확인 필요'}`,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품고시',
        value: cert ? `어린이제품 · KC ${cert}` : '기타 · 수입자 해피프랜즈',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: '협력업체 택배 · 3일 · 3,000원(3만원 이상 무료) · 반품 3,000원',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 상세설명',
        value: '대표 + 추가 최대 9장 · 상세 이미지 한 장(신세계 이미지 서버에 올려 넣음)',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 [저장] 을 누릅니다 → MD 승인 대기',
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
    if (!categoryFrom(values.ssgDisplayCategory, SSG_DEFAULT_DISPLAY_CATEGORY)) {
      problems.push('신세계 전시카테고리는 `번호:이름` 이어야 합니다(예: 6000161769:보드게임).');
    }
    if (!categoryFrom(values.ssgStandardCategory, SSG_DEFAULT_STANDARD_CATEGORY)) {
      problems.push('신세계 표준분류는 `번호:이름` 이어야 합니다(예: 1000022578:패션.잡화).');
    }
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const display = categoryFrom(values.ssgDisplayCategory, SSG_DEFAULT_DISPLAY_CATEGORY);
    const standard = categoryFrom(values.ssgStandardCategory, SSG_DEFAULT_STANDARD_CATEGORY);
    if (!display || !standard) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '신세계 카테고리 형식이 틀렸습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'ssg');
    const certNumber = values.certNumber?.trim();
    const form = ssgFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      displayCategory: display,
      standardCategory: standard,
      ...(certNumber ? { certNumber } : {}),
    });
    const result = await fillMallRegistrationForm('ssg', draft, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. [저장] 은 사람이 누르고, 그 뒤에도 MD 승인이 남는다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
