export const REPRESENTATIVE_IMAGE_RUNNER_PORT = Symbol('REPRESENTATIVE_IMAGE_RUNNER_PORT');

/**
 * 몰 관리자 화면의 대표이미지 칸에 사진을 넣는 자동화 runner(KID-321, 몰 중립 이름 — 옛
 * `WingThumbnailRunnerPort`). 채널 어댑터가 제 runner 를 들고 있고(`ChannelAdapter.representativeImage`),
 * 지금 구현은 쿠팡 WING 하나다(`channels/adapter/out/channel/coupang/`).
 *
 * 저장 · 수정요청은 누르지 않으므로 `uploaded_pending_save` 는 몰 반영이 아니다 — 운영자가 몰에서
 * 저장한 뒤 확인해야 성공이다. 명시적인 실패 답만 `definitive_failure` 이고, 결과를 알 수 없는 종료는
 * 예외로 던진다(호출자가 `uncertain` 으로 남긴다). 운영에서는 막혀 있고 호출자가 503 으로 알린다.
 */
export interface RepresentativeImageRunnerPort {
  isBlocked(): boolean;
  upload(input: {
    listing: { externalListingId: string | null; productName: string };
    image: { dataUrl: string; filename: string };
  }): Promise<
    | { outcome: 'uploaded_pending_save'; screenshotPath: string | null }
    | { outcome: 'definitive_failure'; error: string }
  >;
}
