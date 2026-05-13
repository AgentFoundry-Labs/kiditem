# System ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| ActionTask | `action_tasks` | 액션 보드 (수동 할일 관리). |
| ActivityEvent | `activity_events` | - |
| Alert | `alerts` | - |
| BusinessRule | `business_rules` | 온톨로지 룰 엔진 (조건→액션 자동화). |
| DataMigrationRun | `data_migration_runs` | 운영 data migration ledger. Schema-only db push와 별도로 영속 데이터 보정 실행 여부를 기록한다. |
| FeatureGate | `feature_gates` | 피처 플래그. allowedOrganizations: string[] 로 회사별 enable. |
| Marketplace | `marketplace` | type 으로 agent/workflow 카탈로그 통합. |
| MigrationCheckpoint | `migration_checkpoints` | 이관 스크립트 체크포인트 (Plan C 용). 이관 완료 후 drop 가능. |
| SystemSetting | `system_settings` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  ActionTask {
    String id PK
    String organizationId FK
    String taskKey
    String type
    String label
    String detail
    String where
    String href
    String priority
    String status
    String role
    Json apiCall
    Json result
    Json notes
    Json activityLog
    DateTime date
    String assigneeUserId FK
    String targetType
    String targetId
    DateTime createdAt
    DateTime updatedAt
  }
  ActivityEvent {
    String id PK
    String organizationId FK
    String objectType
    String objectId
    String eventType
    String source
    String title
    Json data
    DateTime createdAt
  }
  Alert {
    String id PK
    String organizationId FK
    String targetType
    String targetId
    String kind
    String status
    String type
    String severity
    String title
    String message
    Boolean isRead
    DateTime readAt
    String operationKey
    String sourceType
    String sourceId
    String actorUserId FK
    String href
    Float progress
    Json metadata
    String actionTaskId FK
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  BusinessRule {
    String id PK
    String organizationId FK
    String name
    String displayName
    String description
    String category
    String severity
    String field
    String operator
    Json threshold
    String messageTemplate
    String actionType
    Json conditions
    Boolean autoExecute
    Boolean active
    Int sortOrder
    DateTime createdAt
    DateTime updatedAt
  }
  DataMigrationRun {
    String migrationId PK
    String releaseVersion
    String name
    String status
    String gitSha
    String prismaSchemaHash
    Int affectedRows
    Json details
    String error
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  FeatureGate {
    String id PK
    String name UK
    String description
    Boolean enabled
    StringArray allowedOrganizations
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  Marketplace {
    String id PK
    String type
    String name
    String description
    String category
    String icon
    String module
    Json nodesJson
    Json edgesJson
    String role
    String adapterType
    String promptTemplate
    StringArray skills
    Json permissions
    Json configurableParams
    Int version
    Int installCount
    Boolean isPublished
    DateTime createdAt
    DateTime updatedAt
  }
  MigrationCheckpoint {
    String id PK
    String scriptName
    String stepName
    String entityKey
    String status
    String error
    Json payload
    DateTime createdAt
    DateTime updatedAt
  }
  SystemSetting {
    String id PK
    String organizationId FK
    String key
    Json value
    DateTime createdAt
    DateTime updatedAt
  }
  ActionTask o|--o{ Alert : "actionTask"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| ActionTask | assigneeUser | references external | Core | User |
| ActionTask | organization | references external | Core | Organization |
| ActivityEvent | organization | references external | Core | Organization |
| Alert | actorUser | references external | Core | User |
| Alert | organization | references external | Core | Organization |
| BusinessRule | organization | references external | Core | Organization |
| Marketplace | marketplace | referenced by external | AgentOS | WorkflowTemplate |
| SystemSetting | organization | references external | Core | Organization |
