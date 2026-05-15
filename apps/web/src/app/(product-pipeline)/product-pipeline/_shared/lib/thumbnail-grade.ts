// Quality grades (S/A/B/C/F)
export const QUALITY_GRADE_BG: Record<string, string> = {
  S: 'bg-emerald-500',
  A: 'bg-blue-500',
  B: 'bg-amber-500',
  C: 'bg-orange-500',
  F: 'bg-red-500',
};

// Compliance grades (PASS/WARN/FAIL)
export const COMPLIANCE_GRADE_BG: Record<string, string> = {
  PASS: 'bg-emerald-500',
  WARN: 'bg-amber-500',
  FAIL: 'bg-red-500',
};

export const COMPLIANCE_GRADE_COLORS: Record<string, string> = {
  PASS: '#059669',
  WARN: '#d97706',
  FAIL: '#dc2626',
};

export const COMPLIANCE_GRADE_LABELS: Record<string, string> = {
  PASS: '적합',
  WARN: '주의',
  FAIL: '부적합',
};

export const VIOLATION_LABELS: Record<string, string> = {
  background_not_white: '배경 비백색',
  has_text: '텍스트/카피 삽입',
  has_extra_logo: '추가 로고',
  has_discount_text: '할인/프로모션 문구',
  has_freebie_display: '사은품 표시',
  has_overlay_effects: '오버레이 효과',
  has_gradient_background: '배경 그라데이션',
  has_background_objects: '배경 오브젝트',
  product_fill_low: '상품 비율 부족',
  not_center_aligned: '중앙 정렬 안됨',
  product_cropped: '상품 잘림',
  excessive_editing: '과도한 보정',
};
