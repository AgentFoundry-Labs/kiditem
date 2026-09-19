import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  THIRTYMALL_COMMISSION_RATE,
  THIRTYMALL_DEFAULT_DISPLAY_CATEGORY,
  THIRTYMALL_DEFAULT_MANAGER,
  THIRTYMALL_DEFAULT_STANDARD_CATEGORY,
  THIRTYMALL_DELIVERY_TEMPLATE,
  THIRTYMALL_NAME_SUFFIX,
  thirtymallFormFromDraft,
  thirtymallSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/thirtymall-registration-form';
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
 * 떠리몰 어댑터(샵바이 파트너어드민, `partner.shopby.co.kr`).
 *
 * 실측 2026-09-11, 등록물 479개 + 수정 화면 셋. 상세는
 * `docs/superpowers/2026-09-11-thirtymall-product-register-research.md`.
 *
 * 폼은 다른 도메인 iframe 안의 React 앱이고 칸에 이름이 없다. 확장이 표의 줄 제목으로
 * 칸을 찾고, 분류·담당자·브랜드는 검색 목록에서 고른다. 상품정보제공고시는 새 창이라
 * 사람이 넣고, 저장도 사람이 한다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '2개 이상이면 상품명에 `(N개)` 로 붙습니다. 등록물 규칙입니다.',
  },
  {
    key: 'standardCategory',
    label: '떠리몰 표준분류',
    origin: 'override',
    control: 'text',
    defaultValue: THIRTYMALL_DEFAULT_STANDARD_CATEGORY,
    required: true,
    help: '검색 목록에 뜨는 전체 경로를 `>` 로 이어 그대로 적습니다. 기본값은 최근 등록물의 자리입니다.',
  },
  {
    key: 'displayCategory',
    label: '떠리몰 전시분류',
    origin: 'override',
    control: 'text',
    defaultValue: THIRTYMALL_DEFAULT_DISPLAY_CATEGORY,
    required: true,
    help: '검색 목록에 뜨는 전체 경로를 `>` 로 이어 그대로 적습니다.',
  },
  {
    key: 'manager',
    label: '담당자(몰 MD)',
    origin: 'override',
    control: 'text',
    defaultValue: THIRTYMALL_DEFAULT_MANAGER,
    required: true,
    help: '검색 목록에 뜨는 `이름(아이디)` 그대로입니다. 등록물 대부분이 이 담당자입니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 분류 경로는 두 단 이상이어야 한다 — 검색 목록이 전체 경로로 뜬다. */
function isCategoryPath(raw: string | undefined): boolean {
  return (raw ?? '').split('>').map((part) => part.trim()).filter(Boolean).length >= 2;
}

export const thirtymallAdapter: MallPublishAdapter = {
  mallKey: 'thirtymall',
  mallName: '떠리몰',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const quantity = parsePositive(values.quantity, 1);
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d+\s*/, '')}${quantity > 1 ? ` (${quantity}개)` : ''} ${THIRTYMALL_NAME_SUFFIX}`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '즉시할인가 / 공급가',
        value: salePrice > 0
          ? `${formatNumber(salePrice)}원 / ${formatNumber(thirtymallSupplyPrice(salePrice))}원 (수수료 ${Math.round(THIRTYMALL_COMMISSION_RATE * 100)}%, 화면이 계산)`
          : '판매가 확인 후 계산',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: `표준 ${values.standardCategory || THIRTYMALL_DEFAULT_STANDARD_CATEGORY} · 전시 ${values.displayCategory || THIRTYMALL_DEFAULT_DISPLAY_CATEGORY}`,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: `${THIRTYMALL_DELIVERY_TEMPLATE} 템플릿`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지',
        value: '대표·리스트는 대표, 추가이미지는 추가 썸네일',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '상세설명',
        value: '몰 편집기 그림 버튼으로 몰에 올려 넣습니다',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상품정보제공고시',
        value: '새 창이라 사람이 넣습니다(기타 재화)',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 저장합니다',
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
    for (const [key, label] of [['standardCategory', '표준분류'], ['displayCategory', '전시분류']] as const) {
      const raw = (values[key] ?? '').trim();
      if (raw && !isCategoryPath(raw)) problems.push(`${label}는 검색 목록의 전체 경로(\`>\` 로 이음)여야 합니다.`);
    }
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'thirtymall');
    const form = thirtymallFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(values.standardCategory?.trim() ? { standardCategory: values.standardCategory.trim() } : {}),
      ...(values.displayCategory?.trim() ? { displayCategory: values.displayCategory.trim() } : {}),
      ...(values.manager?.trim() ? { manager: values.manager.trim() } : {}),
    });
    // [등록]까지 부탁한다(ADR-0015). 확장이 이 몰의 누르기를 확인하지 않았으면 폼만 채우고 사람에게 남긴다.
    const result = await fillMallRegistrationForm('thirtymall', draft, form, { submit: true });
    return registrationOutcome(result);
  },
};
