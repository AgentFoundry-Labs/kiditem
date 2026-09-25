import { describe, expect, it } from 'vitest';
import { OperationLockKeySchema, resourceLockKey } from '@kiditem/shared/operation';
import { lockId } from '../sourcing-extension-operation.service';

describe('sourcing extension lock ids (KID-360)', () => {
  it('keeps a short target readable and replaces whitespace so the lockKey stays valid', () => {
    expect(lockId('keyword:a pencil case')).toBe('keyword:a_pencil_case');
    expect(OperationLockKeySchema.safeParse(resourceLockKey('coupang', lockId('keyword:a pencil case'))).success).toBe(true);
  });

  it('hashes a long target to 32 hex characters, the same for the same target', () => {
    const long = `keyword:${'필통'.repeat(120)}`;
    expect(lockId(long)).toMatch(/^[0-9a-f]{32}$/);
    expect(lockId(long)).toBe(lockId(long));
    expect(OperationLockKeySchema.safeParse(resourceLockKey('coupang', lockId(long))).success).toBe(true);
  });
});
