import type { MallTrackingUploadRow } from '@kiditem/shared/orders-action-operations';
import { uploadInOperatorTab, type TrackingUploadOutcome } from '../mall-tracking/upload-tab';
import type { SiteSignIn } from '../site-login';
import type { PageGuard, TabPages } from '../tab-page';

export const KIDKIDS_TRACKING_UPLOAD_FILE = 'content/orders/kidkids-tracking-upload.js';
const LOGIN_MESSAGE = '키드키즈 로그인이 필요합니다. 열려 있는 키드키즈 탭에서 로그인(본인확인)한 뒤 다시 시도해 주세요.';

/**
 * 키드키즈 송장 등록·출고완료(KID-366 wave8b, 옛 워커의 키드키즈 송장 업로드 액션). ⚠️출고완료는 되돌리기 어렵다. 운영자 키드키즈 탭
 * (출고관리)에서 처리기 `content/orders/kidkids-tracking-upload.js`가 송장을 넣고 출고완료를 한 번 POST한다. 키드키즈는 성공
 * 코드를 주지 않아 제출만 확인된다(`submitOnly`) — 수집기가 확인 대기(reconciling)로 멈춘다.
 */
export function createKidkidsTrackingUpload(tabs: TabPages, target: { url: string; guard: PageGuard }, signIn?: SiteSignIn) {
  return {
    uploadTracking(rows: readonly MallTrackingUploadRow[]): Promise<TrackingUploadOutcome> {
      return uploadInOperatorTab(tabs, signIn, {
        displayName: '키드키즈',
        matches: ['https://partner.kidkids.net/new/pages/logis/management.htm*', 'https://partner.kidkids.net/*'],
        url: target.url,
        stay: (current) => current.includes('/logis/management.htm'),
        guard: target.guard,
        file: KIDKIDS_TRACKING_UPLOAD_FILE,
        call: 'kidkids.uploadTracking',
        loginMessage: LOGIN_MESSAGE,
        timeoutMs: () => 120_000,
        submitOnly: true,
      }, rows);
    },
  };
}
