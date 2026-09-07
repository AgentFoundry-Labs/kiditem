/**
 * 상품정보고시 필수 항목.
 *
 * 전자상거래 등에서의 상품 등 정보제공에 관한 고시가 카테고리별 항목을 정하고,
 * 몰은 그 항목을 등록 화면에서 요구한다. 여기 목록은 몰이 공통으로 요구하는
 * 최소 부분집합이다 — 이걸 못 채우면 어느 몰에도 못 올린다.
 *
 * 사방넷은 "속성정보(상품정보고시)는 상품 신규등록 시 설정이 불가합니다"라 이걸
 * 등록 이후에야 채우게 했고, 그래서 송신 실패가 정상 경로가 됐다.
 */
export const NOTICE_REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  어린이제품: ['제조자', '제조국', '사용연령', '크기', '색상', 'KC인증필유무', 'AS책임자'],
  기타재화: ['품명및모델명', '제조국', '제조자', 'AS책임자'],
  유아용품: ['제조자', '제조국', '사용연령', '크기', 'KC인증필유무', 'AS책임자'],
};

export const NOTICE_CATEGORIES = Object.keys(NOTICE_REQUIRED_FIELDS);

/** 고시 항목 중 비어 있는 필수 항목. 카테고리를 모르면 판정하지 않는다. */
export function missingNoticeFields(
  noticeCategory: string | null,
  attributes: Record<string, unknown> | null,
): string[] {
  if (!noticeCategory) return [];
  const required = NOTICE_REQUIRED_FIELDS[noticeCategory];
  if (!required) return [];
  const filled = attributes ?? {};
  return required.filter((field) => {
    const value = filled[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}
