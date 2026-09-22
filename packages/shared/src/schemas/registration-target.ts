import { z } from 'zod';

const money = z.number().int().min(0).max(1_000_000_000);
export const RegistrationTargetOptionInputSchema = z.object({
  salesProductOptionId: z.string().uuid(),
  salePrice: money.nullable().default(null),
  normalPrice: money.nullable().default(null),
  supplyPrice: money.nullable().default(null),
}).strict();
export type RegistrationTargetOptionInput = z.infer<typeof RegistrationTargetOptionInputSchema>;

const editable = {
  displayName: z.string().trim().min(1).max(255).nullable().default(null),
  registrationInput: z.record(z.string(), z.unknown()).default({}),
  selectedOptions: z.array(RegistrationTargetOptionInputSchema).max(200)
    .refine(options => new Set(options.map(option => option.salesProductOptionId)).size === options.length,
      '같은 옵션을 두 번 선택할 수 없습니다.'),
};
export const RegistrationTargetCreateInputSchema = z.object({
  salesProductId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  ...editable,
}).strict();
export type RegistrationTargetCreateInput = z.infer<typeof RegistrationTargetCreateInputSchema>;

/**
 * 보통 등록은 따로 설정 단계를 거치지 않고 이 자리에서 설정을 찾거나 만든다.
 * 상품 × 몰 계정당 활성 설정은 하나라 고를 것이 없다 — 행사용 등록은 별도 판매상품이다.
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
  resolved: z.object({
    name: z.string(),
    options: z.array(z.object({
      salesProductOptionId: z.string().uuid(),
      /** 발급된 KID. 아직 팔기로 하지 않은 초안의 단품은 비어 있다. */
      code: z.string().nullable(),
      values: z.array(z.string()),
      /** 초안이라 아직 정하지 않았으면 null. */
      salePrice: money.nullable(),
      normalPrice: money.nullable(),
      supplyPrice: money.nullable(),
    })),
  }),
});
export type RegistrationTarget = z.infer<typeof RegistrationTargetSchema>;
