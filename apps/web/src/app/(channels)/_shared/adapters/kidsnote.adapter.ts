import {
  fillKidsnoteRegistrationForm,
  prepareKidsnoteRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/kidsnote-registration-api';
import {
  buildKidsnoteDisplayName,
  KIDSNOTE_CATEGORY_PRESET,
  KIDSNOTE_DEFAULT_CATEGORY,
  KIDSNOTE_SALES_POLICY,
  KIDSNOTE_SELLER_VALUE,
  type KidsnoteCategoryKey,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/kidsnote-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallPublishItem,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 키즈노트(WISA 스마트윙) 어댑터.
 *
 * 등록이 아니라 **입점 신청**이다(`req_stat=1 등록대기`). 확장이 관리자 등록 화면을
 * 열어 폼을 채우고, 제출은 사람이 누른다 — 승인이 붙는 요청이라 되돌리기 어렵다.
 * 그래서 `batchSize` 가 1 이고 `confirmed` 는 어떤 경우에도 참이 되지 않는다.
 */

const CATEGORY_OPTIONS = Object.entries(KIDSNOTE_CATEGORY_PRESET).map(([key, preset]) => ({
  value: key,
  label: key,
  hint: `등록 ${preset.count}건`,
}));

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'category',
    label: '몰 분류',
    origin: 'override',
    control: 'select',
    defaultValue: KIDSNOTE_DEFAULT_CATEGORY,
    options: CATEGORY_OPTIONS,
    required: true,
    help: '등록 상품 1,024건의 실제 분포 상위 12개. 이 12개가 전체의 82%다.',
  },
  {
    key: 'quantity',
    label: '수량 표기',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '노출상품명에 `1p` 형태로 붙는다.',
  },
  {
    key: 'seller',
    label: '판매자',
    origin: 'template',
    control: 'text',
    defaultValue: KIDSNOTE_SELLER_VALUE.판매자,
    required: true,
  },
  {
    key: 'sellerPhone',
    label: '판매자 연락처',
    origin: 'template',
    control: 'text',
    defaultValue: KIDSNOTE_SELLER_VALUE.판매자연락처,
    required: true,
  },
  {
    key: 'partnerRate',
    label: '파트너 수수료율',
    origin: 'template',
    control: 'text',
    defaultValue: KIDSNOTE_SALES_POLICY.partnerRate,
    required: true,
    help: '실측 전 상품 동일. 몰과 합의된 값이라 상품별로 바꾸지 않는다.',
  },
];

function parseQuantity(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? '1').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isCategoryKey(value: string): value is KidsnoteCategoryKey {
  return Object.prototype.hasOwnProperty.call(KIDSNOTE_CATEGORY_PRESET, value);
}

export const kidsnoteAdapter: MallPublishAdapter = {
  mallKey: 'kidsnote',
  mallName: '키즈노트',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item: MallPublishItem, values): MallPreviewRow[] {
    const quantity = parseQuantity(values.quantity);
    const categoryKey = values.category ?? KIDSNOTE_DEFAULT_CATEGORY;
    const preset = isCategoryKey(categoryKey) ? KIDSNOTE_CATEGORY_PRESET[categoryKey] : null;
    const price = item.salePrice ?? 0;
    return [
      {
        label: '노출상품명',
        // 키워드는 상세를 읽어야 알 수 있어 송신 시점에 뒤에 붙는다.
        value: `${buildKidsnoteDisplayName(item.name, [], quantity)} + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: price > 0 ? `${formatNumber(price)}원` : '없음',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '몰 분류',
        value: preset
          ? `${categoryKey} (${[preset.big, preset.mid, preset.small, preset.depth4].filter(Boolean).join(' > ')})`
          : categoryKey,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품정보고시',
        value: '기타(1100) · 26칸',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '판매자',
        value: `${values.seller ?? ''} · ${values.sellerPhone ?? ''}`,
        origin: 'template',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    const problems: string[] = [];
    if (!item.name.trim()) problems.push('상품명이 비어 있습니다.');
    // 목록의 null 은 '모름'이다. 상세를 열면 셀피아 이름매칭으로 값이 붙는다.
    const priceProblem = listPriceProblem(item.salePrice);
    if (priceProblem) problems.push(priceProblem);
    const categoryKey = values.category ?? '';
    if (!isCategoryKey(categoryKey)) problems.push('몰 분류를 고르지 않았습니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const categoryKey = values.category ?? KIDSNOTE_DEFAULT_CATEGORY;
    const { draft } = await prepareKidsnoteRegistration(item.candidateId);
    const result = await fillKidsnoteRegistrationForm(draft, {
      ...(isCategoryKey(categoryKey) ? { category: categoryKey } : {}),
      quantity: parseQuantity(values.quantity),
    });
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. 사람이 제출하고 몰이 승인해야 등록이다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
