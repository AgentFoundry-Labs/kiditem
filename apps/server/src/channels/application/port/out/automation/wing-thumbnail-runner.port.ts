export const WING_THUMBNAIL_RUNNER_PORT = Symbol('WING_THUMBNAIL_RUNNER_PORT');

/**
 * 개발 서버의 Playwright 로 Wing 에 대표이미지를 올린다(Content 의 `WingAutomationPort` 를 옮긴 것).
 * 운영에서는 막혀 있고, 막힘은 호출자가 503 으로 알린다. 사진은 data URL 로 받고 파일로 쓰는 일은
 * 이 adapter 가 한다.
 */
export interface WingThumbnailRunnerPort {
  isBlocked(): boolean;
  upload(input: { productName: string; image: { dataUrl: string; filename: string } }): Promise<
    | { outcome: 'succeeded'; screenshotPath: string | null }
    | { outcome: 'definitive_failure'; error: string }
  >;
}
