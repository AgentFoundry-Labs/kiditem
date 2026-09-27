/**
 * 쓸 수 있는 채널 계정의 상태(KID-330). `active`(마켓플레이스 부트스트랩)와 `configured`(쇼핑몰 계정 화면이 연결한 몰) 둘 다
 * 쓸 수 있고 `paused` 같은 나머지는 아니다. 계정 목록(`listActive`) · 등록 실행 plan · 판매 상태 읽기 · 대표이미지 · 품절 미리보기가
 * 이 한 규칙을 쓴다.
 */
export const USABLE_CHANNEL_ACCOUNT_STATUSES = ['active', 'configured'] as const;

export function isUsableChannelAccountStatus(status: string): boolean {
  return (USABLE_CHANNEL_ACCOUNT_STATUSES as readonly string[]).includes(status);
}
