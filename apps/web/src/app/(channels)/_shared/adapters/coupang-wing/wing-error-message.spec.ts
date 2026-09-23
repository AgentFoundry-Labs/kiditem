import { describe, expect, it } from 'vitest';
import { translateWingError } from './wing-error-message';

/**
 * WING 거절 문구.
 *
 * 쿠팡 WING 등록도 다른 몰과 같은 등록 실행을 지난다(KID-321). 준비 단계에서 쿠팡 어댑터가 막는 까닭은
 * 영어 한 줄로 오는데, 사람은 그걸로 무엇을 해야 할지 알 수 없다. 규칙은 그대로 두고 말만 옮긴다.
 */
describe('translateWingError', () => {
  it('옵션이 여럿이라는 거절을 무엇을 고치면 되는지로 옮긴다', () => {
    const message = translateWingError('A Wing registration registers exactly one option.');
    expect(message).toContain('옵션 하나');
    expect(message).not.toContain('registers');
  });

  it('판매자 ID 가 없는 계정의 거절을 계정 설정으로 안내한다', () => {
    const message = translateWingError('Wing registration requires an account with a vendor identity.');
    expect(message).toContain('판매자 ID');
  });

  it('KID 가 없다는 거절을 사람 말로 옮긴다', () => {
    expect(translateWingError('A KID must be issued for the option before a Wing registration.'))
      .toContain('KID');
  });

  it('지운 WING 전용 준비 경로의 옛 거절 문구는 더 옮기지 않는다', () => {
    expect(translateWingError('An active registration preparation already exists.'))
      .toBe('An active registration preparation already exists.');
  });

  it('모르는 문구는 그대로 둔다 — 없는 설명을 지어내지 않는다', () => {
    expect(translateWingError('Vendor 12345 rejected the payload.'))
      .toBe('Vendor 12345 rejected the payload.');
  });

  it('한국어 문구는 손대지 않는다', () => {
    expect(translateWingError('판매가가 0원입니다.')).toBe('판매가가 0원입니다.');
  });
});
