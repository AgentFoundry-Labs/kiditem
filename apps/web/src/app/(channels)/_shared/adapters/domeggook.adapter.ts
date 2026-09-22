import { prepareRegistration } from '../sales-product-registration';
import { fillMallRegistrationForm } from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  domeggookFormFromDraft,
  DOMEGGOOK_BASE_VALUE,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/domeggook-registration-form';
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
 * 도매꾹 어댑터.
 *
 * 도매 마켓이라 소매몰에 없는 개념이 둘 있다 — **최소 구매수량(묶음)** 과
 * **6단 분류 코드**. 둘 다 상품마다 달라 초안이 들고 있지 않고 여기서 사람이 고른다.
 *
 * 확장이 등록 화면을 열고 폼을 채운다. 제출은 사람이 한다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'unitQty',
    label: '최소 구매수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '도매 묶음 단위. 실측 상품은 5였습니다. 상품마다 다릅니다.',
  },
  {
    key: 'categoryCode',
    label: '도매꾹 분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '`09_03_05_11_00_00` 형태 6단. 비우면 화면에서 직접 고릅니다.',
  },
  {
    key: 'quantity',
    label: '수량 표기',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명에 `1p` 형태로 붙습니다.',
  },
  {
    key: 'itemCode',
    label: '모델명',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '도매꾹 `모델명` 칸입니다. 실측 상품은 `9735-1` 처럼 셀피아 상품코드 모양이었습니다. 비우면 빈 칸으로 둡니다.',
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    // 온채널과 같은 칸이다. 상품에 하나뿐인 번호라 몰마다 다시 받지 않는다.
    shared: true,
    help: '`[어린이제품] 안전확인` 번호입니다. 실측 `CB065R1579-2008`. 비우면 화면에서 직접 넣어야 합니다.',
  },
  {
    key: 'itemCompany',
    label: '제조사',
    origin: 'template',
    control: 'text',
    defaultValue: DOMEGGOOK_BASE_VALUE.itemCompany,
    required: true,
    help: '이 몰에 등록된 표기입니다. 다른 몰의 `해피프랜즈` 와 철자가 다릅니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const domeggookAdapter: MallPublishAdapter = {
  mallKey: 'domeggook',
  mallName: '도매꾹',
  mode: 'form',
  // 등록 화면 하나에 상품 하나다.
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const quantity = parsePositive(values.quantity, 1);
    const price = item.salePrice ?? 0;
    return [
      {
        label: '상품명',
        value: `${item.name} ${quantity}p + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: price > 0 ? `${formatNumber(price)}원` : '없음',
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '최소 구매수량',
        value: `${formatNumber(parsePositive(values.unitQty, 1))}개 묶음`,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '분류',
        value: values.categoryCode?.trim() || '화면에서 직접 선택',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품정보고시',
        value: '어린이제품 · 13칸 + 거래조건 4칸',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상세 이미지',
        // 사람이 고를 것이 없다. 도매꾹 자체 호스팅은 iwinv API 키 없이는 파일을
        // 받지 않아서(실측), 우리 첨부 저장소에 올린 공개 주소를 쓴다.
        value: '첨부 저장소에 올려 작성하기 에디터로 넣음',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '제조사',
        value: values.itemCompany ?? '',
        origin: 'template',
        mallSpecific: true,
      },
    ];
  },

  validate(item): string[] {
    const problems: string[] = [];
    if (!item.name.trim()) problems.push('상품명이 비어 있습니다.');
    // 목록의 null 은 '모름'이다. 상세를 열면 셀피아 이름매칭으로 값이 붙는다.
    const priceProblem = listPriceProblem(item.salePrice);
    if (priceProblem) problems.push(priceProblem);
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareRegistration(item, 'domeggook');
    const form = domeggookFormFromDraft(draft, {
      unitQty: parsePositive(values.unitQty, 1),
      quantity: parsePositive(values.quantity, 1),
      ...(values.categoryCode?.trim() ? { categoryCode: values.categoryCode.trim() } : {}),
      ...(values.itemCode?.trim() ? { itemCode: values.itemCode.trim() } : {}),
      ...(values.certNumber?.trim() ? { certNumber: values.certNumber.trim() } : {}),
    });
    const result = await fillMallRegistrationForm('domeggook', draft, form, mallFormExecutionOptions(item));
    return registrationOutcome(result);
  },
};
