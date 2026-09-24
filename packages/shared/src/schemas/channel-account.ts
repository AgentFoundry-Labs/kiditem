import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ChannelAccountListItemSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  name: z.string().min(1),
  externalAccountId: z.string().nullable(),
  vendorId: z.string().nullable(),
  sellerId: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type ChannelAccountListItem = z.infer<typeof ChannelAccountListItemSchema>;

export const CoupangAccountSettingsSchema = z.object({
  configured: z.boolean(),
  vendorId: z.string().nullable(),
  status: z.string().nullable(),
  updatedAt: zIsoDate.nullable(),
}).strict();
export type CoupangAccountSettings = z.infer<typeof CoupangAccountSettingsSchema>;

export const UpdateCoupangAccountSettingsSchema = z.object({
  vendorId: z.string().trim().min(1),
}).strict();
export type UpdateCoupangAccountSettings = z.infer<typeof UpdateCoupangAccountSettingsSchema>;

/**
 * 몰 계정 하나의 등록 기본값 — 그 몰 `ChannelAccount` 행의 `config.listingProfile` 문서(KID-235).
 *
 * 문서 구조의 정본은 서버 `channels/domain/account/mall-listing-profile.ts` 다. 네 개의 기록 항목
 * (배송비 정책 · 반품·교환비 · 출고지 · 반품지)은 아직 소비자가 정하지 않은 자유 객체라 키를 강제하지
 * 않는다 — 화면은 `summary` 한 칸으로 적고, 더 풍부한 키는 그대로 보존된다. 빈 객체는 "없음"과 같다.
 */
export const MallListingProfileRecordSchema = z
  .record(z.string(), z.unknown())
  .refine((record) => Object.keys(record).length > 0, { message: '비어 있지 않은 객체여야 합니다.' });

export const MallListingProfileSchema = z.object({
  shipping: MallListingProfileRecordSchema.nullable(),
  returnPolicy: MallListingProfileRecordSchema.nullable(),
  releaseAddress: MallListingProfileRecordSchema.nullable(),
  returnAddress: MallListingProfileRecordSchema.nullable(),
  asPhone: z.string().nullable(),
  /** 이 몰에서 쓰는 카테고리 코드. 상품 × 몰 카테고리 매핑이 생기기 전까지의 몰 단위 값. */
  categoryCode: z.string().nullable(),
  namePrefix: z.string().nullable(),
  nameSuffix: z.string().nullable(),
}).strict();
export type MallListingProfile = z.infer<typeof MallListingProfileSchema>;

/**
 * 등록 기본값 갱신 요청 — 보낸 키만 바꾸고 나머지는 보존한다. `null` 은 비움, 빈 문자열도 비움.
 * 문서 밖의 키는 거절한다(계정 자격 정보는 `PATCH …/malls/:mallKey` 가 따로 받는다).
 */
export const UpdateMallListingProfileSchema = z.object({
  shipping: MallListingProfileRecordSchema.nullable().optional(),
  returnPolicy: MallListingProfileRecordSchema.nullable().optional(),
  releaseAddress: MallListingProfileRecordSchema.nullable().optional(),
  returnAddress: MallListingProfileRecordSchema.nullable().optional(),
  asPhone: z.string().trim().max(50).nullable().optional(),
  categoryCode: z.string().trim().max(100).nullable().optional(),
  namePrefix: z.string().trim().max(100).nullable().optional(),
  nameSuffix: z.string().trim().max(100).nullable().optional(),
}).strict();
export type UpdateMallListingProfile = z.infer<typeof UpdateMallListingProfileSchema>;

/** 문서의 필드 하나 — 화면 라벨과 입력 종류. 기록 항목의 내부 키는 정하지 않는다(소비자가 아직 없다). */
export interface MallListingProfileFieldDefinition {
  readonly key: keyof MallListingProfile;
  readonly kind: 'record' | 'text';
  readonly label: string;
}

/**
 * 등록 기본값 문서의 필드 정의 — 서버 검증 · 송신 전 점검 문구와 쇼핑몰 계정 화면이 같이 쓴다.
 * 순서는 화면 순서다. 서버 도메인(`mall-listing-profile.ts`)은 이것을 재수출한다.
 */
export const MALL_LISTING_PROFILE_FIELDS: readonly MallListingProfileFieldDefinition[] = [
  { key: 'categoryCode', kind: 'text', label: '몰 카테고리 코드' },
  { key: 'shipping', kind: 'record', label: '배송비 정책' },
  { key: 'returnPolicy', kind: 'record', label: '반품·교환비' },
  { key: 'releaseAddress', kind: 'record', label: '출고지' },
  { key: 'returnAddress', kind: 'record', label: '반품지' },
  { key: 'asPhone', kind: 'text', label: 'A/S 연락처' },
  { key: 'namePrefix', kind: 'text', label: '상품명 접두어' },
  { key: 'nameSuffix', kind: 'text', label: '상품명 접미어' },
];
