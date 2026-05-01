# Agents ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| AgentDefinition | `agent_definitions` | 에이전트 정의. rt_* 필드로 런타임 상태 내장 (별도 테이블 없음). reportsTo 자기참조 (매니저→전문가 계층). |
| AgentEvent | `agent_events` | eventType 으로 permission_denied / action_snapshot 통합. |
| AgentLog | `agent_logs` | - |
| AgentTask | `agent_tasks` | - |
| AgentWakeupRequest | `agent_wakeup_requests` | - |
| HeartbeatRun | `heartbeat_runs` | 에이전트 안전 파이프라인 (Budget/Cap/DryRun). AgentDefinition 과 함께 agent runtime state 구성. |
| WorkflowRun | `workflow_runs` | steps Json 으로 단계별 결과 흡수 (별도 StepRun 없음). |
| WorkflowTemplate | `workflow_templates` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  AgentDefinition {
    String id PK
    String organizationId FK
    String name
    String type UK
    String description
    String adapterType
    Json adapterConfig
    Json runtimeConfig
    String role
    String title
    String icon
    String reportsTo FK
    String status
    String pauseReason
    DateTime pausedAt
    Json permissions
    StringArray skills
    StringArray deniedSkills
    Json actionCap
    Int trustLevel
    String promptTemplate
    String allowedTools
    String permissionMode
    StringArray fallbackChain
    Int monthlyTokenBudget
    Int tokensUsed
    DateTime budgetResetAt
    String schedule
    Int timeoutSeconds
    Int maxOutputTokens
    Boolean requiresApproval
    Boolean isActive
    Int resultRetentionDays
    String contextStrategy
    DateTime lastHeartbeatAt
    Json metadata
    String rtSessionId
    Json rtStateJson
    String rtLastRunId
    String rtLastRunStatus
    Int rtTotalInputTokens
    Int rtTotalOutputTokens
    Int rtTotalCostCents
    String rtLastError
    Int rtConsecutiveFailCount
    DateTime rtLastFailedAt
    DateTime createdAt
    DateTime updatedAt
    String marketplaceId FK
  }
  AgentEvent {
    String id PK
    String organizationId FK
    String agentId FK
    String runId
    String eventType
    String category
    String detail
    String action
    String tableName
    String recordId
    String fieldName
    Json valueBefore
    Json valueAfter
    DateTime restoredAt
    DateTime createdAt
  }
  AgentLog {
    String id PK
    String taskId FK
    String level
    String message
    Json data
    DateTime createdAt
  }
  AgentTask {
    String id PK
    String organizationId
    String agentType
    String status
    Int priority
    String workflowRunId
    String workflowNodeId
    String sourceDataId
    Json input
    Json output
    String error
    DateTime scheduledAt
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentWakeupRequest {
    String id PK
    String organizationId FK
    String agentId FK
    String source
    String triggerDetail
    String reason
    Json payload
    String status
    Int coalescedCount
    String requestedByType
    String requestedById
    String runId
    DateTime requestedAt
    DateTime claimedAt
    DateTime finishedAt
    String error
    DateTime createdAt
    DateTime updatedAt
  }
  HeartbeatRun {
    String id PK
    String organizationId FK
    String agentId FK
    String invocationSource
    String triggerDetail
    String status
    String failureType
    DateTime startedAt
    DateTime finishedAt
    String error
    Int exitCode
    String signal
    Json usageJson
    Json resultJson
    String sessionIdBefore
    String sessionIdAfter
    String stdoutExcerpt
    String stderrExcerpt
    String errorCode
    Int processPid
    String wakeupRequestId FK
    String nextSchedule
    Boolean isSummarized
    String summary
    String triggeredByUserId FK
    DateTime createdAt
    DateTime updatedAt
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
  AgentDefinition o|--o{ AgentDefinition : "parent"
  AgentDefinition ||--o{ AgentEvent : "agent"
  AgentDefinition ||--o{ AgentWakeupRequest : "agent"
  AgentDefinition ||--o{ HeartbeatRun : "agent"
  AgentTask ||--o{ AgentLog : "task"
  AgentWakeupRequest o|--o{ HeartbeatRun : "wakeupRequest"
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| AgentDefinition | agentDefinition | referenced by external | Core | User |
| AgentDefinition | marketplace | references external | System | Marketplace |
| AgentDefinition | organization | references external | Core | Organization |
| AgentEvent | organization | references external | Core | Organization |
| AgentWakeupRequest | organization | references external | Core | Organization |
| HeartbeatRun | organization | references external | Core | Organization |
| HeartbeatRun | triggeredByUser | references external | Core | User |
| WorkflowRun | triggeredByUser | references external | Core | User |
| WorkflowTemplate | marketplace | references external | System | Marketplace |
| WorkflowTemplate | organization | references external | Core | Organization |
