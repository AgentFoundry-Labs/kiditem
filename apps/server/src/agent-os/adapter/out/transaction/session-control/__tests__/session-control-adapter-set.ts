import type { PrismaService } from '../../../../../../prisma/prisma.service';
import { PrismaAgentSessionControlQueryRepository } from '../../../repository/session-control/prisma-agent-session-control-query.repository';
import { PrismaAgentApprovalContinuationTransaction } from '../prisma-agent-approval-continuation.transaction';
import { PrismaAgentAttemptOperationTransaction } from '../prisma-agent-attempt-operation.transaction';
import { PrismaAgentDelegationTransaction } from '../prisma-agent-delegation.transaction';
import { PrismaAgentSessionTransitionTransaction } from '../prisma-agent-session-transition.transaction';

/**
 * Test-only convenience surface. Production code receives each narrow seam
 * directly; integration scenarios use this proxy only to exercise the real
 * adapters as one fixture set.
 */
export class SessionControlAdapterSet {
  constructor(prisma: PrismaService) {
    const adapters = [
      new PrismaAgentSessionControlQueryRepository(prisma),
      new PrismaAgentDelegationTransaction(prisma),
      new PrismaAgentAttemptOperationTransaction(prisma),
      new PrismaAgentApprovalContinuationTransaction(prisma),
      new PrismaAgentSessionTransitionTransaction(prisma),
    ];

    return new Proxy(this, {
      get(target, key, receiver) {
        const own = Reflect.get(target, key, receiver);
        if (own !== undefined) return own;
        for (const adapter of adapters) {
          const method = Reflect.get(adapter, key);
          if (typeof method === 'function') return method.bind(adapter);
        }
        return undefined;
      },
    });
  }
}
