import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type {
  SourcingBrowserSourceAttempt,
  SourcingBrowserSourceStatus,
} from '../../../application/port/out/repository/sourcing-browser-source-attempt.repository.port';

const AttemptTokenSchema = z.string().uuid();

export function parseAttemptToken(value: string | undefined): string {
  const parsed = AttemptTokenSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

export function toPublicAttempt(attempt: SourcingBrowserSourceAttempt) {
  const { attemptToken: _attemptToken, ...publicAttempt } = attempt;
  return publicAttempt;
}

export function toPublicStatus(status: SourcingBrowserSourceStatus) {
  return {
    ...status,
    latestAttempt: status.latestAttempt ? toPublicAttempt(status.latestAttempt) : null,
    latestComplete: status.latestComplete ? toPublicAttempt(status.latestComplete) : null,
  };
}
