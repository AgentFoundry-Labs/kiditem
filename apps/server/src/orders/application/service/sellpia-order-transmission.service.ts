import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  SellpiaOrderTransmissionIntentReconcileResponse,
} from '@kiditem/shared/sellpia-order-transmission';
import type { SellpiaOrderTransmissionPort } from '../port/in/sellpia-order-transmission.port';
import {
  SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT,
  type SellpiaOrderTransmissionOutcome,
  type SellpiaOrderTransmissionReconciliationRecord,
  type SellpiaOrderTransmissionRepositoryPort,
  type SellpiaOrderTransmissionStatus,
} from '../port/out/repository/sellpia-order-transmission.repository.port';

type ActorIntent = { organizationId: string; userId: string; intentKey: string };

@Injectable()
export class SellpiaOrderTransmissionService
implements SellpiaOrderTransmissionPort {
  constructor(
    @Inject(SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT)
    private readonly repository: SellpiaOrderTransmissionRepositoryPort,
  ) {}

  prepare(input: ActorIntent) {
    return this.repository.withLockedIntent(intentScope(input), async (transaction) => {
      const disposition = await transaction.prepare({
        userId: input.userId,
        preparedAt: new Date(),
      });
      if (disposition === 'not_owned') throw intentNotFound();
      return { intentKey: input.intentKey, disposition };
    });
  }

  finalize(input: ActorIntent) {
    return this.repository.withLockedIntent(intentScope(input), async (transaction) => {
      const intent = await transaction.findForActor(input.userId);
      if (!intent) throw intentNotFound();
      if (intent.status === 'finalized') {
        return { intentKey: input.intentKey, status: 'finalized' as const };
      }
      if (intent.status !== 'prepared') {
        throw new ConflictException('Sellpia order transmission intent is not prepared');
      }
      await transaction.finalize({ userId: input.userId, finalizedAt: new Date() });
      return { intentKey: input.intentKey, status: 'finalized' as const };
    });
  }

  abort(input: ActorIntent) {
    return this.repository.withLockedIntent(intentScope(input), async (transaction) => {
      const intent = await transaction.findForActor(input.userId);
      if (!intent) throw intentNotFound();
      if (intent.status === 'finalized') {
        throw new ConflictException('Finalized Sellpia order transmission cannot be aborted');
      }
      if (intent.status === 'prepared') {
        await transaction.abort({ userId: input.userId, abortedAt: new Date() });
      }
      return { intentKey: input.intentKey, status: 'aborted' as const };
    });
  }

  reconcile(input: ActorIntent & {
    outcome: SellpiaOrderTransmissionOutcome;
    note: string;
  }) {
    const note = input.note.trim();
    if (!note || note.length > 500) {
      throw new BadRequestException('Reconciliation note must be 1-500 characters');
    }
    return this.repository.withLockedIntent(intentScope(input), async (transaction) => {
      const intent = await transaction.findForReconciliation();
      if (!intent) throw intentNotFound();
      const correctsFalseFinalization = intent.status === 'finalized'
        && input.outcome === 'not_submitted';
      if (intent.status !== 'prepared' && !correctsFalseFinalization) {
        if (!intent.latestReconciliation
          || intent.latestReconciliation.outcome !== input.outcome) {
          throw new ConflictException('Sellpia order transmission is already resolved');
        }
        return reconciliationResponse({
          intentKey: input.intentKey,
          status: intent.status,
          audit: intent.latestReconciliation,
        });
      }

      const reconciledAt = new Date();
      await transaction.reconcile({
        userId: input.userId,
        reconciledAt,
        note,
        outcome: input.outcome,
      });
      return reconciliationResponse({
        intentKey: input.intentKey,
        status: input.outcome === 'submitted' ? 'finalized' : 'aborted',
        audit: {
          reconciledBy: input.userId,
          reconciledAt,
          note,
          outcome: input.outcome,
        },
      });
    });
  }
}

function intentScope(input: ActorIntent) {
  return { organizationId: input.organizationId, intentKey: input.intentKey };
}

function intentNotFound() {
  return new NotFoundException('Sellpia order transmission intent was not found');
}

function reconciliationResponse(input: {
  intentKey: string;
  status: SellpiaOrderTransmissionStatus;
  audit: SellpiaOrderTransmissionReconciliationRecord;
}): SellpiaOrderTransmissionIntentReconcileResponse {
  const expectedStatus = input.audit.outcome === 'submitted' ? 'finalized' : 'aborted';
  if (input.status !== expectedStatus) {
    throw new ConflictException('Sellpia order transmission reconciliation is inconsistent');
  }
  return {
    intentKey: input.intentKey,
    outcome: input.audit.outcome,
    status: expectedStatus,
    reconciledBy: input.audit.reconciledBy,
    reconciledAt: input.audit.reconciledAt.toISOString(),
    note: input.audit.note,
  };
}
