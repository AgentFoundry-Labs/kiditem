import { describe, expect, it } from 'vitest';
import { mallRejectedCredentials } from './mall-login.js';

describe('mallRejectedCredentials — 몰이 아이디·비밀번호를 거부했다는 말(확장·웹이 함께 쓴다, KID-380 R5)', () => {
  it('거절 문장이면 true — 아이스크림몰 "아이디 혹은 비밀번호가 일치하지 않습니다"', () => {
    expect(mallRejectedCredentials('아이디 혹은 비밀번호가 일치하지 않습니다.')).toBe(true);
    expect(mallRejectedCredentials('아이디 또는 비밀번호를 확인해 주세요')).toBe(true);
    expect(mallRejectedCredentials('Invalid password')).toBe(true);
  });

  it('세션 만료·점검·빈 말은 거절이 아니다', () => {
    expect(mallRejectedCredentials('로그인이 만료되었습니다.')).toBe(false);
    expect(mallRejectedCredentials('서비스 점검 중입니다')).toBe(false);
    expect(mallRejectedCredentials('')).toBe(false);
    expect(mallRejectedCredentials(null)).toBe(false);
  });
});
