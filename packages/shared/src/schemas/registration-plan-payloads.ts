import { z } from 'zod';
import { TargetExecutionSnapshotSchema } from './registration-target-execution.js';
import { ThumbnailExecutionImageSchema } from '../thumbnail-execution.js';
import {
  MALL_AVAILABILITY_READ_MAX_LISTINGS,
  type RegistrationExecutionKind,
} from './channels-operations.js';

/**
 * `channels.registration` 실행 plan의 `payload`를 executionKind별로 읽는 스키마(KID-364, wave5). 서버 owner plan이 얼리고
 * (`payloadHash`는 이 JSON의 canonical SHA-256), 확장 몰 쓰기 모듈과 웹은 읽기만 한다. 자격증명은 여기 없다.
 */

/**
 * register · update · composition_change: 등록 대상에서 얼린 문서와 웹 폼 빌더가 만든 몰별 폼 지시.
 * 빠른 등록(등록 대상 없이 폼만 채우기)은 `snapshot` null · `form` 있음이다. 둘 다 없으면 보낼 것이 없다.
 */
export const RegistrationDocumentPayloadSchema = z.object({
  snapshot: TargetExecutionSnapshotSchema.nullable(),
  form: z.record(z.string(), z.unknown()).nullable(),
}).strict().refine((payload) => payload.snapshot !== null || payload.form !== null, {
  message: '얼린 문서나 폼 지시가 필요합니다',
});
export type RegistrationDocumentPayload = z.infer<typeof RegistrationDocumentPayloadSchema>;

export const RegistrationAvailabilityOptionSchema = z.object({
  /** 판매 옵션에 연결되지 않은 몰 옵션(수집으로만 들어온 것)은 null. */
  salesProductOptionId: z.string().uuid().nullable(),
  channelListingOptionId: z.string().uuid(),
  externalOptionId: z.string().min(1),
  sellerSku: z.string().nullable(),
}).strict();
export type RegistrationAvailabilityOption = z.infer<typeof RegistrationAvailabilityOptionSchema>;

export const RegistrationAvailabilityListingSchema = z.object({
  channelListingId: z.string().uuid(),
  externalListingId: z.string().min(1),
  /** 바꿀 옵션. 리스팅 단위로 받는 몰은 그 리스팅의 살아 있는 옵션 전부다. */
  options: z.array(RegistrationAvailabilityOptionSchema).max(1000),
}).strict();
export type RegistrationAvailabilityListing = z.infer<typeof RegistrationAvailabilityListingSchema>;

/** sold_out · resume: 몰 계정 하나의 리스팅 묶음(2026-09-27 리더 결정 — 옛 일괄 품절과 같은 실행 하나). */
export const RegistrationAvailabilityPayloadSchema = z.object({
  action: z.enum(['sold_out', 'resume']),
  listings: z.array(RegistrationAvailabilityListingSchema).min(1).max(MALL_AVAILABILITY_READ_MAX_LISTINGS),
}).strict();
export type RegistrationAvailabilityPayload = z.infer<typeof RegistrationAvailabilityPayloadSchema>;

/** thumbnail_update: 몰 상품 수정 화면의 대표이미지 칸에 넣을 사진 하나. 리스팅을 모르면(계정만 정해진 상품) id가 null. */
export const RegistrationThumbnailPayloadSchema = ThumbnailExecutionImageSchema.extend({
  salesProductId: z.string().uuid(),
  channelListingId: z.string().uuid().nullable(),
  externalListingId: z.string().min(1).nullable(),
  assetId: z.string().uuid(),
  /** 몰 관리자에서 상품을 찾는 이름. */
  productName: z.string().min(1),
}).strict();
export type RegistrationThumbnailPayload = z.infer<typeof RegistrationThumbnailPayloadSchema>;

export type RegistrationPayloadByKind = {
  register: RegistrationDocumentPayload;
  update: RegistrationDocumentPayload;
  composition_change: RegistrationDocumentPayload;
  sold_out: RegistrationAvailabilityPayload;
  resume: RegistrationAvailabilityPayload;
  thumbnail_update: RegistrationThumbnailPayload;
};

/** plan `payload`를 executionKind의 모양으로 읽는다. 맞지 않으면 ZodError를 던진다. */
export function parseRegistrationPayload<K extends RegistrationExecutionKind>(
  kind: K,
  payload: unknown,
): RegistrationPayloadByKind[K] {
  switch (kind) {
    case 'sold_out':
    case 'resume':
      return RegistrationAvailabilityPayloadSchema.refine((value) => value.action === kind, {
        message: '품절·재개 지시가 실행 종류와 다릅니다',
        path: ['action'],
      }).parse(payload) as RegistrationPayloadByKind[K];
    case 'thumbnail_update':
      return RegistrationThumbnailPayloadSchema.parse(payload) as RegistrationPayloadByKind[K];
    default:
      return RegistrationDocumentPayloadSchema.parse(payload) as RegistrationPayloadByKind[K];
  }
}
