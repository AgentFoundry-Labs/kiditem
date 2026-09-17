import {
  fillMallRegistrationForm,
  prepareMallRegistration,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  ESMPLUS_NOTICE_GROUP,
  ESMPLUS_RETURN_FEE,
  ESMPLUS_STOCK,
  esmplusCategoryQuery,
  esmplusFormFromDraft,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/esmplus-registration-form';
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
 * ESM Plus 어댑터 — **G마켓과 옥션을 한 번에** 등록한다.
 *
 * 다른 어댑터는 몰 하나를 맡지만 이것만 둘이다. 등록 화면 맨 위 `판매사이트` 에
 * G마켓·옥션 체크박스가 둘 다 켜진 채로 열리고, 한 번 채워 등록하면 양쪽에 올라간다
 * (실측 2026-09-11). 매니페스트도 같은 사실을 적어 두고 있다 — `gmarket` 은
 * "ESM 1콜로 지마켓+옥션 동시 등록", `auction` 은 "중복 송신 방지가 특히 중요하다".
 *
 * 그래서 **어댑터를 둘로 나누지 않는다.** 옥션용을 따로 만들면 같은 폼을 두 번 열어
 * 같은 상품을 두 번 올리게 된다. 옥션은 이 어댑터가 함께 처리한다.
 *
 * 이 몰만 다른 것 셋:
 *  1. 칸에 `name` 도 `id` 도 없다. **섹션 제목**이 유일한 손잡이다.
 *  2. 고시가 일반 칸과 같은 블록이다. 단 `상품군` 을 먼저 골라야 줄이 그려진다.
 *  3. 배송은 계정 템플릿으로 이미 차 있다. `반품/교환 배송비` 만 0 으로 열려서 덮는다.
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
    key: 'categoryPath',
    label: 'ESM 카테고리',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '`이벤트/파티용품>기타이벤트/파티용품` 처럼 `>` 로 잇습니다. 비우면 화면에서 직접 고릅니다.',
  },
  {
    key: 'categoryQuery',
    label: '카테고리 검색어',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '비우면 경로 마지막 마디의 첫 낱말로 검색합니다. 띄어쓴 말로 치면 0건이 나옵니다.',
  },
  {
    key: 'sellerCode',
    label: '판매자 관리코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '우리 내부 코드입니다. 비우면 넣지 않습니다.',
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

export const esmplusAdapter: MallPublishAdapter = {
  // 매니페스트의 `gmarket` 과 같은 키다. 옥션(`auction`)은 이 한 번의 등록에 함께 올라간다.
  mallKey: 'gmarket',
  mallName: 'G마켓 · 옥션',
  alsoPublishesTo: ['auction'],
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const price = item.salePrice ?? 0;
    const path = values.categoryPath?.trim() ?? '';
    return [
      {
        label: '판매사이트',
        value: 'G마켓 + 옥션 (한 번에 둘)',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상품명',
        value: `${item.name.replace(/^\d+\s*/, '')} ${parsePositive(values.quantity, 1)}p + 키워드`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가',
        value: price > 0 ? `${formatNumber(price)}원` : '상세에서 확인',
        origin: 'master',
        mallSpecific: false,
      },
      {
        label: '재고수량',
        value: `${formatNumber(ESMPLUS_STOCK)}개`,
        origin: 'template',
        mallSpecific: false,
      },
      {
        label: '카테고리',
        value: path
          ? `${path} (검색어 ${values.categoryQuery?.trim() || esmplusCategoryQuery(path)})`
          : '미입력 — 화면에서 직접 고릅니다',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '고시 상품군',
        value: `${ESMPLUS_NOTICE_GROUP} (이걸 골라야 고시 15줄이 열립니다)`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '반품/교환 배송비',
        value: `${formatNumber(ESMPLUS_RETURN_FEE)}원 — 빈 폼은 0 으로 열려서 덮어씁니다`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: '계정 템플릿 그대로 둡니다 (CJ택배 · 순차발송 · 조건부무료 9,900원)',
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
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { draft } = await prepareMallRegistration(item.candidateId);
    // 공통 안전인증번호 칸은 초안 고시로 넘긴다 — 폼 빌더는 초안만 본다.
    const certNumber = values.certNumber?.trim();
    const withCert = certNumber
      ? { ...draft, notice: { ...draft.notice, fields: { ...draft.notice.fields, 안전인증번호: certNumber } } }
      : draft;
    const form = esmplusFormFromDraft(withCert, {
      quantity: parsePositive(values.quantity, 1),
      ...(values.categoryPath?.trim() ? { categoryPath: values.categoryPath.trim() } : {}),
      ...(values.categoryQuery?.trim() ? { categoryQuery: values.categoryQuery.trim() } : {}),
      ...(values.sellerCode?.trim() ? { sellerCode: values.sellerCode.trim() } : {}),
      ...(certNumber ? { certNumber } : {}),
    });
    const result = await fillMallRegistrationForm('esmplus', withCert, form);
    return {
      ok: result.ok,
      // 폼을 채운 것은 등록이 아니다. 더구나 이건 한 번에 몰 둘이라 사람이 꼭 봐야 한다.
      confirmed: false,
      manualSteps: result.manualSteps,
      warnings: result.warnings,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};
