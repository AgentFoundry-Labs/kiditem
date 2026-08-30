import { BadRequestException } from '@nestjs/common';

/** Parses one caller-stable key for a user action and rejects server-generated fallback. */
export function parseRequiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (key.length === 0 || key.length > 200) {
    throw new BadRequestException('invalid_idempotency_key');
  }
  return key;
}
