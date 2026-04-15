/**
 * 상품 이미지 허브의 role 정의.
 * `/image-hub` 페이지와 `HubImagePickerModal` 에서 공유하여 drift 방지.
 */

export const HUB_ROLE_CONFIG = [
  { role: 'box', label: '📦 포장 사진', description: '패키지 박스, 포장 상태' },
  { role: 'product', label: '🛍️ 상품 사진', description: '실제 상품 모습' },
  { role: 'color_variant', label: '🎨 색상별 사진', description: '색상/옵션별 상품' },
  { role: 'size_chart', label: '📐 사이즈 차트', description: '사이즈 가이드' },
  { role: 'detail', label: '📄 상세 이미지', description: '상세 설명 이미지' },
] as const;

export type ProductImageRole = (typeof HUB_ROLE_CONFIG)[number]['role'];
export type HubRoleConfig = (typeof HUB_ROLE_CONFIG)[number];
