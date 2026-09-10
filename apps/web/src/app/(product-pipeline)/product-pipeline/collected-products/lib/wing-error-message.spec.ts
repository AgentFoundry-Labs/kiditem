import { describe, expect, it } from 'vitest';
import { translateWingError } from './wing-registration-flow';

/**
 * WING 거절 문구.
 *
 * 다른 몰은 폼만 채우고 끝이라 서버 장부가 없다. WING 만 장부가 있어서 같은 상품을
 * 두 번 올리려 하면 서버가 막는데, 그 거절이 영어 한 줄로 나오면 사람은 무엇을
 * 해야 할지 알 수 없다. 규칙은 그대로 두고 말만 옮긴다.
 */
describe('translateWingError', () => {
  it('진행 중인 시도가 있다는 거절을 사람 말로 옮긴다', () => {
    const message = translateWingError('An active registration preparation already exists.');
    expect(message).toContain('이미 진행 중인 WING 등록 시도');
    expect(message).toContain('등록상품ID');
    expect(message).not.toContain('preparation');
  });

  it('모르는 문구는 그대로 둔다 — 없는 설명을 지어내지 않는다', () => {
    expect(translateWingError('Vendor 12345 rejected the payload.'))
      .toBe('Vendor 12345 rejected the payload.');
  });

  it('한국어 문구는 손대지 않는다', () => {
    expect(translateWingError('판매가가 0원입니다.')).toBe('판매가가 0원입니다.');
  });
});
