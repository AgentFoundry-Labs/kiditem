import { z } from 'zod';
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

/** 몰 관리자 목록: 몰 계정 하나. lockKey `account:<channelAccountId>`. */
export const MallAdminListingsScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().min(1).max(64),
}).strict();
export type MallAdminListingsScope = z.infer<typeof MallAdminListingsScopeSchema>;

/**
 * 몰 관리자 목록 kind로 옮긴 몰 — 1차 넷(KID-363 wave3) 뒤에 나머지 몰을 하나씩 더한다(KID-381, 확장 `sites/<mall>/listings.ts`).
 * 여기 없는 몰은 옛 attempt 경로가 나머지 몰이 옮겨질 때까지 받는다(웹이 이 목록으로 시작 경로를 가른다).
 */
export const MALL_ADMIN_LISTING_OPERATION_MALLS = [
  'icecream-mall',
  'kidkids',
  'art09',
  'domeggook',
  'always',
  'thirtymall',
  'kidsnote',
  '11st',
  'gmarket',
  'auction',
  'kakao',
  'lotte-on',
  'smartstore',
  'teacher-mall',
  'kkomangse',
  'onch',
] as const;
export type MallAdminListingOperationMall = (typeof MALL_ADMIN_LISTING_OPERATION_MALLS)[number];
export function isMallAdminListingOperationMall(mallKey: string): mallKey is MallAdminListingOperationMall {
  return (MALL_ADMIN_LISTING_OPERATION_MALLS as readonly string[]).includes(mallKey);
}

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
