import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  LOTTEON_DEFAULT_CATEGORY,
  LOTTEON_MAX_IMAGES,
  lotteonFormFromDraft,
  parseLotteonCategory,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/lotteon-registration-form';
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
 * 롯데ON 판매자센터 어댑터(`store.lotteon.com`).
 *
 * 실측 2026-09-14. 규칙은 폼 빌더(`lotteon-registration-form.ts`)에 적었다. 화면은 WebSquare 한 페이지이고
 * 확장의 전용 채움 함수가 상품등록 탭을 열어 섹션 함수를 사람 순서대로 부른다. [저장] 은 사람이 누른다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `(1p)` 형태로 붙습니다.',
  },
  {
    key: 'lotteonCategory',
    label: '롯데ON 표준카테고리 코드',
    origin: 'override',
    control: 'text',
    defaultValue: LOTTEON_DEFAULT_CATEGORY.code,
    required: false,
    help: `BC 로 시작하는 10자리 코드. 기본은 ${LOTTEON_DEFAULT_CATEGORY.label} 입니다.`,
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 정보고시 인증 칸에 적습니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 칸이 비었으면 기본값, 적었는데 모양이 틀리면 `null`(막는다). */
function categoryFrom(raw: string | undefined): string | null {
  return (raw ?? '').trim() ? parseLotteonCategory(raw) : LOTTEON_DEFAULT_CATEGORY.code;
}

export const lotteonAdapter: MallPublishAdapter = {
  mallKey: 'lotte-on',
  mallName: '롯데ON',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const cert = values.certNumber?.trim();
    return [
      {
        label: '판매자상품명',
        value: `${item.name.replace(/^\d{3,}(?=\S)/, '')} (${parsePositive(values.quantity, 1)}p) + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가 / 수수료',
        value: salePrice > 0 ? `${formatNumber(salePrice)}원 / 분류별 수수료(화면 계산)` : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '표준카테고리',
        value: categoryFrom(values.lotteonCategory) ?? '형식 확인 필요',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '정보고시',
        value: cert ? `기타 재화 · 인증 KC ${cert}` : '기타 재화 · 인증 해당없음',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: 'CJ대한통운 · 3만원 미만 3,000원 · 도서산간 5,000 · 제주 3,000 · 오늘발송 13시 마감',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 상세설명',
        value: `대표 + 추가 최대 ${LOTTEON_MAX_IMAGES - 1}장(롯데ON 에 올림) · 상세 이미지 한 장`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 [저장]',
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
    if (!categoryFrom(values.lotteonCategory)) problems.push('롯데ON 표준카테고리 코드는 `BC55031100` 모양이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const category = categoryFrom(values.lotteonCategory);
    if (!category) {
      return {
        ok: false,
        confirmed: false,
        manualSteps: [],
        warnings: [],
        error: '롯데ON 표준카테고리 코드 형식이 틀렸습니다.',
      };
    }
    const { draft } = await prepareRegistration(item, 'lotte-on');
    const certNumber = values.certNumber?.trim();
    const form = lotteonFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      category,
      ...(certNumber ? { certNumber } : {}),
    });
    const result = await fillMallRegistrationForm('lotteon', draft, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. [저장] 은 사람이 누르고, 그 뒤 롯데ON 승인이 남는다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
