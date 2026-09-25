import { describe, expect, it } from 'vitest';
import { parseErrorEnvelope } from './errors';

describe('parseErrorEnvelope — 서버 오류 봉투를 느슨하게 읽는다', () => {
  it('확장이 아직 모르는 새 코드도 코드·메시지·details를 잃지 않는다', () => {
    expect(
      parseErrorEnvelope({ statusCode: 409, code: 'NEWER_SERVER_CODE', kind: 'newer_kind', message: '새 거절', errors: [], details: { reason: 'x' } }),
    ).toEqual({ statusCode: 409, code: 'NEWER_SERVER_CODE', kind: 'newer_kind', message: '새 거절', errors: [], details: { reason: 'x' } });
  });

  it('errors가 없어도 봉투로 본다', () => {
    expect(parseErrorEnvelope({ statusCode: 404, code: 'OPERATION_NOT_FOUND', kind: 'not_found', message: '없음' })).toMatchObject({
      code: 'OPERATION_NOT_FOUND',
    });
  });

  it('봉투 모양이 아니면 null', () => {
    expect(parseErrorEnvelope('<html>502</html>')).toBeNull();
    expect(parseErrorEnvelope({ message: 'x' })).toBeNull();
    expect(parseErrorEnvelope({ statusCode: 200, code: 'X', kind: 'k', message: 'm' })).toBeNull();
  });
});
