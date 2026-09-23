import { prepareRegistration } from '../sales-product-registration';
import { fillMallRegistrationForm } from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import {
  GSSHOP_BRAND,
  GSSHOP_DEFAULT_CATEGORY,
  GSSHOP_DEFAULT_SECTION,
  GSSHOP_MARGIN_RATE,
  gsshopFormFromDraft,
  gsshopSupplierProductCode,
  gsshopSupplyPrice,
  parseGsshopCategory,
  parseGsshopSection,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/gsshop-registration-form';
import { formatNumber } from '@/lib/utils';
import { listPriceProblem, mallFormExecutionOptions, publishItemSalesProductId, registrationOutcome } from '../mall-publish-adapter';
import type {
  MallFieldSpec,
  MallPreviewRow,
  MallPublishAdapter,
  MallSendInput,
  MallSendOutcome,
} from '../mall-publish-adapter';

/**
 * GS SHOP 파트너스 어댑터(`partners.gsshop.com`).
 *
 * 실측 2026-09-14. 규칙은 폼 빌더(`gsshop-registration-form.ts`)에 적었다. 화면은 React 한 페이지이고
 * 확장의 전용 채움 함수가 화면의 처리 함수를 사람 순서대로 부른다. [전체저장] 은 사람이 누른다.
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
    key: 'gsshopCategory',
    label: 'GS샵 상품분류 코드',
    origin: 'override',
    control: 'text',
    defaultValue: GSSHOP_DEFAULT_CATEGORY.code,
    required: false,
    help: `대·중·소·세분류를 이은 코드. 기본은 기존 등록물과 같은 ${GSSHOP_DEFAULT_CATEGORY.label} 입니다.`,
  },
  {
    key: 'gsshopSection',
    label: 'GS샵 전시 카테고리 번호',
    origin: 'override',
    control: 'text',
    defaultValue: GSSHOP_DEFAULT_SECTION.id,
    required: false,
    help: `화면의 매장번호. 기본은 ${GSSHOP_DEFAULT_SECTION.label} 입니다.`,
  },
  {
    key: 'gsshopSupplierCode',
    label: 'GS샵 협력사 상품코드',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    help: '비우면 상품마다 KID로 시작하는 코드를 만듭니다. 영문·숫자 20자 이내.',
  },
  {
    key: 'certNumber',
    label: '안전인증번호',
    origin: 'override',
    control: 'text',
    defaultValue: '',
    required: false,
    shared: true,
    help: '있으면 정보고시 인증 칸에 적습니다. 여러 몰이 같은 값을 씁니다.',
  },
];

function parsePositive(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 칸이 비었으면 기본값, 적었는데 모양이 틀리면 `null`(막는다). */
function categoryFrom(raw: string | undefined): string | null {
  return (raw ?? '').trim() ? parseGsshopCategory(raw) : GSSHOP_DEFAULT_CATEGORY.code;
}

function sectionFrom(raw: string | undefined): string | null {
  return (raw ?? '').trim() ? parseGsshopSection(raw) : GSSHOP_DEFAULT_SECTION.id;
}

function supplierCodeProblem(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return !text || /^[A-Za-z0-9\-_()]{1,20}$/.test(text)
    ? null
    : 'GS샵 협력사 상품코드는 영문·숫자·-_() 20자 이내여야 합니다.';
}

/** 초안이 없는 옛 수집상품 줄은 미리보기를 깨뜨리지 않고 확인을 부탁한다(보낼 때는 막힌다). */
function previewSupplierCode(item: Parameters<MallPublishAdapter['preview']>[0]): string {
  try {
    return `${gsshopSupplierProductCode(publishItemSalesProductId(item))} (자동)`;
  } catch {
    return '상세에서 확인';
  }
}

export const gsShopAdapter: MallPublishAdapter = {
  mallKey: 'gs-shop',
  mallName: 'GS샵',
  mode: 'form',
  batchSize: 1,
  requiresOperatorSubmit: true,
  fields: FIELDS,

  preview(item, values): MallPreviewRow[] {
    const salePrice = item.salePrice ?? 0;
    const cert = values.certNumber?.trim();
    return [
      {
        label: '노출상품명',
        value: `${item.name.replace(/^\d{3,}(?=\S)/, '')} (${parsePositive(values.quantity, 1)}p) + 키워드 (브랜드 ${GSSHOP_BRAND.name})`,
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '판매가 / 수수료율 / 공급가',
        value: salePrice > 0
          ? `${formatNumber(salePrice)}원 / ${GSSHOP_MARGIN_RATE}% / 약 ${formatNumber(gsshopSupplyPrice(salePrice))}원`
          : '상세에서 확인',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '상품분류 · 전시',
        value: `${categoryFrom(values.gsshopCategory) ?? '형식 확인 필요'} · ${sectionFrom(values.gsshopSection) ?? '형식 확인 필요'}`,
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '협력사 상품코드',
        // 채우는 폼과 같은 id(판매상품 초안)로 만든다 — 미리보기와 실제 코드가 달라지면 안 된다.
        value: values.gsshopSupplierCode?.trim() || previewSupplierCode(item),
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '정보고시',
        value: cert ? `기타 재화 · 인증 KC ${cert}` : '기타 재화 · 인증 해당없음',
        origin: 'override',
        mallSpecific: true,
      },
      {
        label: '배송',
        value: 'CJ대한통운 · 3,000원(3만원 이상 무료) · 반품 3,000 · 교환 6,000 · 제주/도서 3,000',
        origin: 'template',
        mallSpecific: true,
      },
      {
        label: '이미지 · 기술서',
        value: '대표 + 추가 최대 7장 · 기술서 사진 한 장(GS 편집기 업로드로 넣음)',
        origin: 'master',
        mallSpecific: true,
      },
      {
        label: '저장',
        value: '확인 뒤 사람이 직접 [전체저장]',
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
    if (!categoryFrom(values.gsshopCategory)) problems.push('GS샵 상품분류 코드는 `B35012701` 모양이어야 합니다.');
    if (!sectionFrom(values.gsshopSection)) problems.push('GS샵 전시 카테고리는 매장번호(숫자)여야 합니다.');
    const code = supplierCodeProblem(values.gsshopSupplierCode);
    if (code) problems.push(code);
    return problems;
  },

  async send({ items, values }: MallSendInput): Promise<MallSendOutcome> {
    const item = items[0];
    if (!item) {
      return { ok: false, confirmed: false, manualSteps: [], warnings: [], error: '보낼 상품이 없습니다.' };
    }
    const category = categoryFrom(values.gsshopCategory);
    const sectionId = sectionFrom(values.gsshopSection);
    const codeProblem = supplierCodeProblem(values.gsshopSupplierCode);
    if (!category || !sectionId || codeProblem) {
      return {
        ok: false,
        confirmed: false,
        manualSteps: [],
        warnings: [],
        error: codeProblem ?? 'GS샵 분류·전시 카테고리 형식이 틀렸습니다.',
      };
    }
    const { draft } = await prepareRegistration(item, 'gs-shop');
    const certNumber = values.certNumber?.trim();
    const supplierProductCode = values.gsshopSupplierCode?.trim();
    const form = gsshopFormFromDraft(draft, {
      quantity: parsePositive(values.quantity, 1),
      category,
      sectionId,
      ...(supplierProductCode ? { supplierProductCode } : {}),
      ...(certNumber ? { certNumber } : {}),
    });
    const result = await fillMallRegistrationForm('gs-shop', draft, form, mallFormExecutionOptions(item));
    return registrationOutcome(result);
  },
};
