import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import { alwayzFormFromDraft } from '../../../(product-pipeline)/product-pipeline/_shared/lib/alwayz-registration-form';
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
 * 올웨이즈 어댑터(판매자센터 상품등록).
 *
 * 이 몰만 **가격이 둘**이다 — 개별구매가와 팀구매가. 팀구매가가 구매자에게 보이는
 * 대표 가격인데 우리 데이터에 없어 사람이 정한다. 비우면 보내지 않는다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'teamPrice',
    label: '팀구매가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: true,
    help: '구매자에게 보이는 대표 가격입니다. 실측 상품은 개별구매가 2,500 / 팀구매가 1,800 이었습니다.',
  },
  {
    key: 'quantity',
    label: '수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `1P` 형태로 붙습니다.',
  },
  {
    key: 'categoryPath',
    label: '올웨이즈 분류',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '`완구/취미 > DIY > 피젯스피너DIY` 처럼 `>` 로 잇습니다. 코드가 아니라 이름입니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export const alwayzAdapter: MallPublishAdapter = {
  mallKey: 'always',
  mallName: '올웨이즈',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    return [
      { label: '상품명', value: `[키드아이템] ${item.name}`, origin: 'master', mallSpecific: true },
      {
        label: '개별구매가',
        value: item.salePrice === null ? '상세에서 확인' : `${formatNumber(item.salePrice)}원`,
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '팀구매가',
        value: values.teamPrice?.trim()
          ? `${formatNumber(parsePositive(values.teamPrice, 0))}원`
          : '미입력',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: values.categoryPath?.trim() || '미선택',
        origin: 'override',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    const problems: string[] = [];
    const price = listPriceProblem(item.salePrice);
    if (price) problems.push(price);
    // 팀구매가는 구매자에게 보이는 값이다. 비운 채로 보내면 반쯤 빈 화면이 열린다.
    if (parsePositive(values.teamPrice, 0) <= 0) problems.push('팀구매가를 입력하세요.');
    if (parsePositive(values.quantity, 0) <= 0) problems.push('수량은 1 이상이어야 합니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareMallRegistration(item.candidateId);
    const form = alwayzFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      teamPrice: parsePositive(values.teamPrice, 0),
      ...(values.categoryPath?.trim() ? { categoryPath: values.categoryPath.trim() } : {}),
    });
    const result = await fillMallRegistrationForm('alwayz', draft, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. 사람이 제출해야 등록이다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
