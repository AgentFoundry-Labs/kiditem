import { z } from 'zod';
import { OperationViewSchema } from './operation.js';

/**
 * 사방넷 송신 기록으로 몰마다 등록된 상품(몰 상품코드)을 가져오는 원천의 계약(KID-246).
 *
 * 사방넷은 상품을 몰로 보낼 때마다 "몰 × 상품" 한 줄을 남기고, 그 줄에 몰이 돌려준
 * 상품코드가 붙는다. 이 원천은 그 목록 전체를 한 번에 읽어 몰 계정 행(ADR-0012)마다
 * 리스팅으로 발행한다. 사방넷 모델명은 셀피아 재고 SKU 코드와 같아서, 옵션의
 * `sellerSku` 로 넣으면 기존 자동 매칭이 마스터 상품까지 잇는다.
 */

/** 사방넷 관리자 서버. 확장 호스트 권한과 같은 값이어야 한다. */
export const SABANGNET_ADMIN_ORIGIN = 'https://sbadmin08.sabangnet.co.kr';
/** 사방넷 "쇼핑몰상품수정" 목록 조회 — 몰 × 상품 송신 기록. 읽기 전용이다. */
export const SABANGNET_MALL_LISTING_LIST_PATH =
  '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists';
export const SABANGNET_MALL_LISTINGS_SOURCE_TYPE = 'sabangnet_mall_listings';
export const SABANGNET_MALL_LISTINGS_PARSER_VERSION = 'sabangnet-mall-listings-v1';
export const SABANGNET_MALL_LISTING_PAGE_SIZE = 500;
export const SABANGNET_MALL_LISTING_ROW_LIMIT = 20_000;
export const SABANGNET_MALL_LISTING_PAGE_LIMIT = 100;

const SHOP_ID = z.string().regex(/^shop\d{4}$/);
const YYYYMMDD = z.string().regex(/^\d{8}$/);
const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);

/**
 * 사방넷 쇼핑몰 ID → 우리 몰 키(몰 계정 행의 `channel`).
 *
 * 쿠팡(shop0075)은 Wing 가져오기가 따로 있어 받지 않는다 — 한 계정에 가져오기가 둘이면
 * 서로의 리스팅을 없어진 것으로 본다. 하프클럽(신)은 셀러클럽(TRICYCLE) 계정 하나로
 * 하프클럽과 보리보리에 함께 올라가므로 우리 `boribori` 계정 행이 받는다.
 */
export const SABANGNET_SHOP_MALL_KEYS = {
  shop0387: 'boribori',
  shop0372: 'lotte-on',
  shop0100: 'ssg',
  shop0055: 'smartstore',
  shop0472: 'kidsnote',
  shop0464: '11st',
  shop0003: '11st',
  shop0067: 'auction',
  shop0068: 'gmarket',
  shop0319: 'domeggook',
  shop0438: 'teacher-mall',
  shop0007: 'gs-shop',
  shop0273: 'kakao',
  shop0498: 'always',
  shop0661: 'thirtymall',
} as const satisfies Record<string, string>;
export type SabangnetShopId = keyof typeof SABANGNET_SHOP_MALL_KEYS;
export type SabangnetMallKey = (typeof SABANGNET_SHOP_MALL_KEYS)[SabangnetShopId];

/** 몰 키마다 그 몰로 오는 사방넷 쇼핑몰 ID. 표 순서를 따른다. */
export function sabangnetShopIdsByMallKey(): ReadonlyMap<SabangnetMallKey, readonly string[]> {
  const byMall = new Map<SabangnetMallKey, string[]>();
  for (const [shopId, mallKey] of Object.entries(SABANGNET_SHOP_MALL_KEYS)) {
    byMall.set(mallKey, [...(byMall.get(mallKey) ?? []), shopId]);
  }
  return byMall;
}

export const SabangnetMallListingsPlanMallSchema = z.object({
  mallKey: requiredText(40),
  channelAccountId: z.string().uuid(),
  sabangnetShopIds: z.array(SHOP_ID).min(1).max(10),
}).strict();
export type SabangnetMallListingsPlanMall = z.infer<typeof SabangnetMallListingsPlanMallSchema>;

export const SabangnetMallListingsPlanSchema = z.object({
  sourceType: z.literal(SABANGNET_MALL_LISTINGS_SOURCE_TYPE),
  parserVersion: z.literal(SABANGNET_MALL_LISTINGS_PARSER_VERSION),
  sourceOrigin: z.literal(SABANGNET_ADMIN_ORIGIN),
  listPath: z.literal(SABANGNET_MALL_LISTING_LIST_PATH),
  pageSize: z.literal(SABANGNET_MALL_LISTING_PAGE_SIZE),
  /** 사방넷 첫 송신일 검색 범위. 끝은 시작한 날(KST)이다. */
  dateFrom: YYYYMMDD,
  dateTo: YYYYMMDD,
  malls: z.array(SabangnetMallListingsPlanMallSchema).min(1).max(40),
}).strict().superRefine((plan, ctx) => {
  if (plan.dateFrom > plan.dateTo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dateFrom'], message: 'Invalid date range' });
  }
  const shopIds = plan.malls.flatMap((mall) => mall.sabangnetShopIds);
  if (new Set(shopIds).size !== shopIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['malls'], message: 'Shop ids must be unique' });
  }
  const accounts = plan.malls.map((mall) => mall.channelAccountId);
  if (new Set(accounts).size !== accounts.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['malls'], message: 'Accounts must be unique' });
  }
});
export type SabangnetMallListingsPlan = z.infer<typeof SabangnetMallListingsPlanSchema>;

/** 성공한 실행이 몰 하나에 남긴 결과(`result.malls`). */
export const SabangnetMallListingsPublicationSchema = z.object({
  mallKey: requiredText(40),
  channelAccountId: z.string().uuid(),
  /** 이번에 받은 몰 상품코드 수. */
  listings: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
  /** 전에 받았는데 이번 목록에 없어 끈 리스팅 수. */
  deactivated: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
}).strict();
export type SabangnetMallListingsPublication = z.infer<typeof SabangnetMallListingsPublicationSchema>;

export const SabangnetMallListingsSourceMallSchema = z.object({
  mallKey: requiredText(40),
  /** 그 몰의 계정 행. 없으면 가져올 곳이 없다. */
  channelAccountId: z.string().uuid().nullable(),
  sabangnetShopIds: z.array(SHOP_ID).min(1).max(10),
}).strict();
export type SabangnetMallListingsSourceMall = z.infer<typeof SabangnetMallListingsSourceMallSchema>;

/** `channels.sabangnet_mall_listings` 실행의 `result`(KID-363): 몰마다의 결과와 받은 송신 기록 수. */
export const SabangnetMallListingsResultSchema = z.object({
  malls: z.array(SabangnetMallListingsPublicationSchema),
  rows: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
}).strict();
export type SabangnetMallListingsResult = z.infer<typeof SabangnetMallListingsResultSchema>;

/**
 * 사방넷 가져오기의 현재(`GET /channels/sabangnet-listings/source`) — 받을 몰(계정 행)과 이 kind의 최근 실행·최근
 * 성공 실행, 그 성공이 몰마다 남긴 결과. 실행은 실행 계약의 모양 그대로다(ADR-0025).
 */
export const SabangnetMallListingsSourceSchema = z.object({
  /** 받을 몰 계정 행이 하나라도 있는가. */
  ready: z.boolean(),
  malls: z.array(SabangnetMallListingsSourceMallSchema),
  latestOperation: OperationViewSchema.nullable(),
  latestSucceeded: OperationViewSchema.nullable(),
  /** `latestSucceeded` 가 몰마다 남긴 결과. */
  latestPublication: z.array(SabangnetMallListingsPublicationSchema),
}).strict();
export type SabangnetMallListingsSource = z.infer<typeof SabangnetMallListingsSourceSchema>;

/**
 * 송신 기록 한 줄. 사방넷 응답에서 이 칸만 고른다 — 응답에는 몰 로그인 ID와 비밀번호
 * 칸이 함께 오므로, 확장은 목록 원문을 넘기지 않는다.
 */
export const SabangnetMallListingRowSchema = z.object({
  /** 사방넷 송신번호(`prdRegsTrnmSrno`). 같은 기록이 두 번 오면 거절한다. */
  sendSerial: z.string().regex(/^\d{1,30}$/),
  sabangnetShopId: SHOP_ID,
  /** 몰 상품코드(`shmaPrdNo`). 옵션 외부 ID 칸이 60자다. */
  mallProductCode: requiredText(60),
  /** 사방넷 품번(`prdNo`). */
  sabangnetProductNo: z.string().regex(/^\d{1,30}$/),
  /** 사방넷 모델명(`modlNm`). 셀피아 재고 SKU 코드와 같다. */
  modelName: requiredText(120).nullable(),
  /** 사방넷 자체상품코드(`onsfPrdCd`). 바코드인 경우가 많다. */
  ownProductCode: requiredText(120).nullable(),
  productName: requiredText(400),
  salePrice: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  /** 사방넷 공급상태 이름(`prdSplyStsCdNm`) — 공급중 · 일시중지 · 완전품절 · 대기중. */
  supplyStatus: requiredText(20),
  /** 첫 송신 시각(`prdRegsFstTrnmDt`, `yyyyMMdd HH:mm`). */
  firstSentAt: z.string().regex(/^\d{8} \d{2}:\d{2}$/).nullable(),
}).strict();
export type SabangnetMallListingRow = z.infer<typeof SabangnetMallListingRowSchema>;

export const SabangnetMallListingsCollectionSchema = z.object({
  /** 사방넷이 알린 전체 송신 기록 수(모든 몰). */
  totalRecords: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
  /** 실제로 읽은 송신 기록 수(실패 메시지 줄 제외, 모든 몰). */
  recordsRead: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
  pagesRead: z.number().int().min(0).max(SABANGNET_MALL_LISTING_PAGE_LIMIT),
  totalPages: z.number().int().min(0).max(SABANGNET_MALL_LISTING_PAGE_LIMIT),
  truncated: z.boolean(),
  /** 계획에 없는 쇼핑몰의 기록 수. 넘기지 않고 세기만 한다. */
  skippedByShop: z.record(SHOP_ID, z.number().int().min(1).max(SABANGNET_MALL_LISTING_ROW_LIMIT))
    .refine((value) => Object.keys(value).length <= 200, 'Too many skipped shops'),
  /** 몰 상품코드가 비어 넘기지 못한 기록 수. */
  missingMallCode: z.number().int().min(0).max(SABANGNET_MALL_LISTING_ROW_LIMIT),
}).strict();
export type SabangnetMallListingsCollection = z.infer<typeof SabangnetMallListingsCollectionSchema>;

/**
 * 목록을 끝까지 읽었다는 증거(`listing_scan` 청크 하나, KID-363). owner finalize가 이것으로 송신 기록 전체인지
 * 보고, 아니면 아무것도 쓰지 않는다 — 한 페이지만 빠져도 그 페이지의 상품이 몰에서 내려간 것으로 보인다.
 */
export const SabangnetMallListingsScanSchema = z.object({
  collection: SabangnetMallListingsCollectionSchema,
  proof: z.object({
    dateFrom: YYYYMMDD,
    dateTo: YYYYMMDD,
    pageSize: z.literal(SABANGNET_MALL_LISTING_PAGE_SIZE),
    validatedList: z.literal(true),
  }).strict(),
}).strict();
export type SabangnetMallListingsScan = z.infer<typeof SabangnetMallListingsScanSchema>;
