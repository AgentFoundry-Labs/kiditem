import { z } from 'zod';

const money = z.number().int().min(0).max(1_000_000_000);

/**
 * 등록 대상이 고른 옵션 — 선택만 한다(KID-313 W2). 가격은 판매 상품 옵션 한 곳에만 있고
 * 몰별 가격 override 는 없다. 계정마다 다른 가격이 필요해지면 열 하나를 되살린다.
 */
export const RegistrationTargetOptionInputSchema = z.object({
  salesProductOptionId: z.string().uuid(),
}).strict();
export type RegistrationTargetOptionInput = z.infer<typeof RegistrationTargetOptionInputSchema>;

const mallFieldValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

/**
 * 등록 대상의 몰 전용 값(KID-313 W2). 상품 사실(이름·설명·이미지·가격·상세·고시·키워드)은
 * 여기 두지 않는다 — 판매 상품 · 옵션 · 콘텐츠 revision 이 정본이다.
 *
 * - `mallCategory`: 그 몰의 카테고리 선택.
 * - `mallFields`: 몰 폼에만 있는 칸(배송 템플릿 · 반품지 · 몰 브랜드 코드 …). 어댑터가 키를 검증한다.
 * - `adapter`: 몰 어댑터가 실행 사이에 들고 다니는 값. 채널 키로 namespace 한다(`coupang` …).
 *   KID-321 이 몰 중립 실행으로 옮기면서 줄인다. 실행 시점의 사실(연결된 옵션 · 몰 상품 id)은
 *   실행 payload 에 동결되지 여기 남지 않는다.
 */
export const RegistrationMallInputSchema = z.object({
  mallCategory: z.object({
    key: z.string().trim().min(1).max(200),
    label: z.string().trim().max(500).nullable().default(null),
  }).strict().nullable().default(null),
  mallFields: z.record(z.string().max(120), mallFieldValue).default({}),
  adapter: z.record(z.string().max(40), z.record(z.string().max(120), z.unknown())).default({}),
}).strict();
export type RegistrationMallInput = z.infer<typeof RegistrationMallInputSchema>;

/** 옛 `registrationInput` 이 상품 사실을 복사해 두던 키 — 새 계약은 이 키를 거절한다. */
export const REGISTRATION_INPUT_PRODUCT_FACT_KEYS = [
  'name', 'productName', 'sellerProductName', 'originalName', 'displayName',
  'salePrice', 'normalPrice', 'supplyPrice', 'priceRateBp', 'promoText',
  'detailHtml', 'extraDetailHtml', 'thumbnailUrls', 'imageUrls', 'representativeImageUrl',
  'notice', 'noticeCategory', 'keywords', 'tags', 'manufacturer', 'maker', 'brand',
  'sourceCategory', 'description',
] as const;

const editable = {
  registrationInput: RegistrationMallInputSchema.default({ mallCategory: null, mallFields: {}, adapter: {} }),
  /** 이 몰에 올릴 대표이미지 — Content 자산 id(교차 owner scalar id). 비면 워크스페이스의 현재 썸네일. */
  selectedThumbnailAssetId: z.string().uuid().nullable().default(null),
  /** 이 몰에 올릴 상세 — Content revision id. 비면 워크스페이스의 현재 revision. */
  selectedDetailPageRevisionId: z.string().uuid().nullable().default(null),
  selectedOptions: z.array(RegistrationTargetOptionInputSchema).max(200)
    .refine(options => new Set(options.map(option => option.salesProductOptionId)).size === options.length,
      '같은 옵션을 두 번 선택할 수 없습니다.'),
};
/**
 * 등록 설정이 생기는 길은 이것 하나다(KID-313) — 이 자리에서 설정을 찾거나 만들고, 처음 만들 때 그
 * 상품에 KID 를 발급한다. 상품 × 몰 계정당 활성 설정은 하나라 고를 것이 없다 — 행사용 등록은 별도
 * 판매상품이다. 값은 만든 뒤 update 로 고친다.
 */
export const RegistrationTargetResolveInputSchema = z.object({
  salesProductId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
}).strict();
export type RegistrationTargetResolveInput = z.infer<typeof RegistrationTargetResolveInputSchema>;
export const RegistrationTargetUpdateInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  ...editable,
}).strict();
export type RegistrationTargetUpdateInput = z.infer<typeof RegistrationTargetUpdateInputSchema>;
export const RegistrationTargetSchema = z.object({
  id: z.string().uuid(),
  salesProductId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  version: z.number().int().positive(),
  ...editable,
  /** 판매 상품에서 읽은 값 — 등록 대상은 이름과 가격을 저장하지 않는다. */
  resolved: z.object({
    name: z.string(),
    options: z.array(z.object({
      salesProductOptionId: z.string().uuid(),
      /** 발급된 KID. 아직 팔기로 하지 않은 초안의 단품은 비어 있다. */
      code: z.string().nullable(),
      values: z.array(z.string()),
      /** 판매 상품 옵션의 값. 초안이라 아직 정하지 않았으면 null. */
      salePrice: money.nullable(),
      normalPrice: money.nullable(),
    })),
  }),
});
export type RegistrationTarget = z.infer<typeof RegistrationTargetSchema>;

/** 울타리가 말하는 판매상품 초안의 등록 상태(가장 최근 실행 기준). */
export const SALES_PRODUCT_REGISTRATION_STATES = ['none', 'preparing', 'confirming', 'failed', 'registered'] as const;
export const SalesProductRegistrationStateValueSchema = z.enum(SALES_PRODUCT_REGISTRATION_STATES);

/**
 * `GET /api/products/sales-products/:salesProductId/registration/state` 응답. 후보가 있든 없든
 * 초안마다 같은 모양이다. 등록 설정은 상품 × 몰 계정당 하나라 `targets` 는 계정마다 한 줄이다.
 */
export const SalesProductRegistrationStateSchema = z.object({
  registrationState: SalesProductRegistrationStateValueSchema,
  targets: z.array(z.object({
    id: z.string().uuid(),
    channelAccountId: z.string().uuid(),
    channelListingId: z.string().uuid().nullable(),
    status: z.enum(['draft', 'submitting', 'registered', 'failed', 'cancelled']),
    selectedThumbnailAssetId: z.string().uuid().nullable(),
    selectedDetailPageRevisionId: z.string().uuid().nullable(),
    updatedAt: z.string(),
  }).strict()),
}).strict();
export type SalesProductRegistrationState = z.infer<typeof SalesProductRegistrationStateSchema>;
