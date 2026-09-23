/**
 * 몰에 올릴 승인 썸네일의 사진을 고르는 순수 규칙: 고른 사진(`selectedUrl`)이 있으면 그것, 없고
 * 후보가 하나뿐이면 그 후보. 몰 반영 상태와 몰 상품명은 Channels 소유라 여기에 없다.
 */

export interface GenerationForRegistrationSelection {
  selectedUrl: string | null;
  candidates: Array<{ url: string | null }>;
}

export function pickRegistrationImageUrl(generation: GenerationForRegistrationSelection): string | null {
  if (generation.selectedUrl) return generation.selectedUrl;
  if (generation.candidates.length === 1) return generation.candidates[0]?.url ?? null;
  return null;
}
