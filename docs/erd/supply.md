# Supply ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| PurchaseOrder | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | `purchase_order_items` | - |
| PurchaseOrderSubmissionAttempt | `purchase_order_submission_attempts` | Durable idempotency intent and reconciliation record for an external purchase-order submission. |
| RocketPurchaseConfirmation | `rocket_purchase_confirmations` | Durable immutable Rocket workbook export and external synchronization workflow. |
| RocketPurchaseConfirmationAllocation | `rocket_purchase_confirmation_allocations` | Immutable component recipe evidence captured for one Rocket workbook line. |
| RocketPurchaseConfirmationLine | `rocket_purchase_confirmation_lines` | Immutable Rocket workbook line decision and matching final-order evidence. |
| RocketPurchaseConfirmationTransmission | `rocket_purchase_confirmation_transmissions` | One transport-specific Coupang collection probe and optional stable Sellpia transmission key for a Rocket workbook export. |
| Supplier | `suppliers` | - |
| SupplierPayment | `supplier_payments` | - |
| SupplierProduct | `supplier_products` | 공급사별 Sellpia 물리 상품 단위 공급가/주공급처 정책. |

## Mermaid ER Diagram

```mermaid
erDiagram
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
    String sellpiaInventorySkuId FK
    String productName
    Int quantity
    Decimal unitPriceCny
    DateTime createdAt
  }
  PurchaseOrderSubmissionAttempt {
    String id PK
    String organizationId FK
    String purchaseOrderId FK
    String idempotencyKey
    BigInt freshnessGeneration
    String status
    String providerReference
    String errorCode
    String errorMessage
    String reconciliationOutcome
    DateTime reconciledAt
    String reconciledBy FK
    DateTime createdAt
    DateTime updatedAt
  }
  RocketPurchaseConfirmation {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String sourceImportRunId FK
    String idempotencyKey
    String requestHash
    BigInt freshnessGeneration
    String status
    String confirmedBy FK
    DateTime confirmedAt
    String artifactFileName
    String artifactContentType
    String artifactSha256
    Bytes artifactBytes
    DateTime artifactStoredAt
    DateTime ordersCollectedAt
    DateTime completedAt
    String failureCode
    String failureMessage
    String releasedBy FK
    DateTime releasedAt
    String releaseReason
    DateTime createdAt
    DateTime updatedAt
  }
  RocketPurchaseConfirmationAllocation {
    String id PK
    String organizationId FK
    String confirmationLineId FK
    String sellpiaInventorySkuId FK
    Int unitsPerVariant
    Int quantity
    DateTime createdAt
  }
  RocketPurchaseConfirmationLine {
    String id PK
    String organizationId FK
    String confirmationId FK
    String poLineId
    String poNumber
    String productNo
    String barcode
    String productName
    Int orderQuantity
    Int confirmedQuantity
    String shortageReason
    String channelListingOptionId FK
    String productVariantId FK
    String collectedOrderLineItemId
    DateTime collectedAt
    DateTime createdAt
  }
  RocketPurchaseConfirmationTransmission {
    String id PK
    String organizationId FK
    String confirmationId FK
    String sourceImportRunId FK
    String transport
    String intentKey
    Int matchedLineCount
    DateTime observedAt
    DateTime createdAt
    DateTime updatedAt
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
    String sellpiaInventorySkuId FK,UK
    Int supplyPrice
    Int minOrderQty
    Boolean isPrimary
    String memo
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder ||--o{ PurchaseOrderSubmissionAttempt : "purchaseOrder"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationLine : "confirmation"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationTransmission : "confirmation"
  RocketPurchaseConfirmationLine ||--o{ RocketPurchaseConfirmationAllocation : "confirmationLine"
  Supplier o|--o{ PurchaseOrder : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier ||--o{ SupplierProduct : "supplier"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| PurchaseOrder | organization | references external | Core | Organization |
| PurchaseOrderItem | organization | references external | Core | Organization |
| PurchaseOrderItem | sellpiaInventorySku | references external | Inventory | SellpiaInventorySku |
| PurchaseOrderSubmissionAttempt | organization | references external | Core | Organization |
| PurchaseOrderSubmissionAttempt | reconciler | references external | Core | User |
| RocketPurchaseConfirmation | channelAccount | references external | Core | ChannelAccount |
| RocketPurchaseConfirmation | confirmer | references external | Core | User |
| RocketPurchaseConfirmation | organization | references external | Core | Organization |
| RocketPurchaseConfirmation | releaser | references external | Core | User |
| RocketPurchaseConfirmation | sourceImportRun | references external | Core | SourceImportRun |
| RocketPurchaseConfirmationAllocation | organization | references external | Core | Organization |
| RocketPurchaseConfirmationAllocation | sellpiaInventorySku | references external | Inventory | SellpiaInventorySku |
| RocketPurchaseConfirmationLine | channelListingOption | references external | Core | ChannelListingOption |
| RocketPurchaseConfirmationLine | organization | references external | Core | Organization |
| RocketPurchaseConfirmationLine | productVariant | references external | Core | ProductVariant |
| RocketPurchaseConfirmationTransmission | organization | references external | Core | Organization |
| RocketPurchaseConfirmationTransmission | sourceImportRun | references external | Core | SourceImportRun |
| Supplier | organization | references external | Core | Organization |
| SupplierPayment | organization | references external | Core | Organization |
| SupplierProduct | organization | references external | Core | Organization |
| SupplierProduct | sellpiaInventorySku | references external | Inventory | SellpiaInventorySku |
