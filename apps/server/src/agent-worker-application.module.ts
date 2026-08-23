import { Module } from '@nestjs/common';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentApprovalExpiryService } from './agent-os/application/service/work/agent-approval-expiry.service';
import { AgentMutationDispatcherService } from './agent-os/application/service/work/agent-mutation-dispatcher.service';
import { AgentWorkPollerService } from './agent-os/application/service/work/agent-work-poller.service';

@Module({
  imports: [AgentWorkCapabilityApplicationModule, AgentOsWorkerModule],
  providers: [
    {
      provide: AgentApprovalExpiryService,
      inject: [PrismaAgentWorkTransaction],
      useFactory: (work: PrismaAgentWorkTransaction) => new AgentApprovalExpiryService(work),
    },
    {
      provide: AgentMutationDispatcherService,
      inject: [PrismaAgentWorkTransaction, AgentCapabilityRegistry],
      useFactory: (work: PrismaAgentWorkTransaction, capabilities: AgentCapabilityRegistry) =>
        new AgentMutationDispatcherService(work, capabilities, currentWorkRuntimeIdentity()),
    },
    {
      provide: AgentWorkPollerService,
      inject: [AgentMutationDispatcherService, AgentApprovalExpiryService, PrismaAgentWorkRepository],
      useFactory: (dispatcher: AgentMutationDispatcherService, approvals: AgentApprovalExpiryService, work: PrismaAgentWorkRepository) =>
        new AgentWorkPollerService(dispatcher, approvals, work),
    },
  ],
})
export class AgentWorkerApplicationModule {}

export function currentWorkRuntimeIdentity() {
  const applicationVersion = process.env.KIDITEM_APPLICATION_VERSION?.trim();
  const gitSha = process.env.KIDITEM_GIT_SHA?.trim();
  if (!applicationVersion || !gitSha) throw new Error('missing_required_work_runtime_identity');
  return {
    applicationVersion,
    gitSha,
  };
}
