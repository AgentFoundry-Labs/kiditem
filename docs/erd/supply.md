# Supply ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` after Prisma schema changes.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| ProcurementTestIntent | `procurement_test_intents` | Reviewable pre-inventory RFQ, sample, or test-order intent. Approval never submits to a provider; provider IO remains PurchaseOrderSubmissionAttempt-owned. |
| PurchaseOrder | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | `purchase_order_items` | - |
| PurchaseOrderSubmissionAttempt | `purchase_order_submission_attempts` | Durable idempotency intent and reconciliation record for an external purchase-order submission. |
| RocketPurchaseConfirmation | `rocket_purchase_confirmations` | Durable immutable Rocket workbook export and external synchronization workflow. |
| RocketPurchaseConfirmationAllocation | `rocket_purchase_confirmation_allocations` | Immutable component recipe evidence captured for one Rocket workbook line. |
| RocketPurchaseConfirmationLine | `rocket_purchase_confirmation_lines` | Immutable Rocket workbook line decision and matching final-order evidence. |
| RocketPurchaseConfirmationTransmission | `rocket_purchase_confirmation_transmissions` | One transport-specific Coupang collection probe and optional stable Sellpia transmission key for a Rocket workbook export. |
| Supplier | `suppliers` | - |
| SupplierOfferPriceTier | `supplier_offer_price_tiers` | Immutable quantity price tier nested under one supplier-offer snapshot. |
| SupplierOfferSkuSnapshot | `supplier_offer_sku_snapshots` | Immutable observed supplier-offer identity and commercial terms before a Sellpia inventory SKU exists. identityStatus is offer_only or exact_variant. |
| SupplierPayment | `supplier_payments` | - |
| SupplierProduct | `supplier_products` | 공급사별 MasterProduct 단위 공급가/주공급처 정책. |

## Mermaid ER Diagram

```mermaid
erDiagram
  ProcurementTestIntent {
    String id PK
    String organizationId FK
    String decisionBatchItemId FK
    String launchCandidateId FK
    String supplierOfferSkuSnapshotId FK
    String selectedPriceTierId FK
    String sourceRecommendationArtifactId
    String requestedByUserId FK
    String reviewedByUserId FK
    String kind
    String status
    String idempotencyKey
    String requestHash
    Int requestedPurchaseUnits
    Int unitsPerPurchaseUnit
    Int unitsPerSellableBundle
    Int requestedSellableUnits
    Decimal selectedUnitPriceCny
    Decimal expectedGoodsTotalCny
    String currency
    DateTime expiresAt
    DateTime reviewedAt
    String reviewReason
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
    String idempotencyKey
    String requestHash
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
    String legacySellpiaInventorySkuId
    String masterProductId
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
    String requestHash
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
    String channelAccountId
     /**
    String sourceImportRunId FK
     /**
    String rocketPoOperationId
    String idempotencyKey
    String requestHash
    BigInt freshnessGeneration
    String confirmedBy FK
    DateTime confirmedAt
    String artifactFileName
    String artifactContentType
    String artifactSha256
    Bytes artifactBytes
    DateTime completedAt
    DateTime releasedAt
    DateTime createdAt
    DateTime updatedAt
  }
  RocketPurchaseConfirmationAllocation {
    String id PK
    String organizationId FK
    String confirmationLineId FK
    String legacySellpiaInventorySkuId
    String masterProductId
    Int unitsPerSale
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
    String channelListingOptionId
    String collectedOrderLineItemId
    DateTime collectedAt
    DateTime createdAt
  }
  RocketPurchaseConfirmationTransmission {
    String id PK
    String organizationId FK
    String confirmationId FK
     /**
    String sourceImportRunId FK
     /**
    String directshipOperationId
    String transport
    String intentKey
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
    DateTime createdAt
    DateTime updatedAt
  }
  SupplierOfferPriceTier {
    String id PK
    String organizationId FK
    String supplierOfferSkuSnapshotId FK
    Int minQuantity
    Int maxQuantity
    Decimal unitPriceCny
    DateTime createdAt
  }
  SupplierOfferSkuSnapshot {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String supplierId FK
    String identityStatus
    String sourcePlatform
    String sourceUrl
    String externalSupplierKey
    String externalOfferId
    String externalSkuId
    String variantKey
    String productName
    String supplierName
    String variantName
    String currency
    String orderUnit
    Int unitsPerOrderUnit
    Int minOrderQuantity
    Boolean sampleAvailable
    Decimal samplePriceCny
    Decimal domesticFreightCny
    Int productionLeadTimeDaysMin
    Int productionLeadTimeDaysMax
    Int dispatchLeadTimeDaysMin
    Int dispatchLeadTimeDaysMax
    Int grossWeightGrams
    Int lengthMm
    Int widthMm
    Int heightMm
    String material
    Int packCount
    DateTime capturedAt
    DateTime validUntil
    String snapshotHash
    DateTime createdAt
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
    String masterProductId UK
    Int supplyPrice
    Boolean isPrimary
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
  Supplier o|--o{ SupplierOfferSkuSnapshot : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier ||--o{ SupplierProduct : "supplier"
  SupplierOfferPriceTier o|--o{ ProcurementTestIntent : "selectedPriceTier"
  SupplierOfferSkuSnapshot ||--o{ ProcurementTestIntent : "supplierOfferSkuSnapshot"
  SupplierOfferSkuSnapshot ||--o{ SupplierOfferPriceTier : "supplierOfferSkuSnapshot"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| ProcurementTestIntent | decisionBatchItem | references external | Sourcing | SourcingDecisionBatchItem |
| ProcurementTestIntent | launchCandidate | references external | Sourcing | SourcingLaunchCandidate |
| ProcurementTestIntent | organization | references external | Core | Organization |
| ProcurementTestIntent | requestedByUser | references external | Core | User |
| ProcurementTestIntent | reviewedByUser | references external | Core | User |
| PurchaseOrder | organization | references external | Core | Organization |
| PurchaseOrderItem | organization | references external | Core | Organization |
| PurchaseOrderSubmissionAttempt | organization | references external | Core | Organization |
| PurchaseOrderSubmissionAttempt | reconciler | references external | Core | User |
| RocketPurchaseConfirmation | confirmer | references external | Core | User |
| RocketPurchaseConfirmation | organization | references external | Core | Organization |
| RocketPurchaseConfirmation | rocketPurchaseConfirmation | referenced by external | Orders | CoupangDirectTransportReceipt |
| RocketPurchaseConfirmation | sourceImportRun | references external | Core | SourceImportRun |
| RocketPurchaseConfirmationAllocation | organization | references external | Core | Organization |
| RocketPurchaseConfirmationLine | organization | references external | Core | Organization |
| RocketPurchaseConfirmationTransmission | organization | references external | Core | Organization |
| RocketPurchaseConfirmationTransmission | sourceImportRun | references external | Core | SourceImportRun |
| Supplier | organization | references external | Core | Organization |
| SupplierOfferPriceTier | organization | references external | Core | Organization |
| SupplierOfferSkuSnapshot | evidenceObservation | references external | Sourcing | SourcingEvidenceObservation |
| SupplierOfferSkuSnapshot | organization | references external | Core | Organization |
| SupplierOfferSkuSnapshot | supplierOfferSkuSnapshot | referenced by external | Sourcing | SourcingDecisionBatchItem |
| SupplierOfferSkuSnapshot | supplierOfferSkuSnapshot | referenced by external | Sourcing | SourcingLaunchCandidate |
| SupplierPayment | organization | references external | Core | Organization |
| SupplierProduct | organization | references external | Core | Organization |
