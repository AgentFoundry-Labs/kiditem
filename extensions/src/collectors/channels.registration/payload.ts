import { z } from 'zod';

/**
 * `channels.registration` plan.payload의 executionKind별 모양(2026-09-27 리더 결정, 골격 3·4 · M1 `registration-plan-payloads.ts`와
 * 같은 모양). 그 파일이 이 브랜치에 오기 전까지의 로컬 사본이다 — 파동을 합칠 때 리더가 `@kiditem/shared` 파일로 바꾼다.
 * 확장은 서버가 얼린 값을 읽기만 한다.
 */

/** register·update·composition_change: 얼린 대상 문서와 웹 폼 빌더가 만든 몰별 폼 지시(빠른 등록은 snapshot null). */
export const RegistrationDocumentPayloadSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()).nullable(),
  form: z.record(z.string(), z.unknown()).nullable(),
}).passthrough();
export type RegistrationDocumentPayload = z.infer<typeof RegistrationDocumentPayloadSchema>;

export const RegistrationAvailabilityOptionSchema = z.object({
  /** 판매 옵션에 연결되지 않은 몰 옵션(수집으로만 들어온 것)은 null. */
  salesProductOptionId: z.string().uuid().nullable(),
  channelListingOptionId: z.string().uuid(),
  externalOptionId: z.string().min(1),
  sellerSku: z.string().nullable(),
}).passthrough();
export type RegistrationAvailabilityOption = z.infer<typeof RegistrationAvailabilityOptionSchema>;

/** sold_out·resume: 몰 계정 하나의 리스팅 묶음(옛 일괄 품절과 같은 실행 하나). */
export const RegistrationAvailabilityPayloadSchema = z.object({
  action: z.enum(['sold_out', 'resume']),
  listings: z.array(z.object({
    channelListingId: z.string().uuid(),
    externalListingId: z.string().min(1),
    /** 바꿀 옵션. 리스팅 단위로 받는 몰은 그 리스팅의 살아 있는 옵션 전부다. */
    options: z.array(RegistrationAvailabilityOptionSchema).max(1000),
  }).passthrough()).min(1),
}).passthrough();
export type RegistrationAvailabilityPayload = z.infer<typeof RegistrationAvailabilityPayloadSchema>;

/** thumbnail_update: 몰 상품 수정 화면의 대표이미지 칸에 넣을 사진 하나. 리스팅을 모르면 id가 null. */
export const RegistrationThumbnailPayloadSchema = z.object({
  dataUrl: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  salesProductId: z.string().uuid(),
  channelListingId: z.string().uuid().nullable(),
  externalListingId: z.string().min(1).nullable(),
  assetId: z.string().uuid(),
  /** 몰 관리자에서 상품을 찾는 이름. */
  productName: z.string().min(1),
}).passthrough();
export type RegistrationThumbnailPayload = z.infer<typeof RegistrationThumbnailPayloadSchema>;
