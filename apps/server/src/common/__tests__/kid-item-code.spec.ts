import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { isMissingKidItemCodeSequence } from '../kid-item-code';

/**
 * 시퀀스가 없음은 Prisma 오류 코드로 가린다 — 드라이버가 문장을 바꿔도 503 이 흔들리지 않는다.
 * 모양은 PG17 에서 `nextval('kid_item_code_seq')` 가 실제로 낸 값이다(KID-313).
 */
function rawQueryFailure(cause: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Raw query failed.', {
    code: 'P2010',
    clientVersion: 'test',
    meta: { driverAdapterError: { name: 'DriverAdapterError', cause } },
  });
}

describe('isMissingKidItemCodeSequence', () => {
  it('recognises the missing sequence by the Prisma raw-query code and the Postgres code, not the message', () => {
    expect(isMissingKidItemCodeSequence(rawQueryFailure({
      originalCode: '42P01', kind: 'TableDoesNotExist', table: 'kid_item_code_seq',
    }))).toBe(true);
  });

  it('ignores another missing relation, another error code, and a message that only mentions the sequence', () => {
    expect(isMissingKidItemCodeSequence(rawQueryFailure({ originalCode: '42P01', table: 'other_seq' }))).toBe(false);
    expect(isMissingKidItemCodeSequence(rawQueryFailure({ originalCode: '40001', table: 'kid_item_code_seq' }))).toBe(false);
    expect(isMissingKidItemCodeSequence(new Error('Code: `42P01`. relation "kid_item_code_seq" does not exist'))).toBe(false);
  });
});
