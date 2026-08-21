# AgentOS ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` after Prisma schema changes.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| AgentApprovalRequest | `agent_approval_requests` | Human approval state. While pending, AgentRunRequest.status = requires_approval. |
| AgentArtifact | `agent_artifacts` | User-visible output card linked to task, tool, or domain record. |
| AgentAuthorityProfileVersion | `agent_authority_profile_versions` | Immutable organization-scoped authority profile selected before a durable Agent session begins. |
| AgentAuthorizationEvent | `agent_authorization_events` | Authorization audit. Logged before, during, and outside runs (eg. admin policy widening). |
| AgentContextEpoch | `agent_context_epochs` | Immutable context-boundary marker owned by one canonical interaction session. |
| AgentConversation | `agent_conversations` | User-facing Agent OS conversation thread. |
| AgentConversationEvent | `agent_conversation_events` | Canonical append-only conversation event with organization-fenced session and execution ownership. |
| AgentConversationOutbox | `agent_conversation_outboxes` | Transactional publication marker referencing canonical conversation content without copying its payload. |
| AgentCostEvent | `agent_cost_events` | Cost ledger source of truth. Insert + AgentRuntimeState aggregate update share one transaction. |
| AgentExecution | `agent_executions` | Required session/task-owned interaction execution and terminal control state. |
| AgentExecutionAttempt | `agent_execution_attempts` | One immutable numbered runtime attempt and its opaque reconnect handle identity. |
| AgentExecutionAttemptOperationBinding | `agent_execution_attempt_operation_bindings` | Immutable lifecycle-envelope binding for one durable Agent execution attempt. A successor OperationRun retains the same external runtime handle and references the previous immutable OperationRun. |
| AgentExecutionUsage | `agent_execution_usages` | Immutable model usage and cost record attached to an organization-scoped interaction execution. |
| AgentInstance | `agent_instances` | Organization-owned runnable subject. Type must match the code-owned Agent Definition Registry. |
| AgentInstanceToolPolicy | `agent_instance_tool_policies` | Per-instance override for tool policy. Registry defaults are code-owned; DB stores organization overrides. |
| AgentInteractionRetentionPolicy | `agent_interaction_retention_policies` | Organization-level immutable-minimum interaction retention policy with an auditable legal policy version. |
| AgentMessage | `agent_messages` | Visible conversation message tied to user, Operator, agent, or tool output. |
| AgentPolicySnapshot | `agent_policy_snapshots` | Immutable session-scoped authority and capability decision used to authorize AgentOS executions. |
| AgentRun | `agent_runs` | Accepted execution attempt. Replaces HeartbeatRun. Always starts at status="running"; queue state lives on AgentRunRequest. |
| AgentRunEvent | `agent_run_events` | Run-local event timeline (status, tool, model, safety, fallback). Bulk logs go to external store via logRef. |
| AgentRunRequest | `agent_run_requests` | Durable request inbox + queue + dedupe + audit. Replaces AgentWakeupRequest. Queue state lives here, not on AgentRun. |
| AgentRuntimeState | `agent_runtime_states` | Frequently-changing per-instance runtime state (last run, totals, cached aggregates). 1:1 with AgentInstance. |
| AgentSession | `agent_sessions` | Organization-scoped canonical interaction session rooted at the first submitted user message. |
| AgentSessionApproval | `agent_session_approvals` | Invocation-scoped human approval request and immutable terminal decision identity, bound to the exact OperationRun envelope that requested it. |
| AgentSessionApprovalContinuation | `agent_session_approval_continuations` | Durable approval-continuation outbox. It records successor-envelope creation and exact idempotent runtime interrupt delivery separately. |
| AgentSessionArtifact | `agent_session_artifacts` | Immutable content-addressed artifact reference owned by one durable session task and execution. |
| AgentSessionLegalAuditProjection | `agent_session_legal_audit_projections` | Content-free, organization-fenced record retained only when an explicit independent legal-audit basis outlives a deleted interaction session. |
| AgentSessionLifecycleRequest | `agent_session_lifecycle_requests` | Scoped lifecycle idempotency record retained only while its canonical AgentSession exists. |
| AgentSessionTask | `agent_session_tasks` | Root or delegated task control state owned by one canonical interaction session. |
| AgentSessionTaskDelegation | `agent_session_task_delegations` | Immutable parent-child task delegation with a bounded authority subset and stable idempotency identity. |
| AgentSessionTombstone | `agent_session_tombstones` | Content-free, versioned-HMAC deletion receipt used only for terminal delete idempotency. |
| AgentTaskSession | `agent_task_sessions` | Per-task durable session. taskKey defaults to "default" only at API boundary. |
| AgentToolDefinition | `agent_tool_definitions` | Catalog of business tools agents may invoke. KidItem ships a curated set; not a generic HTTP/DB tool marketplace. |
| AgentToolInvocation | `agent_tool_invocations` | Durable capability/tool invocation audit record. |
| AgentVersion | `agent_versions` | Immutable runtime and policy identity for one version of a code-defined interactive agent. |
| WorkflowRun | `workflow_runs` | Workflow run record. Workflow runner triggers Agent OS via AgentRunnerPort with sourceWorkflowRunId. |
| WorkflowTemplate | `workflow_templates` | Workflow definition. Trigger config + nodes/edges. |

## Mermaid ER Diagram

```mermaid
erDiagram
  AgentApprovalRequest {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String status
    String reasonCode
    String reason
    String prompt
    Json payload
    Json actionSnapshot
    String requestedByActorType
    String requestedByActorId
    String requestedByUserId FK
    String approverUserId FK
    String decidedByUserId FK
    DateTime decidedAt
    String decisionReason
    DateTime expiresAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentArtifact {
    String id PK
    String organizationId FK
    String conversationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String toolInvocationId FK
    String artifactType
    String targetDomain
    String targetModel
    String targetId
    String title
    String href
    Json summary
    String status
    DateTime createdAt
    DateTime updatedAt
  }
  AgentAuthorityProfileVersion {
    String id
    String organizationId FK
    String profileKey
    Int version
    Json capabilityKeys
    Json policyDocument
    String policyHash
    DateTime createdAt
  }
  AgentAuthorizationEvent {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String toolId FK
    String actorType
    String actorId
    String action
    String decision
    String reasonCode
    String reason
    String resourceType
    String resourceId
    Json policySnapshot
    String requestedByUserId FK
    String decidedByUserId FK
    DateTime createdAt
  }
  AgentContextEpoch {
    String id PK
    String organizationId FK
    String sessionId FK
    Int epoch
    String boundaryAguiRunId
    String validatedHandoffRef
    DateTime createdAt
  }
  AgentConversation {
    String id PK
    String organizationId FK
    String title
    String status
    String createdByUserId FK
    String rootRequestId FK
    DateTime lastMessageAt
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  AgentConversationEvent {
    String id PK
    String organizationId FK
    String sessionId FK
    String executionId FK
    String externalEventId
    BigInt sequence
    String eventType
    Int schemaVersion
    Json payload
    DateTime createdAt
  }
  AgentConversationOutbox {
    String id PK
    String organizationId FK
    String eventId FK,UK
    Int attemptCount
    DateTime publishedAt
    DateTime createdAt
  }
  AgentCostEvent {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String provider
    String model
    String biller
    String billingType
    Int inputTokens
    Int outputTokens
    Int cachedInputTokens
    BigInt costMicros
    Json metadata
    DateTime occurredAt
    DateTime createdAt
  }
  AgentExecution {
    String id PK
    String organizationId FK
    String sessionId FK
    String sessionTaskId FK
    String copilotThreadId
    String aguiRunId
    String agentVersionId FK
    String runtimeType
    String modelIdentity
    String policySnapshotId FK
    String inputHash
    Json currentInput
    Json resourceRefs
    Int attempt
    String status
    DateTime startedAt
    DateTime finishedAt
    String errorCode
  }
  AgentExecutionAttempt {
    String id PK
    String organizationId FK
    String sessionId FK
    String executionId FK
    Int attemptNumber
    String idempotencyKey
    String runtimeType
    String externalRunId
    String encryptedHandleRef
    Int runtimeGeneration
    String state
    DateTime startedAt
    DateTime finishedAt
    String errorCode
    String errorMessage
  }
  AgentExecutionAttemptOperationBinding {
    String id PK
    String organizationId FK
    String executionAttemptId FK
    String executionId FK
    String sessionId FK
    String operationRunId FK
    String predecessorOperationRunId FK
    String continuationKey
    DateTime createdAt
  }
  AgentExecutionUsage {
    String id PK
    String organizationId FK
    String executionId FK
    String modelIdentity
    String provider
    Int inputTokens
    Int outputTokens
    BigInt costMicros
    String currency
    DateTime recordedAt
    String retentionClass
    String independentLegalBasisCode
    DateTime independentRetentionDueAt
  }
  AgentInstance {
    String id PK
    String organizationId FK
    String type
    String name
    String role
    String title
    String icon
    String reportsToId FK
    String lifecycleStatus
    String pauseReason
    DateTime pausedAt
    Int trustLevel
    String adapterType
    String modelOverride
    Json adapterConfig
    Json runtimeConfig
    String promptPathOverride
    DateTime createdAt
    DateTime updatedAt
  }
  AgentInstanceToolPolicy {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String toolId FK
    String effect
    String approvalMode
    String dryRunMode
    Json constraints
    DateTime createdAt
    DateTime updatedAt
  }
  AgentInteractionRetentionPolicy {
    String organizationId PK,FK
    Int sessionRetentionDays
    String residency
    String legalPolicyVersion
    String updatedByUserId FK
    DateTime updatedAt
  }
  AgentMessage {
    String id PK
    String organizationId FK
    String conversationId FK
    String role
    String content
    String agentInstanceId FK
    String requestId FK
    String runId FK
    Json metadata
    DateTime createdAt
  }
  AgentPolicySnapshot {
    String id PK
    String organizationId FK
    String sessionId FK
    String agentVersionId FK
    String authorityProfileVersionId FK
    Json capabilityKeys
    String policyHash
    DateTime createdAt
  }
  AgentRun {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String taskSessionId FK
    String retryOfRunId FK
    String status
    Int attempt
    String invocationSource
    String adapterType
    String model
    String provider
    String taskKey
    String sessionDisplayBefore
    String sessionDisplayAfter
    Json input
    Json output
    DateTime startedAt
    DateTime finishedAt
    DateTime heartbeatAt
    Int exitCode
    String signal
    String errorCode
    String errorMessage
    Json usageJson
    Json resultJson
    String logStore
    String logRef
    String logSha256
    BigInt logBytes
    Boolean logCompressed
    String stdoutExcerpt
    String stderrExcerpt
    Int lastEventSeq
    DateTime createdAt
    DateTime updatedAt
  }
  AgentRunEvent {
    String id PK
    String organizationId FK
    String runId FK
    String agentInstanceId FK
    Int seq
    String type
    String level
    String stream
    String message
    Json data
    String logRef
    DateTime createdAt
  }
  AgentRunRequest {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String taskSessionId FK
    String source
    String triggerDetail
    String reason
    String idempotencyKey
    Int priority
    String sourceWorkflowRunId FK
    String sourceWorkflowNodeId
    String sourceResourceType
    String sourceResourceId
    String requestedByUserId FK
    String requestedByActorType
    String requestedByActorId
    String conversationId FK
    String initiatedByMessageId FK
    String parentRequestId FK
    String delegatedByRunId FK
    String playbookKey
    String planStepKey
    String displayName
    String statusReason
    Json dependencyKeys
    Json payload
    String status
    DateTime scheduledFor
    DateTime claimedAt
    String claimedBy
    Int attempts
    Int maxAttempts
    DateTime finishedAt
    String coalescedIntoRequestId FK
    String lastErrorCode
    String lastErrorMessage
    DateTime createdAt
    DateTime updatedAt
  }
  AgentRuntimeState {
    String id PK
    String organizationId FK
    String agentInstanceId FK,UK
    String lastRunId FK
    String lastRunStatus
    String lastError
    DateTime lastHeartbeatAt
    Int consecutiveFailureCount
    Int totalRuns
    Int totalInputTokens
    Int totalOutputTokens
    BigInt totalCostMicros
    Json stateJson
    DateTime createdAt
    DateTime updatedAt
  }
  AgentSession {
    String id PK
    String organizationId FK
    String createdByUserId FK
    String copilotThreadId
    String primaryAgentVersionId FK
    String authorityProfileVersionId FK
    Int contextEpoch
    String title
    BigInt lastEventSequence
    String lifecycle
    DateTime completedAt
    DateTime cancelledAt
    DateTime archivedAt
    DateTime legalHoldAt
    String legalHoldReason
    DateTime retentionDueAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentSessionApproval {
    String id PK
    String organizationId FK
    String sessionId FK
    String taskId FK
    String executionId FK
    String attemptId FK
    String operationBindingId FK
    String predecessorOperationRunId FK
    String capabilityKey
    String argumentsHash
    Json resourceSnapshot
    String state
    DateTime expiresAt
    String idempotencyKey
    String decisionIdempotencyKey
    String decidedByActorType
    String decidedByActorId
    DateTime requestedAt
    DateTime decidedAt
  }
  AgentSessionApprovalContinuation {
    String id PK
    String organizationId FK
    String approvalId FK
    String successorOperationRunId FK
    String state
    DateTime interruptDeliveredAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentSessionArtifact {
    String id PK
    String organizationId FK
    String sessionId FK
    String taskId FK
    String executionId FK
    String artifactType
    String storageReference
    String sha256
    Json metadata
    String lifecycle
    String idempotencyKey
    DateTime createdAt
    DateTime supersededAt
    String retentionClass
    String independentLegalBasisCode
    DateTime independentRetentionDueAt
  }
  AgentSessionLegalAuditProjection {
    String id PK
    String organizationId FK
    String recordKind
    String legalBasisCode
    DateTime retentionDueAt
    String artifactSha256
    Int inputTokens
    Int outputTokens
    BigInt costMicros
    Int recordCount
    DateTime createdAt
  }
  AgentSessionLifecycleRequest {
    String id PK
    String organizationId FK
    String sessionId FK
    String command
    String reason
    String idempotencyKey
    String status
    String requestedByUserId FK
    DateTime deletionDueAt
    String errorCode
    DateTime createdAt
    DateTime finishedAt
  }
  AgentSessionTask {
    String id PK
    String organizationId FK
    String sessionId FK,UK
    String parentTaskId FK
    String assignedAgentVersionId FK
    String objective
    Boolean isRoot
    String status
    String idempotencyKey
    DateTime createdAt
    DateTime updatedAt
    DateTime finishedAt
  }
  AgentSessionTaskDelegation {
    String id PK
    String organizationId FK
    String sessionId FK
    String parentTaskId FK
    String childTaskId FK
    String fromAgentVersionId FK
    String toAgentVersionId FK
    String authorityProfileVersionId FK
    Json authoritySubset
    Int depth
    String idempotencyKey
    String state
    DateTime createdAt
    DateTime finishedAt
  }
  AgentSessionTombstone {
    String id PK
    String organizationIdHash
    String copilotThreadIdHash UK
    String idempotencyKeyHash UK
    String requestFingerprintHash
    String hashKeyVersion
    String terminalLifecycle
    String deletionReasonCode
    DateTime deletedAt
    String legalPolicyVersion
  }
  AgentTaskSession {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String adapterType
    String taskKey
    String title
    Json metadata
    Json sessionParams
    String sessionDisplay
    String lastRunId FK
    String lastError
    DateTime createdAt
    DateTime updatedAt
  }
  AgentToolDefinition {
    String id PK
    String key UK
    String name
    String description
    String riskLevel
    String credentialKind
    Json inputSchemaJson
    Json outputSchemaJson
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  AgentToolInvocation {
    String id PK
    String organizationId FK
    String conversationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String approvalRequestId FK
    String capabilityKey
    String status
    String policyDecision
    String reasonCode
    String resourceType
    String resourceId
    String idempotencyKey
    Json inputSummary
    Json outputSummary
    String errorCode
    String errorMessage
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentVersion {
    String id PK
    String agentDefinitionKey UK
    Int version
    String displayName
    String description
    String runtimeType
    String modelIdentity
    Json capabilityKeys
    Json policyDocument
    String manifestHash
    Json runtimeManifest
    DateTime activatedAt
    DateTime retiredAt
    DateTime createdAt
  }
  WorkflowRun {
    String id PK
    String organizationId
    String templateId FK
    String status
    String triggeredBy
    String triggeredByUserId FK
    Json contextData
    Json steps
    String error
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  WorkflowTemplate {
    String id PK
    String organizationId FK
    String name
    String description
    String module
    Boolean isActive
    String triggerType
    String schedule
    Json nodesJson
    Json edgesJson
    Int version
    DateTime createdAt
    DateTime updatedAt
    String marketplaceId FK
  }
  AgentApprovalRequest o|--o{ AgentToolInvocation : "approvalRequest"
  AgentAuthorityProfileVersion ||--o{ AgentPolicySnapshot : "authorityProfileVersion"
  AgentAuthorityProfileVersion ||--o{ AgentSession : "authorityProfileVersion"
  AgentAuthorityProfileVersion ||--o{ AgentSessionTaskDelegation : "authorityProfileVersion"
  AgentConversation o|--o{ AgentArtifact : "conversation"
  AgentConversation ||--o{ AgentMessage : "conversation"
  AgentConversation o|--o{ AgentRunRequest : "conversation"
  AgentConversation o|--o{ AgentToolInvocation : "conversation"
  AgentConversationEvent ||--|| AgentConversationOutbox : "event"
  AgentExecution o|--o{ AgentConversationEvent : "execution"
  AgentExecution ||--o{ AgentExecutionAttempt : "execution"
  AgentExecution ||--o{ AgentExecutionUsage : "execution"
  AgentExecution ||--o{ AgentSessionApproval : "execution"
  AgentExecution ||--o{ AgentSessionArtifact : "execution"
  AgentExecutionAttempt ||--o{ AgentExecutionAttemptOperationBinding : "attempt"
  AgentExecutionAttempt ||--o{ AgentSessionApproval : "attempt"
  AgentExecutionAttemptOperationBinding ||--o{ AgentSessionApproval : "operationBinding"
  AgentInstance ||--o{ AgentApprovalRequest : "agentInstance"
  AgentInstance o|--o{ AgentArtifact : "agentInstance"
  AgentInstance ||--o{ AgentAuthorizationEvent : "agentInstance"
  AgentInstance ||--o{ AgentCostEvent : "agentInstance"
  AgentInstance o|--o{ AgentInstance : "parent"
  AgentInstance ||--o{ AgentInstanceToolPolicy : "agentInstance"
  AgentInstance o|--o{ AgentMessage : "agentInstance"
  AgentInstance ||--o{ AgentRun : "agentInstance"
  AgentInstance ||--o{ AgentRunEvent : "agentInstance"
  AgentInstance ||--o{ AgentRunRequest : "agentInstance"
  AgentInstance ||--|| AgentRuntimeState : "agentInstance"
  AgentInstance ||--o{ AgentTaskSession : "agentInstance"
  AgentInstance ||--o{ AgentToolInvocation : "agentInstance"
  AgentMessage o|--o{ AgentRunRequest : "initiatedByMessage"
  AgentPolicySnapshot ||--o{ AgentExecution : "policySnapshot"
  AgentRun o|--o{ AgentApprovalRequest : "run"
  AgentRun o|--o{ AgentArtifact : "run"
  AgentRun o|--o{ AgentAuthorizationEvent : "run"
  AgentRun ||--o{ AgentCostEvent : "run"
  AgentRun o|--o{ AgentMessage : "run"
  AgentRun o|--o{ AgentRun : "retryOfRun"
  AgentRun ||--o{ AgentRunEvent : "run"
  AgentRun o|--o{ AgentRunRequest : "delegatedByRun"
  AgentRun o|--o{ AgentRuntimeState : "lastRun"
  AgentRun o|--o{ AgentTaskSession : "lastRun"
  AgentRun o|--o{ AgentToolInvocation : "run"
  AgentRunRequest ||--o{ AgentApprovalRequest : "request"
  AgentRunRequest o|--o{ AgentArtifact : "request"
  AgentRunRequest o|--o{ AgentAuthorizationEvent : "request"
  AgentRunRequest o|--o{ AgentConversation : "rootRequest"
  AgentRunRequest ||--o{ AgentCostEvent : "request"
  AgentRunRequest o|--o{ AgentMessage : "request"
  AgentRunRequest ||--o{ AgentRun : "request"
  AgentRunRequest o|--o{ AgentRunRequest : "coalescedIntoRequest"
  AgentRunRequest o|--o{ AgentRunRequest : "parentRequest"
  AgentRunRequest o|--o{ AgentToolInvocation : "request"
  AgentSession ||--o{ AgentContextEpoch : "session"
  AgentSession ||--o{ AgentConversationEvent : "session"
  AgentSession ||--o{ AgentExecution : "session"
  AgentSession ||--o{ AgentPolicySnapshot : "session"
  AgentSession ||--o{ AgentSessionApproval : "session"
  AgentSession ||--o{ AgentSessionArtifact : "session"
  AgentSession ||--o{ AgentSessionLifecycleRequest : "session"
  AgentSession ||--o{ AgentSessionTask : "session"
  AgentSession ||--o{ AgentSessionTaskDelegation : "session"
  AgentSessionApproval ||--|| AgentSessionApprovalContinuation : "approval"
  AgentSessionTask ||--o{ AgentExecution : "sessionTask"
  AgentSessionTask ||--o{ AgentSessionApproval : "task"
  AgentSessionTask ||--o{ AgentSessionArtifact : "task"
  AgentSessionTask o|--o{ AgentSessionTask : "parent"
  AgentSessionTask ||--|| AgentSessionTaskDelegation : "childTask"
  AgentSessionTask ||--o{ AgentSessionTaskDelegation : "parentTask"
  AgentTaskSession ||--o{ AgentRun : "taskSession"
  AgentTaskSession ||--o{ AgentRunRequest : "taskSession"
  AgentToolDefinition o|--o{ AgentAuthorizationEvent : "tool"
  AgentToolDefinition ||--o{ AgentInstanceToolPolicy : "tool"
  AgentToolInvocation o|--o{ AgentArtifact : "toolInvocation"
  AgentVersion ||--o{ AgentExecution : "agentVersion"
  AgentVersion ||--o{ AgentPolicySnapshot : "agentVersion"
  AgentVersion ||--o{ AgentSession : "primaryAgentVersion"
  AgentVersion ||--o{ AgentSessionTask : "assignedAgentVersion"
  AgentVersion ||--o{ AgentSessionTaskDelegation : "fromAgentVersion"
  AgentVersion ||--o{ AgentSessionTaskDelegation : "toAgentVersion"
  WorkflowRun o|--o{ AgentRunRequest : "sourceWorkflowRun"
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| AgentApprovalRequest | approver | references external | Core | User |
| AgentApprovalRequest | decidedBy | references external | Core | User |
| AgentApprovalRequest | organization | references external | Core | Organization |
| AgentApprovalRequest | requestedBy | references external | Core | User |
| AgentArtifact | organization | references external | Core | Organization |
| AgentAuthorityProfileVersion | organization | references external | Core | Organization |
| AgentAuthorizationEvent | decidedBy | references external | Core | User |
| AgentAuthorizationEvent | organization | references external | Core | Organization |
| AgentAuthorizationEvent | requestedBy | references external | Core | User |
| AgentConversation | createdBy | references external | Core | User |
| AgentConversation | organization | references external | Core | Organization |
| AgentCostEvent | organization | references external | Core | Organization |
| AgentExecution | organization | references external | Core | Organization |
| AgentExecutionAttemptOperationBinding | operationRun | references external | System | OperationRun |
| AgentExecutionAttemptOperationBinding | predecessorOperationRun | references external | System | OperationRun |
| AgentExecutionUsage | organization | references external | Core | Organization |
| AgentInstance | agentInstance | referenced by external | Core | User |
| AgentInstance | organization | references external | Core | Organization |
| AgentInstanceToolPolicy | organization | references external | Core | Organization |
| AgentInteractionRetentionPolicy | organization | references external | Core | Organization |
| AgentInteractionRetentionPolicy | updatedBy | references external | Core | User |
| AgentMessage | organization | references external | Core | Organization |
| AgentPolicySnapshot | organization | references external | Core | Organization |
| AgentRun | organization | references external | Core | Organization |
| AgentRunEvent | organization | references external | Core | Organization |
| AgentRunRequest | organization | references external | Core | Organization |
| AgentRunRequest | requestedBy | references external | Core | User |
| AgentRuntimeState | organization | references external | Core | Organization |
| AgentSession | creator | references external | Core | User |
| AgentSession | organization | references external | Core | Organization |
| AgentSessionApproval | predecessorOperationRun | references external | System | OperationRun |
| AgentSessionApprovalContinuation | successorOperationRun | references external | System | OperationRun |
| AgentSessionLegalAuditProjection | organization | references external | Core | Organization |
| AgentSessionLifecycleRequest | organization | references external | Core | Organization |
| AgentSessionLifecycleRequest | requestedBy | references external | Core | User |
| AgentTaskSession | organization | references external | Core | Organization |
| AgentToolInvocation | organization | references external | Core | Organization |
| WorkflowRun | triggeredByUser | references external | Core | User |
| WorkflowTemplate | marketplace | references external | System | Marketplace |
| WorkflowTemplate | organization | references external | Core | Organization |
