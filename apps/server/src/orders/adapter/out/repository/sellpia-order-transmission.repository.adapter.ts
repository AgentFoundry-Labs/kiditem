import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaOrderTransmissionOutcome,
  SellpiaOrderTransmissionRepositoryPort,
  SellpiaOrderTransmissionRepositoryTransaction,
  SellpiaOrderTransmissionStatus,
} from '../../../application/port/out/repository/sellpia-order-transmission.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class SellpiaOrderTransmissionRepositoryAdapter
implements SellpiaOrderTransmissionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  withLockedIntent<T>(
    input: { organizationId: string; intentKey: string },
    operation: (
      transaction: SellpiaOrderTransmissionRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `kiditem.sellpia-order-transmission:${input.organizationId}:${input.intentKey}`;
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; intent key is also part of the lock and no tenant data is read.
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      return operation(new LockedIntentTransaction(
        tx,
        input.organizationId,
        input.intentKey,
      ));
    }, TRANSACTION_OPTIONS);
  }
}

class LockedIntentTransaction
implements SellpiaOrderTransmissionRepositoryTransaction {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly intentKey: string,
  ) {}

  async prepare(input: { userId: string; preparedAt: Date }) {
    const existing = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: { organizationId: this.organizationId, intentKey: this.intentKey },
      select: { status: true, createdBy: true },
    });
    if (existing && existing.createdBy !== input.userId) return 'not_owned' as const;
    if (existing?.status === 'prepared') return 'already_prepared' as const;
    if (existing?.status === 'finalized') return 'already_finalized' as const;
    if (existing?.status === 'aborted') {
      const reopened = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
        where: {
          organizationId: this.organizationId,
          intentKey: this.intentKey,
          status: 'aborted',
        },
        data: {
          status: 'prepared',
          preparedAt: input.preparedAt,
          finalizedAt: null,
          abortedAt: null,
          finalizedGeneration: null,
        },
      });
      if (reopened.count !== 1) {
        throw new ConflictException('Sellpia order transmission intent reopen lost its fence');
      }
      return 'prepared' as const;
    }
    if (existing) {
      throw new ConflictException('Sellpia order transmission intent has an invalid status');
    }
    await this.tx.sellpiaOrderTransmissionIntent.create({
      data: {
        organizationId: this.organizationId,
        intentKey: this.intentKey,
        status: 'prepared',
        createdBy: input.userId,
        preparedAt: input.preparedAt,
      },
    });
    return 'prepared' as const;
  }

  async findForActor(userId: string) {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: {
        organizationId: this.organizationId,
        intentKey: this.intentKey,
        createdBy: userId,
      },
      select: { status: true },
    });
    return intent ? { status: parseStatus(intent.status) } : null;
  }

  async finalize(input: { userId: string; finalizedAt: Date }) {
    const finalized = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        organizationId: this.organizationId,
        intentKey: this.intentKey,
        createdBy: input.userId,
        status: 'prepared',
      },
      data: {
        status: 'finalized',
        finalizedGeneration: null,
        finalizedAt: input.finalizedAt,
        abortedAt: null,
      },
    });
    if (finalized.count !== 1) {
      throw new ConflictException('Sellpia order transmission intent finalize lost its fence');
    }
  }

  async abort(input: { userId: string; abortedAt: Date }) {
    const aborted = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        organizationId: this.organizationId,
        intentKey: this.intentKey,
        createdBy: input.userId,
        status: 'prepared',
      },
      data: { status: 'aborted', abortedAt: input.abortedAt },
    });
    if (aborted.count !== 1) {
      throw new ConflictException('Sellpia order transmission intent abort lost its fence');
    }
  }

  async findForReconciliation() {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: { organizationId: this.organizationId, intentKey: this.intentKey },
      select: {
        status: true,
        reconciliations: {
          orderBy: [{ reconciledAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            reconciledBy: true,
            reconciledAt: true,
            note: true,
            outcome: true,
          },
        },
      },
    });
    if (!intent) return null;
    const latest = intent.reconciliations[0];
    return {
      status: parseStatus(intent.status),
      latestReconciliation: latest
        ? { ...latest, outcome: parseOutcome(latest.outcome) }
        : null,
    };
  }

  async reconcile(input: {
    userId: string;
    reconciledAt: Date;
    note: string;
    outcome: SellpiaOrderTransmissionOutcome;
  }) {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirstOrThrow({
      where: {
        organizationId: this.organizationId,
        intentKey: this.intentKey,
        status: input.outcome === 'not_submitted'
          ? { in: ['prepared', 'finalized'] }
          : 'prepared',
      },
      select: { id: true },
    });
    const resolved = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        id: intent.id,
        organizationId: this.organizationId,
        status: input.outcome === 'not_submitted'
          ? { in: ['prepared', 'finalized'] }
          : 'prepared',
      },
      data: input.outcome === 'submitted'
        ? {
            status: 'finalized',
            finalizedGeneration: null,
            finalizedAt: input.reconciledAt,
            abortedAt: null,
          }
        : {
            status: 'aborted',
            finalizedGeneration: null,
            finalizedAt: null,
            abortedAt: input.reconciledAt,
          },
    });
    if (resolved.count !== 1) {
      throw new ConflictException('Sellpia order transmission reconcile lost its fence');
    }
    await this.tx.sellpiaOrderTransmissionIntentReconciliation.create({
      data: {
        organizationId: this.organizationId,
        intentId: intent.id,
        reconciledBy: input.userId,
        reconciledAt: input.reconciledAt,
        note: input.note,
        outcome: input.outcome,
      },
    });
  }
}

function parseStatus(status: string): SellpiaOrderTransmissionStatus {
  if (status === 'prepared' || status === 'finalized' || status === 'aborted') return status;
  throw new ConflictException('Sellpia order transmission intent has an invalid status');
}

function parseOutcome(outcome: string): SellpiaOrderTransmissionOutcome {
  if (outcome === 'submitted' || outcome === 'not_submitted') return outcome;
  throw new ConflictException('Sellpia order transmission reconciliation has an invalid outcome');
}
