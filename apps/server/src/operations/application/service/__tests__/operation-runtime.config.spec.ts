import { afterEach, describe, expect, it } from 'vitest';
import { resolveOperationResourceClassLimits } from '../operation-runtime.config';

const originalLimits = process.env.OPERATION_RESOURCE_CLASS_LIMITS;

afterEach(() => {
  if (originalLimits === undefined) {
    delete process.env.OPERATION_RESOURCE_CLASS_LIMITS;
  } else {
    process.env.OPERATION_RESOURCE_CLASS_LIMITS = originalLimits;
  }
});

describe('resolveOperationResourceClassLimits', () => {
  it('returns complete defaults when the environment value is absent', () => {
    delete process.env.OPERATION_RESOURCE_CLASS_LIMITS;

    expect(resolveOperationResourceClassLimits()).toEqual({
      default: 2,
      naver_api: 2,
      extension_coupang: 4,
      playwright_1688: 1,
      snapshot_compute: 2,
    });
  });

  it('returns a complete configured resource-class limit record', () => {
    process.env.OPERATION_RESOURCE_CLASS_LIMITS = JSON.stringify({
      default: 3,
      naver_api: 4,
      extension_coupang: 5,
      playwright_1688: 1,
      snapshot_compute: 6,
    });

    expect(resolveOperationResourceClassLimits()).toEqual({
      default: 3,
      naver_api: 4,
      extension_coupang: 5,
      playwright_1688: 1,
      snapshot_compute: 6,
    });
  });

  it.each([
    ['malformed JSON', '{'],
    [
      'an unknown class',
      JSON.stringify({
        default: 2,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
        snapshot_compute: 2,
        unknown: 3,
      }),
    ],
    [
      'a missing class',
      JSON.stringify({
        default: 2,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
      }),
    ],
    [
      'a zero limit',
      JSON.stringify({
        default: 0,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
        snapshot_compute: 2,
      }),
    ],
    [
      'a negative limit',
      JSON.stringify({
        default: -1,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
        snapshot_compute: 2,
      }),
    ],
    [
      'a non-integer limit',
      JSON.stringify({
        default: 1.5,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
        snapshot_compute: 2,
      }),
    ],
    [
      'a limit above the persisted integer range',
      JSON.stringify({
        default: 2_147_483_648,
        naver_api: 2,
        extension_coupang: 4,
        playwright_1688: 1,
        snapshot_compute: 2,
      }),
    ],
  ])('rejects %s', (_case, value) => {
    process.env.OPERATION_RESOURCE_CLASS_LIMITS = value;

    expect(() => resolveOperationResourceClassLimits()).toThrow(
      'operation_resource_class_limits_invalid',
    );
  });
});
