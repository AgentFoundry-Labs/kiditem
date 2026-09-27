import { z } from 'zod';

/**
 * `channels.registration` plan.payload의 executionKind별 모양(2026-09-27 리더 결정, 골격 3·4). M1이 같은 모양을
 * `@kiditem/shared` `registration-plan-payloads.ts`에 둔다 — 그 파일이 이 브랜치에 오기 전까지의 로컬 사본이다(파동을 합칠
 * 때 리더가 그 파일로 바꾼다). 확장은 서버가 얼린 값을 읽기만 한다.
 */

/** register·update·composition_change: 준비 순간 얼린 대상 스냅샷과 몰 폼 지시(웹 `*-registration-form.ts` 빌더가 만든 것). */
export const RegistrationFormPayloadSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()).nullable(),
  form: z.record(z.string(), z.unknown()).nullable(),
}).passthrough();
export type RegistrationFormPayload = z.infer<typeof RegistrationFormPayloadSchema>;

/** sold_out·resume: 몰 계정 하나의 리스팅 묶음(옛 일괄 품절과 같은 실행 하나). */
export const AvailabilityPayloadSchema = z.object({
  action: z.enum(['sold_out', 'resume']),
  listings: z.array(z.object({
    channelListingId: z.string().uuid().nullable().optional(),
    externalListingId: z.string().min(1),
    options: z.array(z.object({
      salesProductOptionId: z.string().uuid().nullable().optional(),
      channelListingOptionId: z.string().uuid().nullable().optional(),
      externalOptionId: z.string().min(1).nullable().optional(),
      sellerSku: z.string().nullable().optional(),
    }).passthrough()).default([]),
  }).passthrough()).min(1),
}).passthrough();
export type AvailabilityPayload = z.infer<typeof AvailabilityPayloadSchema>;

/** thumbnail_update: 올릴 사진 하나(`ThumbnailExecutionImage`). */
export const ThumbnailPayloadSchema = z.object({
  image: z.object({
    dataUrl: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.string().min(1),
  }).passthrough(),
  productName: z.string().min(1).optional(),
}).passthrough();
export type ThumbnailPayload = z.infer<typeof ThumbnailPayloadSchema>;
