import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  onchannelFormFromDraft,
  type OnchannelCategoryPath,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/onchannel-registration-form';
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
 * 온채널 어댑터(공급사 상품등록).
 *
 * 다른 몰과 근본적으로 다른 점이 둘이다.
 *  1. **공급가와 판매가가 따로다.** 우리가 온채널에 넘기는 값과 소비자가 보는 값이
 *     다르고, 마진율로 역산하지 않는다 — 그건 거래 조건이라 사람이 정한다.
 *  2. **등록 ≠ 판매.** 승인 요청을 하지 않으면 익일 23:59 에 삭제된다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'supplyPrice',
    label: '공급가',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    // 막지 않는다. 공급가는 우리 데이터에 없는 값이고(셀피아 매입가·판매가 어느
    // 쪽과도 일치하지 않는다), 온채널과의 거래 조건이라 사람이 정한다. 비워 두고
    // 열린 탭에서 채우는 편이, 모달에서 버튼이 잠긴 채로 막히는 것보다 낫다.
    required: false,
    help: '비워도 보냅니다. 온채널 화면에서 채우세요. 판매가에서 역산하지 않습니다.',
  },
  {
    key: 'packQuantity',
    label: '구성 수량',
    origin: 'override',
    control: 'text',
    defaultValue: '1',
    required: true,
    help: '상품명 괄호에 `(18개)` 형태로 붙습니다.',
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    // 도매꾹과 같은 칸이다. 상품에 하나뿐인 번호라 몰마다 다시 받지 않는다.
    shared: true,
    help: '`[어린이제품] 안전확인` 번호입니다. 도매꾹과 같은 값을 씁니다.',
  },
  {
    key: 'categoryPath',
    label: '온채널 분류',
    origin: 'override',
    control: 'cascade',
    // 목록은 온채널에서 그때그때 읽는다. 4단 전부를 미리 받으면 마디가 3만 개다.
    cascade: { mall: 'onch', levels: 4 },
    defaultValue: '',
    required: false,
    help: '4단을 차례로 고릅니다. 코드가 아니라 이름입니다.',
  },
];

/**
 * `생활/건강 > 문구/사무용품 > 문구용품 > 지우개` → 4단 이름.
 *
 * 온채널 분류는 코드가 아니라 이름이고 네 단계가 다 있어야 한다. 하나라도 비면
 * 계단식 목록이 열리지 않으므로 반쪽짜리는 넘기지 않는다.
 */
function parseCategoryPath(raw: string | undefined): OnchannelCategoryPath | null {
  const parts = (raw ?? '').split('>').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 4) return null;
  return { first: parts[0]!, second: parts[1]!, third: parts[2]!, fourth: parts[3]! };
}

function parsePositive(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? '').replace(/[,\s]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onchannelAdapter: MallPublishAdapter = {
  mallKey: 'onch',
  mallName: '온채널',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const pack = parsePositive(values.packQuantity, 1);
    const price = item.salePrice ?? 0;
    const supply = parsePositive(values.supplyPrice, 0);
    return [
      {
        label: '상품명',
        value: `${item.name} (${pack}개) + 첫 키워드`,
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
        label: '공급가',
        value: supply > 0 ? `${formatNumber(supply)}원` : '미입력',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: 'KC 인증번호',
        value: values.certNumber?.trim() || '미입력',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: 'CJ 대한통운 · 3,000원 · 제주 4,000 · 도서 5,000',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '승인',
        value: '등록만 하면 익일 23:59 삭제됨',
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
    const { draft } = await prepareMallRegistration(item.candidateId);
    const form = onchannelFormFromDraft(draft, {
      supplyPrice: parsePositive(values.supplyPrice, 0),
      packQuantity: parsePositive(values.packQuantity, 1),
      ...(values.certNumber?.trim() ? { kcNumber: values.certNumber.trim() } : {}),
      ...(parseCategoryPath(values.categoryPath)
        ? { category: parseCategoryPath(values.categoryPath) as OnchannelCategoryPath }
        : {}),
    });
    const result = await fillMallRegistrationForm('onch', draft, form);
    return {
      ok: result.ok,
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
