import { prepareRegistration } from '../sales-product-registration';
import {
  fillMallRegistrationForm,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  KIDKIDS_DEFAULT_CATEGORY,
  KIDKIDS_DEFAULT_CATEGORY_LABEL,
  KIDKIDS_KC_TYPES,
  type KidkidsKcType,
  kidkidsConsumerPrice,
  kidkidsFormFromDraft,
  kidkidsSalePrice,
  kidkidsSupplyPrice,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/kidkids-registration-form';
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
 * 키드키즈 스토어 파트너센터 어댑터(`partner.kidkids.net`).
 *
 * 실측 2026-09-14, 목록 3,478개 + 최근 등록물 60개. 규칙은 폼 빌더
 * (`kidkids-registration-form.ts`)에 적었다.
 *
 * 분류 세 단과 공정위 고시 분류를 고르면 화면이 고시 줄을 그리고, 확장이 그 줄까지
 * 채운다. [등록] 은 사람이 누른다 — 누르면 몰이 KC 안내 알림과 확인창을 띄운다.
 */

const KC_TYPE_OPTIONS = (Object.entries(KIDKIDS_KC_TYPES) as [KidkidsKcType, string][])
  .map(([value, label]) => ({ value, label }));

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
    label: '키드키즈 분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: KIDKIDS_DEFAULT_CATEGORY.join('>'),
    required: false,
    help: `세 단을 \`>\` 로 잇습니다. 기본값은 ${KIDKIDS_DEFAULT_CATEGORY_LABEL} 입니다. 말랑이는 5>359>2554, 키링은 5>359>2553.`,
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 KC 인증과 어린이제품 고시로 채웁니다. 여러 몰이 같은 값을 씁니다.',
  },
  {
    key: 'sellpiaCode',
    label: '셀피아 상품코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '몰의 자체상품코드 칸에 심습니다. 심어 두면 나중에 등록 상품을 가져올 때 이름이 아니라 코드로 정확히 이어집니다. 여러 몰이 같은 값을 씁니다.',
  },
  {
    key: 'kcType',
    label: 'KC 인증 구분',
    origin: 'override',
    control: 'select',
    options: KC_TYPE_OPTIONS,
    defaultValue: 'B',
    required: false,
    help: '인증번호가 있을 때만 씁니다. 기존 등록물은 전부 안전확인입니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function parseCategory(raw: string | undefined): string[] | null {
  const parts = (raw ?? '').split('>').map((part) => part.trim()).filter(Boolean);
  return parts.length === 3 && parts.every((part) => /^\d+$/.test(part)) ? parts : null;
}

function parseKcType(raw: string | undefined): KidkidsKcType {
  return raw === 'A' || raw === 'C' ? raw : 'B';
}

export const kidkidsAdapter: MallPublishAdapter = {
  mallKey: 'kidkids',
  mallName: '키드키즈',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = kidkidsSalePrice(item.salePrice ?? 0);
    const category = parseCategory(values.categoryCodes) ?? [...KIDKIDS_DEFAULT_CATEGORY];
    const cert = values.certNumber?.trim();
    return [
      {
        label: '상품명',
        value: `[키드아이템] ${item.name.replace(/^\d+\s*/, '')} ${parsePositive(values.quantity, 1)}p + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '송장용 상품명',
        value: '셀피아 원본명 그대로',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '소비자가 / 판매가 / 공급가',
        value: salePrice > 0
          ? `${formatNumber(kidkidsConsumerPrice([item.name], salePrice))}원 / ${formatNumber(salePrice)}원 / ${formatNumber(kidkidsSupplyPrice(salePrice))}원 (80%)`
          : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: category.join(' > '),
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: 'KC · 공정위 고시',
        value: cert
          ? `${KIDKIDS_KC_TYPES[parseKcType(values.kcType)]} ${cert} · 어린이제품 13줄`
          : '인증 미해당 · 기타 재화 5줄',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '셀피아 상품코드',
        value: values.sellpiaCode?.trim()
          ? `${values.sellpiaCode.trim()} → 자체상품코드 칸에 심음(가져올 때 코드로 이어짐)`
          : '비어 있음 — 가져올 때 이름으로만 이어집니다',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: 'CJ대한통운 유료배송 · 전국 · 2~3일',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 상세설명',
        value: '대표 1장 + 추가 최대 4장 · 상세 이미지 한 장(키드키즈 이미지 서버에 올려 넣음)',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 [등록] 을 누릅니다',
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
    if (raw && !parseCategory(raw)) problems.push('분류 코드는 숫자 세 단을 `>` 로 이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'kidkids');
    const certNumber = values.certNumber?.trim();
    const category = parseCategory(values.categoryCodes);
    const sellpiaCode = values.sellpiaCode?.trim();
    const form = kidkidsFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      kcType: parseKcType(values.kcType),
      ...(category ? { categoryCodes: category } : {}),
      ...(certNumber ? { certNumber } : {}),
      ...(sellpiaCode ? { sellpiaCode } : {}),
    });
    const result = await fillMallRegistrationForm('kidkids', draft, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. [등록] 은 사람이 누른다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
