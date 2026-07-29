import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSecureRandomUuid } from '../secure-random-uuid';

describe('createSecureRandomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the native secure UUID API when available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    });

    expect(createSecureRandomUuid()).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('builds an RFC 4122 UUID v4 from secure random bytes on an HTTP origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(createSecureRandomUuid()).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
  });

  it('fails closed when no cryptographically secure API is available', () => {
    vi.stubGlobal('crypto', {});

    expect(() => createSecureRandomUuid()).toThrow(
      '이 브라우저는 안전한 수집 실행 ID 생성을 지원하지 않습니다.',
    );
  });
});
