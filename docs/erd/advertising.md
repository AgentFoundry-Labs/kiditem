# Advertising ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| AdAction | `ad_actions` | 광고 자동 실행 큐. ChannelAdTargetDailySnapshot→AdAction→ExecutionTask→ExecutionLog 파이프라인. |
| ExecutionLog | `execution_logs` | - |
| ExecutionTask | `execution_tasks` | - |
| ExecutionWorker | `execution_workers` | - |
| ScrapeTarget | `scrape_targets` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  AdAction {
    String id PK
    String companyId FK
    String listingId FK
    String adTargetDailyId FK
    String actionType
    String targetType
    String externalId
    String targetLabel
    String reason
    String priority
    Int currentValue
    Int proposedValue
    Json payload
    String approvalStatus
    String executeStatus
    Json beforeJson
    Json afterJson
    String errorMessage
    DateTime approvedAt
    DateTime executedAt
    DateTime createdAt
  }
  ExecutionLog {
    String id PK
    String taskId FK
    String level
    String step
    String message
    Json payloadJson
    DateTime createdAt
  }
  ExecutionTask {
    String id PK
    String actionId FK
    String workerId FK
    String status
    DateTime leasedAt
    DateTime startedAt
    DateTime finishedAt
    Int attempt
    Json beforeJson
    Json afterJson
    String errorMessage
    String screenshotPath
    DateTime createdAt
  }
  ExecutionWorker {
    String id PK
    String companyId FK
    String workerKey UK
    String label
    String status
    String currentTaskRef
    String currentUrl
    String currentPageType
    Json metaJson
    DateTime lastHeartbeatAt
    DateTime createdAt
  }
  ScrapeTarget {
    String id PK
    String companyId FK
    String url
    String label
    String category
    Boolean isActive
    DateTime lastScrapedAt
    DateTime createdAt
  }
  AdAction ||--o{ ExecutionTask : "action"
  ExecutionTask ||--o{ ExecutionLog : "task"
  ExecutionWorker o|--o{ ExecutionTask : "worker"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| AdAction | adTargetDaily | references external | Channels | ChannelAdTargetDailySnapshot |
| AdAction | company | references external | Core | Company |
| AdAction | listing | references external | Core | ChannelListing |
| ExecutionWorker | company | references external | Core | Company |
| ScrapeTarget | company | references external | Core | Company |
