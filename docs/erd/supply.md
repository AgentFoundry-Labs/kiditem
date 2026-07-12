# Supply ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| MasterSupplierProduct | `master_supplier_products` | Master 단위 주공급처 정책. 여러 supplier 후보 중 isPrimary 가 기본. |
| PurchaseOrder | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | `purchase_order_items` | - |
| Supplier | `suppliers` | - |
| SupplierPayment | `supplier_payments` | - |
| SupplierProduct | `supplier_products` | 공급사별 SKU(옵션) 단위 공급가 관리. |

## Mermaid ER Diagram

```mermaid
erDiagram
  MasterSupplierProduct {
    String id PK
    String masterId FK
    String supplierId FK
    Boolean isPrimary
    Int minOrderQty
    String memo
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseOrder {
    String id PK
    String organizationId FK
    String supplierName
    String supplierContact
    String supplierId FK
    Decimal totalAmountCny
    String status
    DateTime orderDate
    DateTime expectedDeliveryDate
    String trackingNumber
    String externalOrderPlatform
    String externalOrderId
    String externalOrderUrl
    DateTime receivedAt
    Int receivedQty
    Int defectQty
    String defectType
    String defectAction
    String defectNote
    DateTime inspectedAt
    String inspectedBy
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseOrderItem {
    String id PK
    String organizationId FK
    String orderId FK
    String optionId FK
    String masterProductId FK
    String productName
    Int quantity
    Decimal unitPriceCny
    DateTime createdAt
  }
  Supplier {
    String id PK
    String organizationId FK
    String name
    String contactName
    String phone
    String email
    String address
    Int leadTimeDays
    String paymentTerms
    String notes
    String status
    DateTime createdAt
    DateTime updatedAt
  }
  SupplierPayment {
    String id PK
    String organizationId FK
    String supplierId FK
    String supplierName
    Int amount
    Int paidAmount
    String status
    DateTime dueDate
    DateTime paidDate
    String purchaseOrderId FK
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
  SupplierProduct {
    String id PK
    String organizationId FK
    String supplierId FK
    String optionId FK
    String masterProductId FK,UK
    Int supplyPrice
    Int minOrderQty
    Boolean isPrimary
    String memo
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder o|--o{ PurchaseOrderItem : "scopedOrder"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  Supplier ||--o{ MasterSupplierProduct : "supplier"
  Supplier o|--o{ PurchaseOrder : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier o|--o{ SupplierProduct : "scopedSupplier"
  Supplier ||--o{ SupplierProduct : "supplier"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| MasterSupplierProduct | master | references external | Core | MasterProduct |
| PurchaseOrder | organization | references external | Core | Organization |
| PurchaseOrderItem | masterProduct | references external | Core | MasterProduct |
| PurchaseOrderItem | option | references external | Core | ProductOption |
| PurchaseOrderItem | organization | references external | Core | Organization |
| Supplier | organization | references external | Core | Organization |
| SupplierPayment | organization | references external | Core | Organization |
| SupplierProduct | masterProduct | references external | Core | MasterProduct |
| SupplierProduct | option | references external | Core | ProductOption |
| SupplierProduct | organization | references external | Core | Organization |
