/**
 * 상품 이미지 허브의 role 정의.
 * `/image-hub` 페이지와 `HubInlinePicker` 에서 공유하여 drift 방지.
 *
 * Role enum 자체는 `@kiditem/shared`의 `MasterImageRoleSchema`가 source of truth.
 * 이 파일은 UI용 라벨/설명만 유지.
 */

import type { MasterImageRole } from '@kiditem/shared';
export type { MasterImageRole } from '@kiditem/shared';

export const HUB_ROLE_CONFIG: ReadonlyArray<{
  role: MasterImageRole;
  label: string;
  description: string;
}> = [
  { role: 'box', label: '📦 포장 사진', description: '패키지 박스, 포장 상태' },
  { role: 'product', label: '🛍️ 상품 사진', description: '실제 상품 모습' },
  { role: 'color_variant', label: '🎨 색상별 사진', description: '색상/옵션별 상품' },
  { role: 'size_chart', label: '📐 사이즈 차트', description: '사이즈 가이드' },
  { role: 'detail', label: '📄 상세 이미지', description: '상세 설명 이미지' },
] as const;

/**
 * @deprecated legacy name. Use `MasterImageRole` from `@kiditem/shared` or re-exported here.
 */
export type ProductImageRole = MasterImageRole;

export type HubRoleConfig = (typeof HUB_ROLE_CONFIG)[number];
