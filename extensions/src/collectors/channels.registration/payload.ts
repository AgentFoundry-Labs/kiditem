import { z } from 'zod';

/**
 * 등록 문서 plan.payload(register·update·composition_change)를 확장이 읽는 모양. 품절·재개·대표이미지는 `@kiditem/shared`의
 * `RegistrationAvailabilityPayloadSchema`·`RegistrationThumbnailPayloadSchema`(M1 `registration-plan-payloads.ts`)를 그대로 쓴다.
 * 문서는 확장이 `form`(몰별 폼 지시의 최종본)과 가격 수정의 얼린 판매가만 읽는다 — 얼린 대상 문서(`TargetExecutionSnapshot`)
 * 전체를 엄격히 다시 검사하지 않는다: 서버가 얼리고 해시로 묶었고, 확장 빌드가 서버보다 늦게 깔려 스냅샷 칸이 늘어도 읽는
 * 칸만 맞으면 실행한다.
 */
export const RegistrationDocumentPayloadSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()).nullable(),
  form: z.record(z.string(), z.unknown()).nullable(),
}).passthrough();
