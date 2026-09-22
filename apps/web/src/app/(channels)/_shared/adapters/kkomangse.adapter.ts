import { prepareRegistration } from '../sales-product-registration';
import { fillMallRegistrationForm } from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  KKOMANGSE_COMMISSION_RATE,
  KKOMANGSE_DEFAULT_CATEGORY,
  KKOMANGSE_DEFAULT_CATEGORY_LABEL,
  kkomangseFormFromDraft,
  kkomangseListPrice,
  kkomangseSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/kkomangse-registration-form';
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
 * 꼬망세몰 어댑터(EduPre 임대몰, `nstore.edupre.co.kr`).
 *
 * 실측 2026-09-11, 등록물 `_code=H7984-C3488-G2602`. 상세는
 * `docs/superpowers/2026-09-11-kkomangse-product-register-research.md`.
 *
 * 저장되는 가격은 판매가 하나다 — 납품가 칸은 화면이 수수료율로 계산해 채우는 칸이라
 * 넣지 않는다. 분류는 고른 뒤 `선택 카테고리 추가` 까지 눌러야 붙고, 확장이 그 버튼까지
 * 누른다. 상품 저장은 사람이 한다.
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
    key: 'categoryCodes',
    label: '꼬망세 분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: KKOMANGSE_DEFAULT_CATEGORY.join('>'),
    required: false,
    help: `세 단을 \`>\` 로 잇습니다. 기본값은 ${KKOMANGSE_DEFAULT_CATEGORY_LABEL} 입니다.`,
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

function parseCategory(raw: string | undefined): string[] | null {
  const parts = (raw ?? '').split('>').map((part) => part.trim()).filter(Boolean);
  return parts.length === 3 ? parts : null;
}

export const kkomangseAdapter: MallPublishAdapter = {
  mallKey: 'kkomangse',
  mallName: '꼬망세몰',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const listPrice = kkomangseListPrice(item.name, salePrice);
    const category = parseCategory(values.categoryCodes) ?? [...KKOMANGSE_DEFAULT_CATEGORY];
    return [
      {
        label: '상품명',
        value: `${item.name.replace(/^\d+\s*/, '')} ${parsePositive(values.quantity, 1)}p + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '정상가 / 판매가',
        value: salePrice > 0 ? `${formatNumber(listPrice)}원 / ${formatNumber(salePrice)}원` : '상세에서 확인',
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '납품가',
        value: salePrice > 0
          ? `${formatNumber(kkomangseSupplyPrice(salePrice))}원 (수수료 ${Math.round(KKOMANGSE_COMMISSION_RATE * 100)}%, 화면이 계산)`
          : '판매가 확인 후 계산',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: `${category.join(' > ')} — [선택 카테고리 추가] 까지 누릅니다`,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '이미지',
        value: '목록 기본·상세 1 은 대표, 오버·상세 2~5 는 추가 썸네일',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '상세설명',
        value: '몰 에디터 사진 업로더에 올려 넣습니다',
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
    const raw = (values.categoryCodes ?? '').trim();
    if (raw && !parseCategory(raw)) problems.push('분류 코드는 세 단을 `>` 로 이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'kkomangse');
    const certNumber = values.certNumber?.trim();
    const category = parseCategory(values.categoryCodes);
    const form = kkomangseFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(category ? { categoryCodes: category } : {}),
      ...(certNumber ? { certNumber } : {}),
    });
    const result = await fillMallRegistrationForm('kkomangse', draft, form, mallFormExecutionOptions(item));
    return registrationOutcome(result);
  },
};
