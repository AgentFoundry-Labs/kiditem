import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AdIngestTransactionPort } from '../../../application/port/out/transaction/ad-ingest-transaction.port';
import { runWithAdIngestTransaction } from './ad-ingest-transaction-context';

const SETTING_PREFIX = 'advertising.extension-sync.idempotency.';

@Injectable()
export class AdIngestTransactionAdapter implements AdIngestTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async runIdempotent<T extends Record<string, unknown>>(
    input: { organizationId: string; idempotencyKey: string },
    operation: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }> {
    const keyHash = createHash('sha256').update(input.idempotencyKey).digest('hex');
    const settingKey = `${SETTING_PREFIX}${keyHash}`;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => runWithAdIngestTransaction(tx, async () => {
          const existing = await tx.systemSetting.findUnique({
            where: {
              organizationId_key: {
                organizationId: input.organizationId,
                key: settingKey,
              },
            },
            select: { value: true },
          });
          const existingValue = toRecord(existing?.value);
          if (existingValue.state === 'complete') {
            const response = toRecord(existingValue.response) as T;
            return { value: response, replayed: true };
          }

          await tx.systemSetting.create({
            data: {
              organizationId: input.organizationId,
              key: settingKey,
              value: { state: 'running', keyHash },
            },
          });
          const value = await operation();
          await tx.systemSetting.update({
            where: {
              organizationId_key: {
                organizationId: input.organizationId,
                key: settingKey,
              },
            },
            data: {
              value: {
                state: 'complete',
                keyHash,
                response: value as Prisma.InputJsonValue,
              },
            },
          });
          return { value, replayed: false };
        }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt === 3 || !isRetryableContention(error)) throw error;
      }
    }
    throw new Error('unreachable idempotent ingest retry state');
  }
}

function isRetryableContention(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034');
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
