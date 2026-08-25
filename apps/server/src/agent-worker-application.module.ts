import { Module } from '@nestjs/common';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentApprovalExpiryService } from './agent-os/application/service/work/agent-approval-expiry.service';
import { AgentMutationDispatcherService } from './agent-os/application/service/work/agent-mutation-dispatcher.service';
import { AgentWorkPollerService } from './agent-os/application/service/work/agent-work-poller.service';
import {
  AGENT_WORK_INVOCATION_APPROVAL_PORT,
  type AgentWorkInvocationApprovalPort,
} from './agent-os/application/port/out/work/agent-work-invocation-approval.port';
import {
  AGENT_WORK_MUTATION_PORT,
  type AgentWorkMutationPort,
} from './agent-os/application/port/out/work/agent-work-mutation.port';

@Module({
  imports: [AgentWorkCapabilityApplicationModule, AgentOsWorkerModule],
  providers: [
    {
      provide: AgentApprovalExpiryService,
      inject: [AGENT_WORK_INVOCATION_APPROVAL_PORT],
      useFactory: (work: AgentWorkInvocationApprovalPort) => new AgentApprovalExpiryService(work),
    },
    {
      provide: AgentMutationDispatcherService,
      inject: [AGENT_WORK_MUTATION_PORT, AgentCapabilityRegistry],
      useFactory: (work: AgentWorkMutationPort, capabilities: AgentCapabilityRegistry) =>
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
