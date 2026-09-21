import {
  downloadWingExcel,
  generateWingExcelForCandidates,
} from '../../../(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-flow';
import { WING_PRODUCT_DRAFT_DEFAULTS } from '../../../(product-pipeline)/product-pipeline/collected-products/lib/wing-registration-excel';
import { formatNumber } from '@/lib/utils';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * 쿠팡 WING 어댑터(일괄등록 엑셀).
 *
 * 키즈노트와 정반대 성격이라 어댑터 인터페이스의 시험대가 된다. 화면 하나에
 * 상품 하나가 아니라 **파일 하나에 전부** 들어가므로 `batchSize` 가 무제한이고,
 * 카테고리는 사람이 고르는 것이 아니라 수집 원본에서 추론된다.
 *
 * 엑셀은 만들었다고 등록이 아니다. WING 일괄등록 화면에 사람이 올려야 하고,
 * 그 결과는 쿠팡이 따로 알려준다. 그래서 `confirmed` 는 항상 거짓이다.
 *
 * 그래서 이 경로는 등록 실행 울타리를 열지 않는다 — 계정도 고르지 않았고 제출도 없다.
 * 확정되지 않을 실행을 열어 두면 그 수집상품이 `reconciling` 에 갇힌다(ADR-0014).
 * 이 어댑터가 계정을 골라 직접 제출하게 되면 `../registration-execution-api.ts` 의
 * `prepare` → `start` → `confirm` 을 수집상품 화면과 똑같이 지나야 한다.
 *
 * 상세설명 이미지는 이 경로에 배선이 없다. 상품별 서버 래스터라이즈가 필요한데
 * 엑셀 생성이 그걸 하지 않는다 — 없는 것을 아무 이미지로 채우지 않고 비워 둔다.
 */

const FIELDS: readonly MallFieldSpec[] = [
  {
    key: 'brand',
    label: '브랜드',
    origin: 'template',
    control: 'text',
    defaultValue: WING_PRODUCT_DRAFT_DEFAULTS.defaultBrand,
    required: true,
    help: '엑셀 양식은 브랜드칸을 비울 수 없어 기본값이 들어간다.',
  },
  {
    key: 'maker',
    label: '제조사',
    origin: 'template',
    control: 'text',
    defaultValue: WING_PRODUCT_DRAFT_DEFAULTS.defaultMaker,
    required: true,
  },
];

export const coupangWingAdapter: MallPublishAdapter = {
  mallKey: 'coupang',
  mallName: '쿠팡 WING',
  mode: 'excel',
  // 한 파일에 전부 담긴다. 화면이 작업을 쪼개지 않는다.
  batchSize: Number.POSITIVE_INFINITY,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const price = item.salePrice ?? 0;
    return [
      {
        label: '노출상품명',
        value: `${item.name} + 키워드`,
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
        label: '몰 카테고리',
        value: '수집 원본에서 추론 · 확신 낮으면 생성 시 중단',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '상품정보고시',
        value: `${WING_PRODUCT_DRAFT_DEFAULTS.noticeCategory} · 7칸`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '브랜드 · 제조사',
        value: `${values.brand ?? ''} · ${values.maker ?? ''}`,
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '상세설명',
        value: '엑셀 경로는 비어 있음 — WING에서 추가',
        origin: 'master',
        mallSpecific: true,
      },
    ];
  },

  validate(item): string[] {
    const problems: string[] = [];
    if (!item.name.trim()) problems.push('상품명이 비어 있습니다.');
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    if (items.length === 0) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const { bytes, productCount } = await generateWingExcelForCandidates(
      items.map((item) => item.candidateId),
      {
        ...WING_PRODUCT_DRAFT_DEFAULTS,
        defaultBrand: values.brand ?? WING_PRODUCT_DRAFT_DEFAULTS.defaultBrand,
        defaultMaker: values.maker ?? WING_PRODUCT_DRAFT_DEFAULTS.defaultMaker,
      },
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadWingExcel(bytes, `쿠팡WING_일괄등록_${stamp}.xlsx`);
    return {
      ok: true,
      confirmed: false,
      manualSteps: [
        `WING 판매자센터 > 상품등록 > 일괄등록에 내려받은 파일(${productCount}건)을 올리세요.`,
        '상세설명은 엑셀에 담기지 않습니다. WING에서 상품별로 추가하세요.',
      ],
      warnings: [],
    };
  },
};
