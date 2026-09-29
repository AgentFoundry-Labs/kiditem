import type { MallTrackingUploadRow } from '@kiditem/shared/orders-action-operations';
import { uploadInOperatorTab, type TrackingUploadOutcome } from '../mall-tracking/upload-tab';
import type { SiteSignIn } from '../site-login';
import type { PageGuard, TabPages } from '../tab-page';

export const ONCH_TRACKING_UPLOAD_FILE = 'content/orders/onch-tracking-upload.js';
const LOGIN_MESSAGE = '온채널 로그인이 필요합니다. onch3.co.kr 에 로그인한 뒤 다시 시도해 주세요.';

/**
 * 온채널 송장 업로드(KID-366 wave8b, 옛 워커의 온채널 송장 업로드 액션). 운영자 온채널 탭(공급사 주문 목록)에서 처리기
 * `content/orders/onch-tracking-upload.js`가 행마다 trans_ok를 POST한다 — 몰이 행마다 코드로 답하므로 몰의 확인이다.
 * 한 쪽 목록에 없는 주문은 `not_in_list`, 이미 송장이 있는 주문은 `already_uploaded`(보내지 않는다).
 */
export function createOnchTrackingUpload(tabs: TabPages, target: { url: string; guard: PageGuard }, signIn?: SiteSignIn) {
  return {
    uploadTracking(rows: readonly MallTrackingUploadRow[]): Promise<TrackingUploadOutcome> {
      return uploadInOperatorTab(tabs, signIn, {
        displayName: '온채널',
        matches: ['https://www.onch3.co.kr/supplier/orders*', 'https://www.onch3.co.kr/*'],
        url: target.url,
        stay: (current) => current.includes('/supplier/orders'),
        guard: target.guard,
        file: ONCH_TRACKING_UPLOAD_FILE,
        call: 'onch.uploadTracking',
        loginMessage: LOGIN_MESSAGE,
        // 옛 제한은 120초(행 60개 보고). 행마다 POST + 250ms 간격이라 행 수만큼 늘린다.
        timeoutMs: (count) => Math.max(120_000, 60_000 + count * 1_500),
      }, rows);
    },
  };
}
