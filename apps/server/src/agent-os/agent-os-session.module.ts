import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentOsCapabilityModule } from "./agent-os-capability.module";
import { AgentOsCatalogModule } from "./agent-os-catalog.module";
import { AgentOsRuntimeSupportModule } from "./agent-os-runtime-support.module";
import { PrismaAgentSessionQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-session-query.repository";
import { PrismaAgentConversationQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-conversation-query.repository";
import { PrismaAgentExecutionQueryRepository } from "./adapter/out/repository/interaction/prisma-agent-execution-query.repository";
import { PrismaAgentRunAuthorizationTransaction } from "./adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction";
import { PrismaAgentConversationEventTransaction } from "./adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction";
import { PrismaAgentExecutionUsageTransaction } from "./adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction";
import { PrismaAgentSessionControlQueryRepository } from "./adapter/out/repository/session-control/prisma-agent-session-control-query.repository";
import { PrismaAgentDelegationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-delegation.transaction";
import { PrismaAgentAttemptOperationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction";
import { PrismaAgentSessionOwnedOperationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-session-owned-operation.transaction";
import { PrismaAgentApprovalContinuationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction";
import { PrismaAgentSessionTransitionTransaction } from "./adapter/out/transaction/session-control/prisma-agent-session-transition.transaction";
import { PrismaAgentSessionArtifactMaterializationTransaction } from "./adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction";
import { PrismaAgentExecutionContextRepository } from "./adapter/out/repository/prisma-agent-execution-context.repository";
import { PrismaAgentConversationModelViewRepository } from "./adapter/out/repository/prisma-agent-conversation-model-view.repository";
import { InProcessAgentConversationLivePublisher } from "./adapter/out/event/in-process-agent-conversation-live-publisher.adapter";
import { HermesRuntimeStartupRegistrar } from "./adapter/out/runtime/hermes-runtime-registrar";
import { OpenAiConversationSummarizerAdapter } from "./adapter/out/runtime/openai-conversation-summarizer.adapter";
import { AGENT_SESSION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-session-query.repository.port";
import { AGENT_CONVERSATION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-conversation-query.repository.port";
import { AGENT_EXECUTION_QUERY_REPOSITORY } from "./application/port/out/repository/interaction/agent-execution-query.repository.port";
import { AGENT_RUN_AUTHORIZATION_TRANSACTION } from "./application/port/out/transaction/interaction/agent-run-authorization.transaction.port";
import { AGENT_CONVERSATION_EVENT_TRANSACTION } from "./application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import { AGENT_EXECUTION_USAGE_TRANSACTION } from "./application/port/out/transaction/interaction/agent-execution-usage.transaction.port";
import { AGENT_SESSION_CONTROL_QUERY_REPOSITORY } from "./application/port/out/repository/session-control/agent-session-control-query.repository.port";
import { AGENT_DELEGATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-delegation.transaction.port";
import { AGENT_ATTEMPT_OPERATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import { AGENT_SESSION_OWNED_OPERATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-session-owned-operation.transaction.port";
import { AGENT_APPROVAL_CONTINUATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";
import { AGENT_SESSION_TRANSITION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import { AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION } from "./application/port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port";
import { AGENT_EXECUTION_CONTEXT_REPOSITORY } from "./application/port/out/repository/agent-execution-context.repository.port";
import { AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY } from "./application/port/out/repository/agent-conversation-model-view.repository.port";
import { AGENT_CONVERSATION_LIVE_PUBLISHER } from "./application/port/out/event/agent-conversation-live-publisher.port";
import { AGENT_SESSION_RESOURCE_VERSION_VALIDATOR } from "./application/port/out/resource/agent-session-resource-version-validator.port";
import { AGENT_SESSION_CAPABILITY_INVOCATION_PORT } from "./application/port/in/session-capability/agent-capability-invocation.port";
import { AgentCapabilityRegistry } from "./application/service/agent-capability-registry.service";
import {
  AGENT_CONVERSATION_SUMMARIZER,
  AgentConversationModelViewService,
} from "./application/service/agent-conversation-model-view.service";
import { AgentExecutionContextBuilder } from "./application/service/agent-execution-context-builder.service";
import { AgentSessionCapabilityInvocationService } from "./application/service/agent-session-capability-invocation.service";
import { AgentRuntimeAdapterRegistry } from "./application/service/agent-runtime-adapter.registry";
import { PrismaAgentRuntimeCredentialAuthorityRepository } from "./adapter/out/repository/session-execution/prisma-agent-runtime-credential-authority.repository";
import { AgentSessionRuntimeCleanupAdapter } from "./adapter/out/runtime/agent-session-runtime-cleanup.adapter";
import { PrismaAgentSessionDeletionExecutionTransaction } from "./adapter/out/transaction/session-deletion/prisma-agent-session-deletion-execution.transaction";
import { AgentRuntimeCredentialVerificationService } from "./application/service/session-execution/agent-runtime-credential-verification.service";
import { AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY } from "./application/port/out/repository/session-execution/agent-runtime-credential-authority.repository.port";
import { AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT } from "./application/port/in/session-execution/agent-runtime-credential-verification.port";
import { AGENT_SESSION_RUNTIME_CLEANUP_PORT } from "./application/port/out/runtime/agent-session-runtime-cleanup.port";
import { AGENT_SESSION_DELETION_EXECUTION_TRANSACTION } from "./application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port";
import { RuntimeCredentialBroker } from "./adapter/out/runtime/runtime-credential-broker";

@Module({
  imports: [
    PrismaModule,
    AgentOsCatalogModule,
    AgentOsCapabilityModule,
    AgentOsRuntimeSupportModule,
  ],
  providers: [
    AgentRuntimeAdapterRegistry,
    PrismaAgentRuntimeCredentialAuthorityRepository,
    AgentRuntimeCredentialVerificationService,
    AgentSessionRuntimeCleanupAdapter,
    PrismaAgentSessionDeletionExecutionTransaction,
    {
      provide: RuntimeCredentialBroker,
      useFactory: () => {
        return new RuntimeCredentialBroker({
          secretResolver: () => process.env.AGENT_RUNTIME_CREDENTIAL_HMAC_KEY,
        });
      },
    },
    { provide: AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY, useExisting: PrismaAgentRuntimeCredentialAuthorityRepository },
    { provide: AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT, useExisting: AgentRuntimeCredentialVerificationService },
    { provide: AGENT_SESSION_RUNTIME_CLEANUP_PORT, useExisting: AgentSessionRuntimeCleanupAdapter },
    { provide: AGENT_SESSION_DELETION_EXECUTION_TRANSACTION, useExisting: PrismaAgentSessionDeletionExecutionTransaction },
    {
      provide: HermesRuntimeStartupRegistrar,
      inject: [AgentRuntimeAdapterRegistry, AgentCapabilityRegistry],
      useFactory: (
        runtimes: AgentRuntimeAdapterRegistry,
        capabilities: AgentCapabilityRegistry,
      ) => new HermesRuntimeStartupRegistrar(runtimes, capabilities),
    },
    AgentConversationModelViewService,
    AgentExecutionContextBuilder,
    AgentSessionCapabilityInvocationService,
    OpenAiConversationSummarizerAdapter,
    {
      provide: AGENT_SESSION_QUERY_REPOSITORY,
      useClass: PrismaAgentSessionQueryRepository,
    },
    {
      provide: AGENT_CONVERSATION_QUERY_REPOSITORY,
      useClass: PrismaAgentConversationQueryRepository,
    },
    {
      provide: AGENT_EXECUTION_QUERY_REPOSITORY,
      useClass: PrismaAgentExecutionQueryRepository,
    },
    {
      provide: AGENT_RUN_AUTHORIZATION_TRANSACTION,
      useClass: PrismaAgentRunAuthorizationTransaction,
    },
    {
      provide: AGENT_CONVERSATION_EVENT_TRANSACTION,
      useClass: PrismaAgentConversationEventTransaction,
    },
    {
      provide: AGENT_EXECUTION_USAGE_TRANSACTION,
      useClass: PrismaAgentExecutionUsageTransaction,
    },
    {
      provide: AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
      useClass: PrismaAgentSessionControlQueryRepository,
    },
    {
      provide: AGENT_DELEGATION_TRANSACTION,
      useClass: PrismaAgentDelegationTransaction,
    },
    {
      provide: AGENT_ATTEMPT_OPERATION_TRANSACTION,
      useClass: PrismaAgentAttemptOperationTransaction,
    },
    {
      provide: AGENT_SESSION_OWNED_OPERATION_TRANSACTION,
      useClass: PrismaAgentSessionOwnedOperationTransaction,
    },
    {
      provide: AGENT_APPROVAL_CONTINUATION_TRANSACTION,
      useClass: PrismaAgentApprovalContinuationTransaction,
    },
    {
      provide: AGENT_SESSION_TRANSITION_TRANSACTION,
      useClass: PrismaAgentSessionTransitionTransaction,
    },
    {
      provide: AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
      useClass: PrismaAgentSessionArtifactMaterializationTransaction,
    },
    {
      // Until each owner domain supplies a version resolver, only an approval
      // with no resource reference may be resumed. Unknown resources never
      // become implicit approval authority.
      provide: AGENT_SESSION_RESOURCE_VERSION_VALIDATOR,
      useValue: {
        areCurrent: async ({
          resourceVersions,
        }: {
          resourceVersions: readonly unknown[];
        }) => resourceVersions.length === 0,
      },
    },
    {
      provide: AGENT_EXECUTION_CONTEXT_REPOSITORY,
      useClass: PrismaAgentExecutionContextRepository,
    },
    PrismaAgentConversationModelViewRepository,
    {
      provide: AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY,
      useExisting: PrismaAgentConversationModelViewRepository,
    },
    {
      provide: AGENT_CONVERSATION_SUMMARIZER,
      useExisting: OpenAiConversationSummarizerAdapter,
    },
    InProcessAgentConversationLivePublisher,
    {
      provide: AGENT_CONVERSATION_LIVE_PUBLISHER,
      useExisting: InProcessAgentConversationLivePublisher,
    },
    {
      provide: AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
      useExisting: AgentSessionCapabilityInvocationService,
    },
  ],
  exports: [
    AGENT_SESSION_QUERY_REPOSITORY,
    AGENT_CONVERSATION_QUERY_REPOSITORY,
    AGENT_EXECUTION_QUERY_REPOSITORY,
    AGENT_RUN_AUTHORIZATION_TRANSACTION,
    AGENT_CONVERSATION_EVENT_TRANSACTION,
    AGENT_EXECUTION_USAGE_TRANSACTION,
    AgentRuntimeAdapterRegistry,
    AgentExecutionContextBuilder,
    AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
    AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY,
    AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT,
    AGENT_SESSION_RUNTIME_CLEANUP_PORT,
    AGENT_SESSION_DELETION_EXECUTION_TRANSACTION,
    AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
    AGENT_DELEGATION_TRANSACTION,
    AGENT_ATTEMPT_OPERATION_TRANSACTION,
    AGENT_SESSION_OWNED_OPERATION_TRANSACTION,
    AGENT_APPROVAL_CONTINUATION_TRANSACTION,
    AGENT_SESSION_TRANSITION_TRANSACTION,
    AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION,
    AGENT_CONVERSATION_LIVE_PUBLISHER,
    AGENT_SESSION_RESOURCE_VERSION_VALIDATOR,
  ],
})
/** Controller-free official session/runtime composition. */
export class AgentOsSessionModule {}
