import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  KAKAO_DELIVERY_TEMPLATE,
  KAKAO_MAX_IMAGES,
  kakaoFormFromDraft,
  parseKakaoCategory,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/kakao-registration-form';
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
 * 카카오 톡스토어 판매자센터 어댑터(`shopping-seller.kakao.com`).
 *
 * 실측 2026-09-18. 규칙은 폼 빌더(`kakao-registration-form.ts`)에 적었다. 화면은 Angular 한 페이지이고 확장의
 * 전용 채움 함수가 칸을 사람 순서대로 채운다. [저장하기] 는 사람이 누른다.
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
    key: 'kakaoCategory',
    label: '톡스토어 카테고리 코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '비우면 상품명으로 뜨는 톡스토어 AI 추천 카테고리를 고릅니다. 예: 102106101109(교육/학습완구>클레이).',
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 [어린이제품] 안전확인으로 넣고 KC 조회를 돌립니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 칸이 비었으면 AI 추천(빈 값), 적었는데 모양이 틀리면 `null`(막는다). */
function categoryFrom(raw: string | undefined): string | null {
  return (raw ?? '').trim() ? parseKakaoCategory(raw) : '';
}

export const kakaoAdapter: MallPublishAdapter = {
  mallKey: 'kakao',
  mallName: '카카오 톡스토어',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const cert = values.certNumber?.trim();
    const category = categoryFrom(values.kakaoCategory);
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d{3,}(?=\S)/, '')} ${parsePositive(values.quantity, 1)}p + 키워드 (70자)`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: salePrice > 0 ? `${formatNumber(salePrice)}원` : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '카테고리',
        value: category === null ? '형식 확인 필요' : category || '톡스토어 AI 추천',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '인증 · 고시',
        value: cert ? `[어린이제품] 안전확인 ${cert} · 어린이제품 고시` : '인증 없음 · 어린이제품 고시',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: `판매자 템플릿 '${KAKAO_DELIVERY_TEMPLATE}' (3만원 미만 3,000원)`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 상세설명',
        value: `대표 + 추가 최대 ${KAKAO_MAX_IMAGES - 1}장 · 상세 이미지 한 장(톡스토어에 올림)`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 [저장하기]',
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
    if (categoryFrom(values.kakaoCategory) === null) {
      problems.push('톡스토어 카테고리 코드는 `102106101109` 처럼 세 자리씩 붙는 숫자여야 합니다.');
    }
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const categoryId = categoryFrom(values.kakaoCategory);
    if (categoryId === null) {
      return {
        ok: false,
        confirmed: false,
        manualSteps: [],
        warnings: [],
        error: '톡스토어 카테고리 코드 형식이 틀렸습니다.',
      };
    }
    const { draft } = await prepareRegistration(item, 'kakao');
    const certNumber = values.certNumber?.trim();
    const form = kakaoFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(categoryId ? { categoryId } : {}),
      ...(certNumber ? { certNumber } : {}),
    });
    // [등록]까지 부탁한다(ADR-0015). 확장이 이 몰의 누르기를 확인하지 않았으면 폼만 채우고 사람에게 남긴다.
    const result = await fillMallRegistrationForm('kakao', draft, form, { submit: true });
    return registrationOutcome(result);
  },
};
