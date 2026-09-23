/**
 * 몰에 올릴 승인 썸네일을 고르는 순수 규칙. 몰 반영 상태는 Channels 소유라 여기에 없다.
 *
 * - 상품명: 작업공간의 쿠팡 listing 이름이 있으면 그것, 없으면 작업공간 이름. URL 인코딩된
 *   이름(`%EC%...`)은 두 번까지 풀어 둔다.
 * - 사진: 고른 사진(`selectedUrl`)이 있으면 그것, 없고 후보가 하나뿐이면 그 후보.
 */

export interface WorkspaceForRegistrationNaming {
  displayName: string | null;
  listingChannelName: string | null;
}

export interface GenerationForRegistrationSelection {
  selectedUrl: string | null;
  candidates: Array<{ url: string | null }>;
}

export function pickRegistrationProductName(workspace: WorkspaceForRegistrationNaming): string {
  const listingName = workspace.listingChannelName?.trim();
  return decodeProductName(listingName || workspace.displayName || '');
}

function decodeProductName(value: string): string {
  let current = value.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(current)) return current;

  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current).trim();
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

export function pickRegistrationImageUrl(generation: GenerationForRegistrationSelection): string | null {
  if (generation.selectedUrl) return generation.selectedUrl;
  if (generation.candidates.length === 1) return generation.candidates[0]?.url ?? null;
  return null;
}
