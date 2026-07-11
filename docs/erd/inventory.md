# Inventory ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| Inventory | `inventory` | ProductOption 에 1:1. Bundle option 은 inventory 미생성 (availableStock 계산값 사용). |
| InventorySku | `inventory_skus` | Sellpia 상품코드 한 행에 대응하는 물리 재고 SKU. reportedStock 은 완료된 Sellpia 전체 스냅샷만 교체한다. |
| PickingItem | `picking_items` | - |
| PickingList | `picking_lists` | - |
| ReturnTransfer | `return_transfers` | - |
| RocketInventoryLedger | `rocket_inventory_ledger` | Coupang Rocket stock event ledger. Sellpia never contains these effects. |
| SellpiaNewProductCandidate | `sellpia_new_product_candidates` | Unmatched Sellpia row that must be explicitly created, linked, ignored, or rejected. |
| SellpiaReceiptUploadBatch | `sellpia_receipt_upload_batches` | KidItem receipt batch that still needs Sellpia upload confirmation. |
| SellpiaStockSnapshot | `sellpia_stock_snapshots` | Sellpia stock export import attempt. Imports are row-scoped; absent products are ignored. |
| SellpiaStockSnapshotItem | `sellpia_stock_snapshot_items` | One imported Sellpia product row with recommendation/review state. |
| StockAudit | `stock_audits` | - |
| StockTransaction | `stock_transactions` | - |
| StockTransfer | `stock_transfers` | 창고 간 이동 (from → to warehouse). |
| Warehouse | `warehouses` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  Inventory {
    String id PK
    String optionId FK,UK
    String organizationId FK
    Int currentStock
    Int reservedStock
    Int safetyStock
    Int reorderPoint
    Int reorderQuantity
    Int leadTimeDays
    Decimal dailySalesAvg
    String warehouseLocation
    DateTime lastRestockedAt
    DateTime createdAt
    DateTime updatedAt
  }
  InventorySku {
    String id PK
    String organizationId FK
    String sellpiaProductCode
    String name
    String optionName
    String barcode
    Int reportedStock
    Int purchasePrice
    Int salePrice
    Json rawJson
    String lastImportRunId FK
    DateTime createdAt
    DateTime updatedAt
  }
  PickingItem {
    String id PK
    String pickingListId FK
    String orderId
    String optionId FK
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
    String optionId FK
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
  RocketInventoryLedger {
    String id PK
    String organizationId FK
    String inventoryId FK
    String optionId FK
    String eventType
    Int quantity
    Int reservedDelta
    Int stockDelta
    Int overReservationQty
    String overrideBy
    String overrideReason
    Int rocketPoSeq
    String rocketPoLineKey
    String sourceActionId
    String sourceType
    String sourceRef
    DateTime occurredAt
    String createdBy
    String note
    Json metaJson
    DateTime createdAt
  }
  SellpiaNewProductCandidate {
    String id PK
    String organizationId FK
    String snapshotItemId FK,UK
    String sellpiaProductCode
    String sellpiaProductName
    Int sellpiaStock
    Int safetyStock
    String ownProductCode
    String barcode
    String modelName
    String status
    String resolvedMasterProductId
    String resolvedProductOptionId FK
    String createdInventoryId FK
    String initialReceiveTransactionId
    Int operatorInitialStock
    String resolutionDecision
    String resolvedBy
    DateTime resolvedAt
    String note
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
  SellpiaStockSnapshot {
    String id PK
    String organizationId FK
    String fileName
    String fileHash
    Int rowCount
    DateTime effectiveExportedAt
    DateTime uploadedAt
    String status
    String createdBy
    Json metaJson
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaStockSnapshotItem {
    String id PK
    String organizationId FK
    String snapshotId FK
    Int rowNumber
    String sellpiaProductCode
    String sellpiaProductName
    Int sellpiaStock
    Int safetyStock
    String ownProductCode
    String barcode
    String modelName
    String productOptionId FK
    String inventoryId FK
    Int rocketLedgerNet
    Int targetCurrentStock
    Int kiditemStockBefore
    Int operatorTargetStock
    Int kiditemStockAtApply
    Int diff
    Decimal diffRate
    String status
    Json blockingReasons
    Json warningReasons
    String appliedTransactionId
    String reviewedBy
    DateTime reviewedAt
    String reviewDecision
    String reviewNote
    Json rawJson
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
  StockTransaction {
    String id PK
    String organizationId FK
    String optionId FK
    String optionName
    String type
    Int quantity
    Int unitCost
    Int totalCost
    String relatedId
    String relatedType
    String warehouseId FK
    String note
    String createdBy
    DateTime createdAt
  }
  StockTransfer {
    String id PK
    String organizationId FK
    String optionId FK
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
  Inventory ||--o{ RocketInventoryLedger : "inventory"
  Inventory o|--o{ SellpiaNewProductCandidate : "createdInventory"
  Inventory o|--o{ SellpiaStockSnapshotItem : "inventory"
  PickingList ||--o{ PickingItem : "pickingList"
  SellpiaStockSnapshot ||--o{ SellpiaStockSnapshotItem : "snapshot"
  SellpiaStockSnapshotItem ||--|| SellpiaNewProductCandidate : "snapshotItem"
  Warehouse o|--o{ StockTransaction : "warehouse"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| Inventory | option | references external | Core | ProductOption |
| Inventory | organization | references external | Core | Organization |
| InventorySku | inventorySku | referenced by external | Channels | ChannelSkuComponent |
| InventorySku | lastImportRun | references external | Core | SourceImportRun |
| InventorySku | organization | references external | Core | Organization |
| PickingItem | option | references external | Core | ProductOption |
| PickingList | organization | references external | Core | Organization |
| ReturnTransfer | option | references external | Core | ProductOption |
| ReturnTransfer | organization | references external | Core | Organization |
| RocketInventoryLedger | option | references external | Core | ProductOption |
| RocketInventoryLedger | organization | references external | Core | Organization |
| SellpiaNewProductCandidate | organization | references external | Core | Organization |
| SellpiaNewProductCandidate | resolvedOption | references external | Core | ProductOption |
| SellpiaReceiptUploadBatch | organization | references external | Core | Organization |
| SellpiaStockSnapshot | organization | references external | Core | Organization |
| SellpiaStockSnapshotItem | option | references external | Core | ProductOption |
| SellpiaStockSnapshotItem | organization | references external | Core | Organization |
| StockAudit | organization | references external | Core | Organization |
| StockTransaction | option | references external | Core | ProductOption |
| StockTransaction | organization | references external | Core | Organization |
| StockTransfer | option | references external | Core | ProductOption |
| StockTransfer | organization | references external | Core | Organization |
| Warehouse | organization | references external | Core | Organization |
| Warehouse | warehouse | referenced by external | Orders | Shipment |
