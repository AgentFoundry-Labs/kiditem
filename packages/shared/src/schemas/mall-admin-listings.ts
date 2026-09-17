import { z } from 'zod';

/**
 * 몰 관리자 화면에서 등록 상품(몰 상품코드)을 직접 가져오는 원천의 계약(KID-246 2단계).
 *
 * 사방넷에 없는 몰은 그 몰의 상품 목록을 확장이 읽는다. 가져오기 한 번은 몰 계정 행
 * (ADR-0012) 하나의 시도 하나이고, 완료 스냅샷은 그 몰의 상품 목록 전체다. 몰마다 읽는
 * 방법은 확장의 읽기기가 알고, 몰이 준 상태 글자를 우리 어휘로 접는 것은 서버 도메인이 한다.
 *
 * 몰 상품 목록에는 셀피아 상품코드가 없다. 대신 몰마다 셀피아 상품 이름을 적어 두는 칸이
 * 있어(키드키즈 송장용 상품명, 아이스크림몰 고시 품명) 옵션 이름으로 넘기면 기존 이름
 * 매칭이 셀피아 SKU 에 잇는다.
 */

export const MALL_ADMIN_LISTINGS_SOURCE_TYPE = 'mall_admin_listings';
export const MALL_ADMIN_LISTINGS_PARSER_VERSION = 'mall-admin-listings-v1';
export const MALL_ADMIN_LISTINGS_PRODUCER = 'orders.mall_admin_listings';
export const MALL_ADMIN_LISTING_ROW_LIMIT = 20_000;
export const MALL_ADMIN_LISTING_PAGE_LIMIT = 1_000;

/**
 * 직접 읽기기가 있는 몰. 키는 몰 계정 행의 `channel` 이다.
 *
 * - `origin`: 읽는 관리자 서버. 확장 호스트 권한과 같아야 한다.
 * - `pageSize`: 한 요청으로 읽는 상품 수의 상한. 두 몰 모두 상품 전체가 한 요청에 들어오도록
 *   크게 둔다 — 키드키즈는 상품리스트 다운로드(엑셀)가 전체를 한 번에 주고, 아이스크림몰은
 *   목록 API 가 한 쪽에 만 건까지 준다. 쪽을 나누면 정렬 동률로 상품이 겹치거나 빠진다.
 * - `detailNames`: 셀피아 쪽 이름을 상품 상세 화면에서만 읽을 수 있는가.
 */
export const MALL_ADMIN_LISTING_READERS = {
  kidkids: {
    mallName: '키드키즈',
    origin: 'https://partner.kidkids.net',
    pageSize: 20_000,
    detailNames: false,
  },
  'icecream-mall': {
    mallName: '아이스크림몰',
    origin: 'https://po.i-screammall.co.kr',
    pageSize: 10_000,
    detailNames: true,
  },
  /**
   * 온채널 공급사. 등록 상품 관리 화면이 쪽 크기를 고르지 못해 15줄씩 46쪽을 다 돈다
   * (라이브 2026-09-17: 687개). 쪽 경계가 상품코드로 갈려 겹치지 않는다.
   */
  onch: {
    mallName: '온채널',
    origin: 'https://www.onch3.co.kr',
    pageSize: 15,
    detailNames: false,
  },
  /**
   * 꼬망세(EduPre) 입점관리자. 배송상품 목록이 쪽 크기를 받아 줘 전체가 한 번에 들어온다
   * (라이브 2026-09-18: 2,602개).
   */
  kkomangse: {
    mallName: '꼬망세',
    origin: 'https://nstore.edupre.co.kr',
    pageSize: 10_000,
    detailNames: false,
  },
} as const satisfies Record<string, {
  mallName: string;
  origin: string;
  pageSize: number;
  detailNames: boolean;
}>;
export type MallAdminListingMallKey = keyof typeof MALL_ADMIN_LISTING_READERS;
export const MALL_ADMIN_LISTING_MALL_KEYS = Object.keys(
  MALL_ADMIN_LISTING_READERS,
) as [MallAdminListingMallKey, ...MallAdminListingMallKey[]];

export function isMallAdminListingMallKey(value: unknown): value is MallAdminListingMallKey {
  return typeof value === 'string' && Object.hasOwn(MALL_ADMIN_LISTING_READERS, value);
}

const MallKeySchema = z.enum(MALL_ADMIN_LISTING_MALL_KEYS);
const YYYY_MM_DD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);

export const MallAdminListingsBeginSchema = z.object({
  mallKey: MallKeySchema,
}).strict();
export type MallAdminListingsBegin = z.infer<typeof MallAdminListingsBeginSchema>;

export const MallAdminListingsPlanSchema = z.object({
  sourceType: z.literal(MALL_ADMIN_LISTINGS_SOURCE_TYPE),
  parserVersion: z.literal(MALL_ADMIN_LISTINGS_PARSER_VERSION),
  mallKey: MallKeySchema,
  /** 몰 허브가 고르는 그 몰의 계정 행. 완료할 때 같은 행인지 다시 본다. */
  channelAccountId: z.string().uuid(),
  sourceOrigin: z.string().url(),
  pageSize: z.number().int().positive().max(20_000),
}).strict().superRefine((plan, ctx) => {
  const reader = MALL_ADMIN_LISTING_READERS[plan.mallKey];
  if (plan.sourceOrigin !== reader.origin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceOrigin'], message: 'Unknown mall origin' });
  }
  if (plan.pageSize !== reader.pageSize) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pageSize'], message: 'Unexpected page size' });
  }
});
export type MallAdminListingsPlan = z.infer<typeof MallAdminListingsPlanSchema>;

export const MallAdminListingsAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  generation: z.string().regex(/^\d+$/),
  plan: MallAdminListingsPlanSchema,
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorCode: boundedText(100).nullable(),
  errorMessage: boundedText(300).nullable(),
}).strict();
export type MallAdminListingsAttempt = z.infer<typeof MallAdminListingsAttemptSchema>;

/** 확장만 받는 시도 모양. 쓰기 토큰이 붙는다. */
export const MallAdminListingsControlSchema = MallAdminListingsAttemptSchema.extend({
  attemptToken: z.string().uuid(),
}).strict();
export type MallAdminListingsControl = z.infer<typeof MallAdminListingsControlSchema>;

/** 완료한 가져오기가 남긴 결과. */
export const MallAdminListingsPublicationSchema = z.object({
  /** 이번에 받은 몰 상품코드 수. */
  listings: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  /** 전에 받았는데 이번 목록에 없어 끈 리스팅 수. */
  deactivated: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  /** 셀피아 쪽 이름을 읽지 못한 상품 수. 그 상품은 상품명으로만 잇는다. */
  missingNames: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  /**
   * 몰에 셀피아 코드가 심겨 있어 코드로 정확히 이을 수 있는 상품 수.
   *
   * 이 칸이 생기기 전에 저장된 발행 결과에도 기본값으로 붙는다 — 새 칸 하나 때문에 옛
   * 결과를 통째로 못 읽으면 화면이 "0개 가져옴"이라고 거짓말을 한다.
   */
  codedListings: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT).default(0),
  /** 우리 상태 글자별 상품 수. */
  statuses: z.record(requiredText(20), z.number().int().min(1).max(MALL_ADMIN_LISTING_ROW_LIMIT))
    .refine((value) => Object.keys(value).length <= 20, 'Too many statuses'),
}).strict();
export type MallAdminListingsPublication = z.infer<typeof MallAdminListingsPublicationSchema>;

export const MallAdminListingsSourceMallSchema = z.object({
  mallKey: MallKeySchema,
  mallName: requiredText(40),
  /** 그 몰의 계정 행. 없으면 가져올 곳이 없다. */
  channelAccountId: z.string().uuid().nullable(),
  latestAttempt: MallAdminListingsAttemptSchema.nullable(),
  latestComplete: MallAdminListingsAttemptSchema.nullable(),
  /** `latestComplete` 가 남긴 결과. */
  latestPublication: MallAdminListingsPublicationSchema.nullable(),
}).strict();
export type MallAdminListingsSourceMall = z.infer<typeof MallAdminListingsSourceMallSchema>;

/** 직접 읽기기가 있는 몰 전부의 현재. 화면 하나가 이 목록 하나를 읽는다. */
export const MallAdminListingsSourceSchema = z.object({
  malls: z.array(MallAdminListingsSourceMallSchema),
}).strict();
export type MallAdminListingsSource = z.infer<typeof MallAdminListingsSourceSchema>;

/**
 * 몰 상품 한 줄. 몰 화면에서 이 칸만 고른다.
 *
 * `statusWords` 는 몰이 준 상태 글자 그대로다(키드키즈 상품리스트 `정상` · `일시품절` ·
 * `영구품절` · `보류`, 아이스크림몰 `판매중` · `전시안함`). 우리 어휘로 접는 것은 서버가 한다.
 */
export const MallAdminListingRowSchema = z.object({
  /** 몰 상품코드. 옵션 외부 ID 칸이 60자다. */
  mallProductCode: requiredText(60),
  productName: requiredText(400),
  /** 몰에 적어 둔 셀피아 상품 이름 — 키드키즈 송장용 상품명, 아이스크림몰 고시 품명. */
  sellpiaName: requiredText(400).nullable(),
  /**
   * 몰의 자체상품코드 칸에 우리가 심어 둔 셀피아 SKU 코드(키드키즈 `P 코드`, 아이스크림몰
   * `업체상품코드`). 사방넷이 `모델명`에 셀피아 코드를 넣어 보낸 것과 같은 자리다 — 이 값이
   * 있으면 이름이 아니라 코드로 정확히 잇는다. 아직 안 심은 상품은 비어 있다.
   */
  sellerCode: requiredText(60).nullable(),
  salePrice: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  statusWords: z.array(requiredText(20)).min(1).max(4),
  registeredOn: YYYY_MM_DD.nullable(),
  /** 몰이 들고 있는 대표 사진. 목록에 사진이 있는 몰만 싣는다. */
  imageUrl: z.string().url().max(2_000).optional(),
}).strict();
export type MallAdminListingRow = z.infer<typeof MallAdminListingRowSchema>;

export const MallAdminListingsCollectionSchema = z.object({
  collectionRunId: z.string().uuid(),
  /** 몰이 알린 전체 상품 수. */
  totalRecords: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  /** 실제로 읽은 상품 줄 수. */
  recordsRead: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  pagesRead: z.number().int().min(0).max(MALL_ADMIN_LISTING_PAGE_LIMIT),
  totalPages: z.number().int().min(0).max(MALL_ADMIN_LISTING_PAGE_LIMIT),
  /** 셀피아 쪽 이름을 읽으려고 연 상세 화면 가운데 읽은 수와 읽지 못한 수. */
  detailsRead: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  detailsMissing: z.number().int().min(0).max(MALL_ADMIN_LISTING_ROW_LIMIT),
}).strict();
export type MallAdminListingsCollection = z.infer<typeof MallAdminListingsCollectionSchema>;

export const MallAdminListingsSubmissionSchema = z.object({
  collection: MallAdminListingsCollectionSchema,
  rows: z.array(MallAdminListingRowSchema).max(MALL_ADMIN_LISTING_ROW_LIMIT),
  proof: z.object({
    mallKey: MallKeySchema,
    pageSize: z.number().int().positive().max(20_000),
    validatedList: z.literal(true),
  }).strict(),
}).strict();
export type MallAdminListingsSubmission = z.infer<typeof MallAdminListingsSubmissionSchema>;

/** 확장이 돌려주는 실패 이유. 화면이 한국어 문장으로 바꾼다. */
export const MALL_ADMIN_LISTINGS_FAILURE_CODES = [
  'mall_login_required',
  'mall_contract_drift',
  'mall_total_changed',
  'mall_invalid_snapshot',
  'mall_timeout',
  'mall_network_failed',
] as const;
export type MallAdminListingsFailureCode = (typeof MALL_ADMIN_LISTINGS_FAILURE_CODES)[number];
