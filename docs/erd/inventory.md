# Inventory ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| Inventory | `inventory` | ProductOption 에 1:1. Bundle option 은 inventory 미생성 (availableStock 계산값 사용). |
| PickingItem | `picking_items` | - |
| PickingList | `picking_lists` | - |
| ReturnTransfer | `return_transfers` | - |
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
    String companyId FK
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
    String companyId FK
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
    String companyId FK
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
  StockAudit {
    String id PK
    String companyId FK
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
    String companyId FK
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
    String companyId FK
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
    String companyId FK
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
  Warehouse o|--o{ StockTransaction : "warehouse"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| Inventory | company | references external | Core | Company |
| Inventory | option | references external | Core | ProductOption |
| PickingItem | option | references external | Core | ProductOption |
| PickingList | company | references external | Core | Company |
| ReturnTransfer | company | references external | Core | Company |
| ReturnTransfer | option | references external | Core | ProductOption |
| StockAudit | company | references external | Core | Company |
| StockTransaction | company | references external | Core | Company |
| StockTransaction | option | references external | Core | ProductOption |
| StockTransfer | company | references external | Core | Company |
| StockTransfer | option | references external | Core | ProductOption |
| Warehouse | company | references external | Core | Company |
| Warehouse | warehouse | referenced by external | Orders | Shipment |
