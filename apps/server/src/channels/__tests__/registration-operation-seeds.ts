import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { REGISTRATION_KIND, RegistrationPlanSchema, type RegistrationExecutionKind } from '@kiditem/shared/channels-operations';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { hashRegistrationSubmissionPayload } from '../domain/registration/registration-submission-payload';
import { TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';

const integrity = new ChannelIntegrityAdapter();

/**
 * 등록 실행(`channels.registration`, KID-364) 한 줄을 사실 준비로 바로 쓴다. 읽기 쪽(등록 상태 · 품절 판정 · 옵션 참조)
 * 스펙이 실행의 결과 상태만 필요할 때 쓴다 — 실행을 실제로 돌리는 길은 `registration-operation.pg.integration.spec.ts`다.
 * 살아 있는 상태면 `lockKeys`의 잠금 행도 쓴다.
 */
export async function seedRegistrationOperation(prisma: PrismaClient, input: {
  organizationId?: string;
  executionKind: RegistrationExecutionKind;
  channelAccountId: string;
  mallKey?: string;
  registrationTargetId?: string | null;
  salesProductId?: string | null;
  channelListingId?: string | null;
  externalListingId?: string | null;
  payload: Record<string, unknown>;
  status: 'prepared' | 'executing' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled';
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  lockKeys?: string[];
  startedAt?: Date;
  finishedAt?: Date | null;
}): Promise<{ id: string }> {
  const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
  const startedAt = input.startedAt ?? new Date();
  const payload = JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown>;
  const plan = RegistrationPlanSchema.parse({
    executionKind: input.executionKind,
    mallKey: input.mallKey ?? 'smartstore',
    channelAccountId: input.channelAccountId,
    registrationTargetId: input.registrationTargetId ?? null,
    salesProductId: input.salesProductId ?? null,
    channelListingId: input.channelListingId ?? null,
    externalListingId: input.externalListingId ?? null,
    expectedProviderAccountId: null,
    submit: true,
    payloadHash: hashRegistrationSubmissionPayload(payload, integrity.sha256),
    payload,
    startedAt: startedAt.toISOString(),
  });
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(input.status);
  const operation = await prisma.operation.create({
    data: {
      organizationId,
      kind: REGISTRATION_KIND,
      status: input.status,
      token: randomUUID(),
      expiresAt: new Date(startedAt.getTime() + (terminal ? 0 : 30 * 60_000)),
      plan: plan as unknown as Prisma.InputJsonValue,
      ...(input.result ? { result: input.result as Prisma.InputJsonValue } : {}),
      errorCode: input.errorCode ?? (input.status === 'failed' ? 'PROVIDER_ERROR' : null),
      startedAt,
      finishedAt: terminal ? (input.finishedAt ?? startedAt) : null,
      attempts: 1,
      maxAttempts: 1,
    },
    select: { id: true },
  });
  if (!terminal) {
    for (const lockKey of input.lockKeys ?? []) {
      await prisma.operationLock.create({ data: { organizationId, lockKey, operationId: operation.id } });
    }
  }
  return operation;
}
