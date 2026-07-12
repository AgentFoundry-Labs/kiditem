# Finance ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| GradeHistory | `grade_histories` | ABC 등급 변경 추적. |
| ManualLedger | `manual_ledgers` | 자동 집계 외 수기 수입/지출. |
| ProcessingCost | `processing_costs` | - |
| ProfitLoss | `profit_loss` | 월간 손익. organizationId+listingId+year+month unique. |
| SalesPlan | `sales_plans` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  GradeHistory {
    String id PK
    String organizationId FK
    String masterId FK
    String listingId FK
    String oldGrade
    String newGrade
    Decimal score
    Decimal revenueScore
    Decimal marginScore
    Decimal velocityScore
    String reason
    DateTime calculatedAt
  }
  ManualLedger {
    String id PK
    String organizationId FK
    DateTime date
    String type
    String category
    String counterpart
    String description
    Int amount
    Int tax
    String memo
    String createdBy
    DateTime createdAt
  }
  ProcessingCost {
    String id PK
    String organizationId FK
    String masterId FK
    String productName
    String vendor
    String processType
    Int unitCost
    Int quantity
    Int totalCost
    DateTime date
    String status
    String notes
    DateTime createdAt
  }
  ProfitLoss {
    String id PK
    String organizationId FK
    String listingId FK
    Int year
    Int month
    Int revenue
    Int cogs
    Int commission
    Int shippingCost
    Int adCost
    Int otherCost
    Int netProfit
    Decimal profitRate
    Int orderCount
    Int returnCount
    DateTime createdAt
    DateTime updatedAt
  }
  SalesPlan {
    String id PK
    String organizationId FK
    String period
    Int targetRevenue
    Int targetOrders
    Int targetProfit
    Int actualRevenue
    Int actualOrders
    Int actualProfit
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| GradeHistory | listing | references external | Core | ChannelListing |
| GradeHistory | master | references external | Core | MasterProduct |
| GradeHistory | organization | references external | Core | Organization |
| ManualLedger | organization | references external | Core | Organization |
| ProcessingCost | master | references external | Core | MasterProduct |
| ProcessingCost | organization | references external | Core | Organization |
| ProfitLoss | listing | references external | Core | ChannelListing |
| ProfitLoss | organization | references external | Core | Organization |
| SalesPlan | organization | references external | Core | Organization |
