import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const AttemptTokenSchema = z.string().uuid();

export function parseAttemptToken(value: string | undefined): string {
  const parsed = AttemptTokenSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

/** Removes the attempt token, the one field a public attempt view never carries. */
export function toPublicAttempt<Attempt extends object>(
  attempt: Attempt,
): Omit<Attempt, 'attemptToken'> {
  const { attemptToken: _attemptToken, ...publicAttempt } = attempt as Attempt & { attemptToken?: string };
  return publicAttempt;
}

export function toPublicStatus<
  Attempt extends object,
  Status extends { latestAttempt: Attempt | null; latestComplete: Attempt | null },
>(status: Status) {
  return {
    ...status,
    latestAttempt: status.latestAttempt ? toPublicAttempt(status.latestAttempt) : null,
    latestComplete: status.latestComplete ? toPublicAttempt(status.latestComplete) : null,
  };
}
