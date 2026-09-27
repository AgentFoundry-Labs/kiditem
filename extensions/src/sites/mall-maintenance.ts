import { RuntimeError } from '../core/errors';
import { SITE_REQUEST_FAILED } from '../core/site-caller';

/**
 * 몰이 점검 안내 화면을 보일 때의 실패(KID-380 D3). 처리기가 목록 표 대신 "서비스 점검 안내"를 보면 0건 성공으로 답하지 않고
 * `maintenance`로 답한다 — 실행은 실패로 끝나 거짓 0건이 남지 않는다. `verb`는 운영자가 다시 할 일(수집·가져오기).
 */
export function mallMaintenance(displayName: string, url: string, verb: '수집해' | '가져와' = '수집해', details: Record<string, unknown> = {}): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, `${displayName} 사이트가 점검 중입니다. 점검이 끝난 뒤 다시 ${verb} 주세요.`, {
    status: null,
    reason: 'maintenance',
    url,
    ...details,
  });
}
