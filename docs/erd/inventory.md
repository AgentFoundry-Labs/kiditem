# Inventory ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| PickingItem | `picking_items` | - |
| PickingList | `picking_lists` | - |
| ReturnTransfer | `return_transfers` | - |
| SellpiaInventoryState | `sellpia_inventory_states` | Organization-scoped Sellpia inventory trust state, source binding, generation fence, and active collection lease. |
| SellpiaReceiptUploadBatch | `sellpia_receipt_upload_batches` | Record of an operator-confirmed receipt file upload to Sellpia. |
| StockAudit | `stock_audits` | - |
| StockTransfer | `stock_transfers` | Warehouse-to-warehouse movement record. It never mutates MasterProduct.currentStock. |
| Warehouse | `warehouses` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  PickingItem {
    String id PK
    String organizationId FK
    String pickingListId FK
    String orderId
    String masterProductId FK
    String productName
    String sku
    Int quantity
    String location
    Boolean isPicked
    Boolean isVerified
    DateTime pickedAt
    DateTime verifiedAt
    DateTime createdAt
  }
  PickingList {
    String id PK
    String organizationId FK
    String listNumber
    String status
    Int totalItems
    Int pickedItems
    String assignedTo
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ReturnTransfer {
    String id PK
    String organizationId FK
    String rtNumber
    String orderId
    String masterProductId FK
    String optionName
    Int quantity
    String status
    String condition
    Int restockedQty
    Int disposedQty
    String notes
    String processedBy
    DateTime createdAt
    DateTime completedAt
    DateTime updatedAt
  }
  SellpiaInventoryState {
    String organizationId PK,FK
    String sourceOrigin
    String sourceAccountKey
    DateTime lastVerifiedAt
    String lastCompletedImportRunId FK
    DateTime refreshRequestedAt
    String refreshReason
    DateTime syncNotBefore
    String activeSyncToken
    String activeSyncOwnerUserId FK
    DateTime activeSyncStartedAt
    DateTime activeSyncLeaseExpiresAt
    BigInt requestedGeneration
    BigInt activeGeneration
    BigInt verifiedGeneration
    BigInt failedGeneration
    DateTime lastAttemptAt
    String lastAttemptStatus
    String lastErrorCode
    String lastErrorMessage
    String freshnessFence
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaReceiptUploadBatch {
    String id PK
    String organizationId FK
    String status
    String sourceType
    String sourceRef
    String templateVersion
    String uploadedBy
    DateTime uploadedAt
    String note
    Json metaJson
    String createdBy
    DateTime createdAt
    DateTime updatedAt
  }
  StockAudit {
    String id PK
    String organizationId FK
    String auditNumber
    String status
    Int totalProducts
    Int matchedCount
    Int diffCount
    String auditedBy
    DateTime completedAt
    String notes
    Json items
    DateTime createdAt
  }
  StockTransfer {
    String id PK
    String organizationId FK
    String masterProductId FK
    String optionName
    String fromWarehouseId FK
    String toWarehouseId FK
    Int quantity
    String status
    String requestedBy
    DateTime completedAt
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
  Warehouse {
    String id PK
    String organizationId FK
    String name
    String code
    String address
    String manager
    String phone
    Boolean isDefault
    String status
    DateTime createdAt
    DateTime updatedAt
  }
  PickingList ||--o{ PickingItem : "pickingList"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| PickingItem | masterProduct | references external | Core | MasterProduct |
| PickingItem | organization | references external | Core | Organization |
| PickingList | organization | references external | Core | Organization |
| ReturnTransfer | masterProduct | references external | Core | MasterProduct |
| ReturnTransfer | organization | references external | Core | Organization |
| SellpiaInventoryState | activeSyncOwner | references external | Core | User |
| SellpiaInventoryState | lastCompletedImportRun | references external | Core | SourceImportRun |
| SellpiaInventoryState | organization | references external | Core | Organization |
| SellpiaReceiptUploadBatch | organization | references external | Core | Organization |
| StockAudit | organization | references external | Core | Organization |
| StockTransfer | masterProduct | references external | Core | MasterProduct |
| StockTransfer | organization | references external | Core | Organization |
| Warehouse | organization | references external | Core | Organization |
| Warehouse | warehouse | referenced by external | Orders | Shipment |
