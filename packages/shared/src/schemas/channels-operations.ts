import { z } from 'zod';
import { ProviderOutcomeSchema } from '../operation-lifecycle.js';
import { TARGET_EXECUTION_KINDS } from '../registration-execution.js';
import { THUMBNAIL_UPDATE_EXECUTION_KIND } from '../thumbnail-execution.js';
import { resourceLockKey, type OperationLockKey } from './operation.js';

/**
 * Channels owner의 "기타" 실행 kind(ADR-0025, KID-363 wave3). Wing 카탈로그 kind 셋은 `coupang-catalog-snapshot`에,
 * 셀피아 수동매칭은 `sellpia-operations`에 있다. 여기에는 wire에 함께 쓰는 이름·scope·잠금 키·1차 몰 목록만 둔다.
 */
export const SABANGNET_MALL_LISTINGS_KIND = 'channels.sabangnet_mall_listings' as const;
export const MALL_ADMIN_LISTINGS_KIND = 'channels.mall_admin_listings' as const;
export const ROCKET_MATCHING_CSV_KIND = 'channels.rocket_matching_csv' as const;

/**
 * 사방넷 관리자(sbadmin08)는 조직마다 로그인 하나이고 한 실행이 몰 여러 곳의 목록을 읽는다 → 잠금은 사방넷 로그인 키
 * 하나(리더 결정, KID-363 wave3: 몰 계정 키 여럿 대신). 리스팅 쓰기는 finalize 트랜잭션이 지킨다.
 */
export const SABANGNET_LOGIN_LOCK_KEY: OperationLockKey = resourceLockKey('sabangnet', 'login');

/** 사방넷 몰 목록: 대상 몰·shop id는 owner plan이 계정 표에서 정한다(옛 begin `{}`과 같다). */
export const SabangnetMallListingsScopeSchema = z.object({}).strict();
export type SabangnetMallListingsScope = z.infer<typeof SabangnetMallListingsScopeSchema>;

/**
 * 몰 관리자 목록: 몰 계정 하나. lockKey `account:<channelAccountId>`. 직접 읽기기가 있는 몰(`MALL_ADMIN_LISTING_READERS`)은
 * 모두 이 kind다(KID-363 1차 넷 → KID-381 나머지 12곳) — 옛 attempt 경로는 없다.
 */
export const MallAdminListingsScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().min(1).max(64),
}).strict();
export type MallAdminListingsScope = z.infer<typeof MallAdminListingsScopeSchema>;

/** 로켓 매칭 CSV: 웹 업로드, 서버가 자기 producer(엑셀 kind와 같은 모양). 같은 파일은 계약 `fileHash`로 한 번만. */
export const RocketMatchingCsvScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(240),
}).strict();
export type RocketMatchingCsvScope = z.infer<typeof RocketMatchingCsvScopeSchema>;

/** 청크 종류. */
export const SABANGNET_MALL_LISTINGS_CHUNK_KIND = 'listing_rows' as const;
export const MALL_ADMIN_LISTINGS_CHUNK_KIND = 'listing_rows' as const;
export const ROCKET_MATCHING_CSV_CHUNK_KIND = 'csv_rows' as const;

/** 로켓 매칭 CSV 실행의 `result`: 받은 행 수와 리스팅·옵션 반영 수. 화면이 업로드 결과로 보여 준다. */
export const RocketMatchingCsvResultSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  createdProductCount: z.number().int().nonnegative(),
  updatedProductCount: z.number().int().nonnegative(),
  createdSkuCount: z.number().int().nonnegative(),
  updatedSkuCount: z.number().int().nonnegative(),
}).strict();
export type RocketMatchingCsvResult = z.infer<typeof RocketMatchingCsvResultSchema>;

/** 사방넷 목록을 끝까지 읽었다는 증거 하나(`SabangnetMallListingsScanSchema`). 행 청크 뒤에 한 번 보낸다. */
export const SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND = 'listing_scan' as const;

/** 몰 관리자 목록을 끝까지 읽었다는 증거 하나(`MallAdminListingsScanSchema`). 행 청크 뒤에 한 번 보낸다. */
export const MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND = 'listing_scan' as const;

/** Channels 기타 kind(사방넷·몰 관리자·셀피아 수동매칭)를 도는 확장 빌드가 `ping` capabilities에 싣는 표시. 웹이 시작 전에 본다. */
export const CHANNELS_OPERATION_CAPABILITY = 'channelsOperationKindsV1' as const;

// M — 몰 등록 실행 kind(KID-364 · 몰 쓰기 모듈 KID-256, wave5). `product_registration_executions`를 대신한다.
// executionKind(register·update·sold_out·resume·composition_change·thumbnail_update)는 kind가 아니라 plan 안 필드다.

export const REGISTRATION_KIND = 'channels.registration' as const;
/** 이 kind를 도는 확장 빌드가 `ping` capabilities에 싣는 표시. 몰별 쓰기 사이트는 `mallWriteSite.<key>`로 따로 싣는다. */
export const CHANNELS_REGISTRATION_OPERATION_CAPABILITY = 'channelsRegistrationOperationKindV1' as const;
export const REGISTRATION_EXECUTION_KINDS = [...TARGET_EXECUTION_KINDS, THUMBNAIL_UPDATE_EXECUTION_KIND] as const;
export const RegistrationExecutionKindSchema = z.enum(REGISTRATION_EXECUTION_KINDS);
export type RegistrationExecutionKind = z.infer<typeof RegistrationExecutionKindSchema>;

/**
 * 잠금 키 셋(2026-09-24 23:15·23:25 결정): 지금 `product_registration_executions`의 partial unique 셋을 대신한다.
 * 같은 등록 대상·같은 리스팅·같은 외부 리스팅으로는 실행 하나만 산다(prepared·executing·reconciling).
 */
export function registrationTargetLockKey(registrationTargetId: string): OperationLockKey {
  return resourceLockKey('registration-target', registrationTargetId);
}
export function channelListingLockKey(channelListingId: string): OperationLockKey {
  return resourceLockKey('channel-listing', channelListingId);
}
export function externalListingLockKey(channelAccountId: string, externalListingId: string): OperationLockKey {
  return resourceLockKey('external-listing', `${channelAccountId}:${externalListingId}`);
}

/**
 * 시작(웹 → `POST /api/operations`): 옛 `PrepareTargetExecutionInputSchema`·썸네일 prepare와 같은 입력.
 * `submit`은 ADR-0019 관문의 첫 조건일 뿐이다 — spec에 검증된 `submit`이 있고 채우기에 경고·수동 단계가 없어야 [등록]을 누른다.
 */
export const RegistrationScopeSchema = z.object({
  executionKind: RegistrationExecutionKindSchema,
  /** register·update·composition_change·sold_out·resume: 등록 대상. thumbnail_update: 판매 상품(`salesProductId`). */
  registrationTargetId: z.string().uuid().optional(),
  salesProductId: z.string().uuid().optional(),
  channelListingId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  submit: z.boolean().default(false),
  updateFields: z.array(z.literal('salePrice')).length(1).optional(),
  adapterDefaults: z.record(z.string(), z.string()).optional(),
  adapterValues: z.record(z.string(), z.string()).optional(),
  applyCompositionTemplate: z.boolean().optional(),
  optionTransitions: z.array(z.object({
    channelListingOptionId: z.string().uuid(),
    salesProductOptionId: z.string().uuid(),
  }).strict()).max(1000).optional(),
  /** thumbnail_update만: 올릴 자산. 없으면 등록 대상이 고른 자산, 그것도 없으면 작업공간의 현재 대표이미지. */
  assetId: z.string().uuid().optional(),
  /**
   * 몰별 폼 지시(웹 `*-registration-form.ts` 빌더 18개가 draft·values로 만든 것 — url·카테고리 경로·공급가·수량·상세 호스팅·
   * manualSteps). 서버 plan이 `payload.form`에 얼려 `payloadHash`에 넣는다(2026-09-27 리더 결정 A: 빌더는 이 파동에서 웹에
   * 남기고, 서버 채널 어댑터 freeze로 옮기는 일은 KID-364 파생). 서버는 모양만 검사한다.
   */
  form: z.record(z.string(), z.unknown()).optional(),
  /** 빠른 등록(등록 대상 없이 수집 상품 → 폼만 채우기)의 출처. 그때 `registrationTargetId`는 없고 `submit`은 false여야 한다. */
  sourceProductId: z.string().uuid().optional(),
}).strict().refine(
  (scope) => {
    if (scope.executionKind === 'thumbnail_update') return scope.salesProductId !== undefined;
    if (scope.registrationTargetId !== undefined) return true;
    return scope.executionKind === 'register' && scope.submit === false && scope.form !== undefined;
  },
  { message: '등록 대상이 필요합니다(썸네일은 판매 상품, 빠른 등록은 폼만 채우기 + submit false)', path: ['registrationTargetId'] },
);
export type RegistrationScope = z.infer<typeof RegistrationScopeSchema>;

/**
 * owner plan(확장 몰 쓰기 모듈이 받는 것). `payload`는 준비 순간 얼린 문서(`payloadHash`로 잠금): register·update·
 * composition_change는 `{ snapshot: TargetExecutionSnapshot | null, form: Record | null }`(빠른 등록은 snapshot null·
 * registrationTargetId null·submit false, 잠금은 `account:<id>`만), sold_out·resume는 옵션 재고 지시, thumbnail_update는 사진 하나.
 * executionKind별 payload 스키마는 `registration-plan-payloads.ts`에 둔다. 자격증명은 plan에 없고 lease로만 온다.
 */
export const RegistrationPlanSchema = z.object({
  executionKind: RegistrationExecutionKindSchema,
  mallKey: z.string().min(1).max(64),
  channelAccountId: z.string().uuid(),
  registrationTargetId: z.string().uuid().nullable(),
  salesProductId: z.string().uuid().nullable(),
  channelListingId: z.string().uuid().nullable(),
  externalListingId: z.string().min(1).nullable(),
  /** 몰 세션의 판매자 식별자와 대조한다(Wing `vendorId`, 몰 `providerAccountId`). 없으면 대조 생략. */
  expectedProviderAccountId: z.string().min(1).nullable(),
  submit: z.boolean(),
  payloadHash: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  startedAt: z.string().datetime({ offset: true }),
}).strict();
export type RegistrationPlan = z.infer<typeof RegistrationPlanSchema>;

/** 청크 종류. 채우기 진행(steps·warnings·manualSteps)과 몰이 보인 증거를 나눠 보낸다. */
export const REGISTRATION_FILL_CHUNK_KIND = 'registration_fill' as const;
export const REGISTRATION_EVIDENCE_CHUNK_KIND = 'registration_evidence' as const;

export const RegistrationFillSchema = z.object({
  steps: z.array(z.string()),
  warnings: z.array(z.string()),
  manualSteps: z.array(z.string()),
  /** 몰이 띄운 대화상자 문장(가드가 기록한 것). */
  dialogs: z.array(z.string()),
}).strict();
export type RegistrationFill = z.infer<typeof RegistrationFillSchema>;

/** 옛 `ReportTargetExecutionInputSchema.evidence`와 같은 모양. `options`는 몰이 준 옵션 id ↔ 판매 옵션. */
export const RegistrationEvidenceSchema = z.object({
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).nullable(),
  observedUrl: z.string().url().nullable(),
  providerAccountId: z.string().nullable(),
  observedStatus: z.string().nullable(),
  message: z.string().nullable(),
  options: z.array(z.object({
    salesProductOptionId: z.string().uuid(),
    externalOptionId: z.string().trim().min(1),
    sellerSku: z.string().nullable(),
  }).strict()),
}).strict();
export type RegistrationEvidence = z.infer<typeof RegistrationEvidenceSchema>;

/**
 * 실행 `result`. `providerOutcome`(옛 전용 칸)은 여기 산다. 확장은 finish에 `submitted`·`mallOutcome`을 싣고,
 * owner finalize가 `providerOutcome`을 정한다: not_submitted → definitive_failure(failed) · submitted/uncertain →
 * uncertain(reconciling) · confirmed → succeeded. `submitSkipped`는 ADR-0019 관문이 [등록]을 거른 이유.
 */
export const REGISTRATION_MALL_OUTCOMES = ['not_submitted', 'uncertain', 'submitted', 'awaiting_approval', 'confirmed'] as const;
export const RegistrationMallOutcomeSchema = z.enum(REGISTRATION_MALL_OUTCOMES);
export type RegistrationMallOutcome = z.infer<typeof RegistrationMallOutcomeSchema>;

export const RegistrationResultSchema = z.object({
  providerOutcome: ProviderOutcomeSchema,
  mallOutcome: RegistrationMallOutcomeSchema,
  submitted: z.boolean(),
  submitSkipped: z.string().nullable(),
  externalListingId: z.string().nullable(),
  mallMessage: z.string().nullable(),
  fill: RegistrationFillSchema,
  evidence: RegistrationEvidenceSchema.nullable(),
}).strict();
export type RegistrationResult = z.infer<typeof RegistrationResultSchema>;

/**
 * 등록 실행이 `reconciling`(몰에 제출됐지만 외부 결과를 못 읽음)일 때 운영자가 몰에서 읽은 등록상품ID로 닫는 요청
 * (`POST /api/channels/registration-operations/:id/confirm`, KID-218). 같은 조직의 운영자면 누구나 닫을 수 있다
 * (리더 가정 = KID-329 (a), 사장님 확인 대기). 등록되지 않았다고 닫을 때는 `close`.
 */
export const RegistrationConfirmRequestSchema = z.object({
  externalListingId: z.string().trim().min(1).max(64),
  observedUrl: z.string().url().optional(),
  options: z.array(z.object({
    salesProductOptionId: z.string().uuid(),
    externalOptionId: z.string().trim().min(1),
    sellerSku: z.string().nullable().optional(),
  }).strict()).max(1000).optional(),
}).strict();
export type RegistrationConfirmRequest = z.infer<typeof RegistrationConfirmRequestSchema>;

export const RegistrationCloseRequestSchema = z.object({
  /** 운영자가 몰에서 확인한 사실: 등록되지 않았다(failed). */
  reason: z.string().trim().min(1).max(500),
}).strict();
export type RegistrationCloseRequest = z.infer<typeof RegistrationCloseRequestSchema>;

// M — 몰 판매 상태 읽기 kind(옛 `readMallAvailability`, 품절 후보 미리보기·자동 실시간 확인). 쓰기가 아니라 읽기라 등록
// kind와 나눈다. finalize는 원장을 쓰지 않고 `result`에 행만 남긴다(KID-369가 일별 스냅샷 칸을 정리하기 전까지).

export const MALL_AVAILABILITY_READ_KIND = 'channels.mall_availability_read' as const;
export const MALL_AVAILABILITY_READ_MAX_LISTINGS = 500;

export const MallAvailabilityReadScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().min(1).max(64),
  externalListingIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MALL_AVAILABILITY_READ_MAX_LISTINGS),
}).strict();
export type MallAvailabilityReadScope = z.infer<typeof MallAvailabilityReadScopeSchema>;

export const MallAvailabilityReadPlanSchema = MallAvailabilityReadScopeSchema.extend({
  expectedProviderAccountId: z.string().min(1).nullable(),
  startedAt: z.string().datetime({ offset: true }),
}).strict();
export type MallAvailabilityReadPlan = z.infer<typeof MallAvailabilityReadPlanSchema>;

export const MALL_AVAILABILITY_ROWS_CHUNK_KIND = 'availability_rows' as const;

export const MallAvailabilityRowSchema = z.object({
  externalListingId: z.string().min(1),
  externalOptionId: z.string().min(1).nullable(),
  /** 몰이 지금 팔고 있다고 보이는가(품절·판매중지는 false). */
  available: z.boolean(),
  stock: z.number().int().nonnegative().nullable(),
  /** 몰 화면의 상태 원문. */
  observedStatus: z.string().nullable(),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type MallAvailabilityRow = z.infer<typeof MallAvailabilityRowSchema>;

export const MallAvailabilityReadResultSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  /** 요청했지만 몰에서 못 찾은 리스팅. */
  missingExternalListingIds: z.array(z.string()),
  rows: z.array(MallAvailabilityRowSchema),
}).strict();
export type MallAvailabilityReadResult = z.infer<typeof MallAvailabilityReadResultSchema>;
