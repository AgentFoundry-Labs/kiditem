export const WING_THUMBNAIL_RUNNER_PORT = Symbol('WING_THUMBNAIL_RUNNER_PORT');

/**
 * 개발 서버의 Playwright 로 Wing 상품 수정 화면의 대표이미지 칸에 사진을 넣는다(Agent 경로 전용).
 * 저장 · 수정요청은 누르지 않으므로 `uploaded_pending_save` 는 몰 반영이 아니다 — 운영자가 Wing 에서
 * 저장한 뒤 확인해야 성공이다. 명시적인 `ERROR:` 답만 `definitive_failure` 이고, 결과를 알 수 없는
 * 종료는 예외로 던진다(호출자가 `uncertain` 으로 남긴다). 운영에서는 막혀 있고 호출자가 503 으로 알린다.
 * 사진은 data URL 로 받고 파일로 쓰는 일은 이 adapter 가 한다.
 */
export interface WingThumbnailRunnerPort {
  isBlocked(): boolean;
  upload(input: { productName: string; image: { dataUrl: string; filename: string } }): Promise<
    | { outcome: 'uploaded_pending_save'; screenshotPath: string | null }
    | { outcome: 'definitive_failure'; error: string }
  >;
}
