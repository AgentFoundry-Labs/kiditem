/**
 * 등록 설정의 대표 사진은 **그 판매상품의 사진**이어야 한다(KID-310).
 *
 * 몰에 나가는 대표 사진을 Channels 가 검증하지 않으면, 손으로 적은 주소나 다른 상품의 사진이
 * 그대로 올라간다 — 몰에서는 엉뚱한 상품이 되고 되돌릴 방법이 없다. 허용 목록은 초안이 든
 * 사진(`SalesProduct.imageUrls`)과 이 상품을 위해 만든 생성 썸네일 후보뿐이다.
 */
export class SelectedThumbnailError extends Error {}

export function assertSelectedThumbnailAllowed(
  selected: string | null | undefined,
  allowedUrls: readonly string[],
): void {
  const url = selected?.trim();
  // 고르지 않은 것은 틀린 것이 아니다 — 몰 어댑터가 사진 없음을 따로 막는다.
  if (!url) return;
  const allowed = new Set(allowedUrls.map((item) => item.trim()).filter(Boolean));
  if (allowed.has(url)) return;
  throw new SelectedThumbnailError(
    '고른 대표 사진이 이 판매상품의 사진이 아닙니다. 상품 사진이나 생성한 썸네일 중에서 고르세요.',
  );
}
