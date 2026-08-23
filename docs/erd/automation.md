# Automation ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` after Prisma schema changes.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| WorkflowRun | `workflow_runs` | Durable deterministic workflow run. |
| WorkflowTemplate | `workflow_templates` | Deterministic workflow definition. |

## Mermaid ER Diagram

```mermaid
erDiagram
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
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| WorkflowRun | triggeredByUser | references external | Core | User |
| WorkflowTemplate | marketplace | references external | System | Marketplace |
| WorkflowTemplate | organization | references external | Core | Organization |
