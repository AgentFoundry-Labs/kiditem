import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  artgongguFormFromDraft,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/artgonggu-registration-form';
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
 * 아트공구 어댑터(Cafe24 상품등록).
 *
 * 세 폼 몰 중 가장 순하다 — 이미지를 주소로 넣어 업로드가 없고, 상세설명 호스팅을
 * 도매꾹과 공유한다. 대신 **상품분류가 필수**이고 4단 이름 경로라 사람이 골라야 한다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'namePrefix',
    label: '상품명 접두어',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '실측 상품은 `[펜시네550]` 형태를 씁니다. 비우면 접두어 없이 들어갑니다.',
  },
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
    key: 'supplyPrice',
    label: '공급가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '우리가 이 몰에 넘기는 매입가입니다. 실측 등록물은 소비자가의 약 54% 였습니다.',
  },
  {
    key: 'categoryPath',
    label: '상품분류',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '`*완구/선물/행사용품 > 완구/선물 > 팬시/놀이완구` 처럼 `>` 로 잇습니다. 줄바꿈으로 여러 분류를 넣을 수 있습니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 줄바꿈으로 나뉜 여러 분류 경로. 빈 줄은 버린다. */
function splitCategoryPaths(raw: string | undefined): string[] {
  return (raw ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
}

export const art09Adapter: MallPublishAdapter = {
  mallKey: 'art09',
  mallName: '아트공구',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    return [
      { label: '상품명', value: item.name, origin: 'master', mallSpecific: false },
      {
        label: '접두어',
        value: values.namePrefix?.trim() || '없음',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: item.salePrice === null ? '상세에서 확인' : `${formatNumber(item.salePrice)}원`,
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '공급가',
        value: values.supplyPrice?.trim()
          ? `${formatNumber(Number(values.supplyPrice.replace(/[^0-9]/g, '')))}원`
          : '미입력',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품분류',
        value: splitCategoryPaths(values.categoryPath).join(' · ') || '미선택',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '대표이미지',
        // 파일을 올리지 않는다. Cafe24 가 주소로 받아 자기 서버에 저장한다.
        value: '주소로 등록 (네 칸 동일)',
        origin: 'override',
        mallSpecific: true,
      },
    ];
  },

  validate(item, values): string[] {
    const problems: string[] = [];
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
    const form = artgongguFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      ...(values.namePrefix?.trim() ? { namePrefix: values.namePrefix.trim() } : {}),
      categoryPaths: splitCategoryPaths(values.categoryPath),
      ...(parsePositive(values.supplyPrice, 0) > 0
        ? { supplyPrice: parsePositive(values.supplyPrice, 0) }
        : {}),
    });
    const result = await fillMallRegistrationForm('art09', draft, form);
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
