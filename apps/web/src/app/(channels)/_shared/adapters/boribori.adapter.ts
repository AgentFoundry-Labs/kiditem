import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  BORIBORI_DEFAULT_CATEGORY,
  BORIBORI_DEFAULT_CATEGORY_LABEL,
  BORIBORI_MARGIN_RATE,
  BORIBORI_STOCK,
  boriboriDiscountRate,
  boriboriFormFromDraft,
  boriboriListPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/boribori-registration-form';
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
 * 보리보리 어댑터(셀러클럽 · TRICYCLE).
 *
 * 실측 2026-09-11, 등록물 `435316017`. 상세는
 * `docs/superpowers/2026-09-11-boribori-product-register-research.md`.
 *
 * 이 몰만 다른 것 둘:
 *  1. 백오피스에 **하프클럽과 보리보리**가 같이 있다. 우리는 **보리보리만** 쓴다.
 *     사이트를 안 바꾸면 분류 목록이 패션이라 우리 분류가 아예 없다.
 *  2. 등록이 **네 단계**(코드생성 → 상품정보생성 → 상세정보 → 승인요청)다.
 *     상세설명·고시·원산지 칸은 저장 뒤에야 생긴다 — 확장은 1단계까지만 채운다.
 *     온채널과 같은 부류라 `confirmed` 는 언제나 false 다.
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
    key: 'categoryCodes',
    label: '보리보리 분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: BORIBORI_DEFAULT_CATEGORY.join('>'),
    required: false,
    help: `세 단을 \`>\` 로 잇습니다. 기본값은 ${BORIBORI_DEFAULT_CATEGORY_LABEL} 입니다.`,
  },
  {
    key: 'sellerCode',
    label: '업체상품코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '**우리가 정하는 코드**입니다(몰이 주는 상품코드가 아닙니다). 비우면 자체관리코드를 씁니다. 넣은 뒤 화면에서 중복체크를 눌러야 합니다.',
  },
  {
    key: 'decoWord',
    label: '수식어',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '상품명 옆에 붙는 짧은 말입니다. 실측 등록물은 `ZZ9` 였습니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function parseCategory(raw: string | undefined): string[] | null {
  const parts = (raw ?? '').split('>').map((part) => part.trim()).filter(Boolean);
  return parts.length === 3 ? parts : null;
}

export const boriboriAdapter: MallPublishAdapter = {
  mallKey: 'boribori',
  mallName: '보리보리',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const listPrice = boriboriListPrice(item.name, salePrice);
    const category = parseCategory(values.categoryCodes) ?? [...BORIBORI_DEFAULT_CATEGORY];
    return [
      {
        label: '사이트',
        value: '보리보리 (화면은 하프클럽으로 열립니다 — 바꿔서 넣습니다)',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상품명',
        value: `${item.name.replace(/^\d+\s*/, '')} (${parsePositive(values.quantity, 1)}p) + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '정상가 / 판매가',
        value: salePrice > 0
          ? `${formatNumber(listPrice)}원 → ${formatNumber(salePrice)}원 (${boriboriDiscountRate(listPrice, salePrice)}% 할인)`
          : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '마진율',
        value: `${BORIBORI_MARGIN_RATE}%`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: category.join(' > '),
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '재고',
        value: `${formatNumber(BORIBORI_STOCK)}개 — 옵션 표가 저장 뒤에 생겨 사람이 넣습니다`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '업체상품코드',
        value: values.sellerCode?.trim()
          ? `${values.sellerCode.trim()} — 화면에서 중복체크를 눌러야 합니다`
          : '자체관리코드를 씁니다. 없으면 화면에서 직접 넣어야 합니다',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '담당MD',
        value: '신규 등록에서는 칸이 잠겨 있어 사람이 고릅니다',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상세설명 · 고시',
        value: '저장 뒤 2단계에서 넣습니다. 이번 회차에는 못 들어갑니다',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: '계정 템플릿 그대로 둡니다 (대한통운 · 3,000원 · 무료 30,000원)',
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
    const raw = (values.categoryCodes ?? '').trim();
    if (raw && !parseCategory(raw)) problems.push('분류 코드는 세 단을 `>` 로 이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareMallRegistration(item.candidateId);
    const category = parseCategory(values.categoryCodes);
    const form = boriboriFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(category ? { categoryCodes: category } : {}),
      ...(values.decoWord?.trim() ? { decoWord: values.decoWord.trim() } : {}),
      ...(values.sellerCode?.trim() ? { sellerCode: values.sellerCode.trim() } : {}),
    });
    const result = await fillMallRegistrationForm('boribori', draft, form);
    return {
      ok: result.ok,
      // 1단계만 채웠다. 저장·상세정보·승인요청이 남아 있으니 등록이 아니다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
