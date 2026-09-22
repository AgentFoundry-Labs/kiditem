# Products ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` after Prisma schema changes.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| MasterProduct | `master_products` | Organization-owned canonical inventory product and sole official product ABC identity. |
| MasterProductAbcEvaluation | `master_product_abc_evaluations` | Current Products-owned normal absolute ABC evaluation for one MasterProduct. |
| MasterProductAbcFormulaState | `master_product_abc_formula_states` | One organization-owned formula and official publication envelope. |
| MasterProductAbcFormulaVersion | `master_product_abc_formula_versions` | Immutable organization-owned formula versions for absolute product ABC publication. |
| MasterProductAbcGradeHistory | `master_product_abc_grade_histories` | Immutable absolute ABC grade transitions after the initial baseline. |
| SellpiaInventoryState | `sellpia_inventory_states` | Organization-scoped Sellpia source binding, completion state, generation fence, and active collection lease. |

## Mermaid ER Diagram

```mermaid
erDiagram
  MasterProduct {
    String id PK
    String organizationId FK
    String code UK
    String sourceAccountKey
    String sourceProductCode
    String sourceOptionCode
    String name
    String optionName
    String barcode
    Int currentStock
    Int purchasePrice
    StringArray imageUrls
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcEvaluation {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String abcGrade
    Decimal weightedRevenue
    Decimal weightedOrderTimeSupplyCost
    Decimal weightedAdvertisingSpend
    Decimal weightedOperatingProfit
    Decimal operatingProfitVelocity30
    Decimal operatingMargin
    Decimal lossPersistence
    Decimal profitScore
    Decimal marginScore
    Decimal consistencyScore
    Decimal economicScore
    Int validObservationDays
    Int formulaRevision
    Int publicationRevision
    DateTime gradeBasisCutoffDate
    DateTime saleStartDate
    String sellpiaSourceImportRunId FK
    String advertisingSourceImportRunId FK
    BigInt sellpiaGeneration
    BigInt advertisingGeneration
    BigInt mappingGeneration
    DateTime calculatedAt
  }
  MasterProductAbcFormulaState {
    String organizationId PK,FK
    String activeFormulaVersionId FK
    Int formulaRevision
    Int publicationRevision
    DateTime officialCutoffDate
    String publishedSellpiaSourceImportRunId FK
    String publishedAdvertisingSourceImportRunId FK
    BigInt publishedMappingGeneration
    BigInt mappingGeneration
    DateTime publishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcFormulaVersion {
    String id PK
    String organizationId FK
    String formulaKey
    Int version
    Json formulaJson
    String formulaChecksum
    DateTime createdAt
  }
  MasterProductAbcGradeHistory {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String oldGrade
    String newGrade
    Decimal economicScore
    Decimal weightedOperatingProfit
    Decimal operatingMargin
    String previousSellpiaSourceImportRunId FK
    String nextSellpiaSourceImportRunId FK
    String previousAdvertisingSourceImportRunId FK
    String nextAdvertisingSourceImportRunId FK
    Int formulaRevision
    Int publicationRevision
    DateTime sourceCutoffDate
    String reason
    DateTime calculatedAt
  }
  SellpiaInventoryState {
    String organizationId PK,FK
    String sourceOrigin
    String sourceAccountKey
    DateTime lastVerifiedAt
    String lastCompletedImportRunId FK
    String refreshReason
    String requestedSyncScope
    String activeSyncToken
    String activeSyncOwnerUserId FK
    DateTime activeSyncStartedAt
    DateTime activeSyncLeaseExpiresAt
    String activeSyncScope
    BigInt requestedGeneration
    BigInt activeGeneration
    BigInt verifiedGeneration
    BigInt failedGeneration
    DateTime lastAttemptAt
    String lastAttemptSyncScope
    String lastErrorCode
    String lastErrorMessage
    String freshnessFence
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProduct ||--|| MasterProductAbcEvaluation : "masterProduct"
  MasterProduct ||--o{ MasterProductAbcGradeHistory : "masterProduct"
  MasterProductAbcFormulaVersion ||--o{ MasterProductAbcEvaluation : "formulaVersion"
  MasterProductAbcFormulaVersion o|--o| MasterProductAbcFormulaState : "activeFormulaVersion"
  MasterProductAbcFormulaVersion ||--o{ MasterProductAbcGradeHistory : "formulaVersion"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| MasterProduct | organization | references external | Core | Organization |
| MasterProductAbcEvaluation | advertisingSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcEvaluation | organization | references external | Core | Organization |
| MasterProductAbcEvaluation | sellpiaSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcFormulaState | organization | references external | Core | Organization |
| MasterProductAbcFormulaState | publishedAdvertisingSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcFormulaState | publishedSellpiaSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcFormulaVersion | organization | references external | Core | Organization |
| MasterProductAbcGradeHistory | nextAdvertisingSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcGradeHistory | nextSellpiaSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcGradeHistory | organization | references external | Core | Organization |
| MasterProductAbcGradeHistory | previousAdvertisingSourceImportRun | references external | Core | SourceImportRun |
| MasterProductAbcGradeHistory | previousSellpiaSourceImportRun | references external | Core | SourceImportRun |
| SellpiaInventoryState | activeSyncOwner | references external | Core | User |
| SellpiaInventoryState | lastCompletedImportRun | references external | Core | SourceImportRun |
| SellpiaInventoryState | organization | references external | Core | Organization |
