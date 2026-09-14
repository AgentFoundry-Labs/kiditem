# Orders ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` after Prisma schema changes.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| CoupangDirectPoSnapshot | `coupang_direct_po_snapshots` | 쿠팡직배송 발주확정 스냅샷. 입고예정일 달력이 매번 쿠팡을 다시 긁지 않도록 |
| CoupangDirectTransportConsumption | `coupang_direct_transport_consumptions` | Immutable alias from one completed source attempt and transport selection to its canonical downstream effect receipt. |
| CoupangDirectTransportReceipt | `coupang_direct_transport_receipts` | Immutable transport effect receipt for one normalized Coupang direct-order payload. It owns downstream publication identity, not source collection state. |
| Order | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderCollectionArtifact | `order_collection_artifacts` | Retained collection input evidence; converted downloads are not persisted and lifecycle belongs to SourceImportRun. |
| OrderLineItem | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | `reviews` | 채널 상품평 원본 1건. 쿠팡은 Wing 상품평 화면(`/tenants/cs/product/review`)을 |
| ReviewCollectionChunk | `review_collection_chunks` | Fenced, organization-scoped review collection chunks. Chunks are staging evidence only and are deleted in the terminal publication transaction. |
| SellpiaOrderTransmissionIntent | `sellpia_order_transmission_intents` | Organization-scoped idempotency fence for browser Sellpia order transmission. It does not represent or mutate inventory freshness. |
| SellpiaOrderTransmissionIntentReconciliation | `sellpia_order_transmission_intent_reconciliations` | Append-only owner/admin audit for resolving an ambiguous Sellpia order transmission outcome. |
| Settlement | `settlements` | 월별 정산 (예상 vs 실제 비교). |

## Mermaid ER Diagram

```mermaid
erDiagram
  CoupangDirectPoSnapshot {
    String id PK
    String organizationId FK
    String channelAccountId
    String purchaseOrderSeq
    String centerName
    String transport
    String deliveryDate
    String orderedDate
    Boolean isUrgent
    Int skuCount
    Int orderQuantity
    Int orderAmount
    Json itemsJson
    DateTime collectedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangDirectTransportConsumption {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String receiptId FK
    String transport FK
    StringArray selectedPurchaseOrderKeys
    DateTime createdAt
  }
  CoupangDirectTransportReceipt {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String effectSourceImportRunId FK
    String rocketPurchaseConfirmationId FK
    String transport
    String payloadChecksum
    String transmissionIntentKey
    Int matchedLineCount
    Int reconciledRows
    Json collectedLines
    Json matchedLines
    Json unmatchedLines
    DateTime createdAt
  }
  Order {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String sourceImportRunId FK
    String externalOrderId
    String externalNumber
    String customerName
    String receiverName
    String receiverPhone
    String receiverAddr
    String memo
    String status
    DateTime orderedAt
    DateTime paidAt
    DateTime shippedAt
    DateTime deliveredAt
    String trackingNumber
    String shippingCompany
    Int shippingPrice
    Int totalPrice
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  OrderCollectionArtifact {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String sourceFileName
    String sourceContentType
    Bytes sourceBytes
    DateTime createdAt
  }
  OrderLineItem {
    String id PK
    String organizationId FK
    String orderId FK
    String listingOptionId FK
    String productName
    String optionName
    String sku
    Int quantity
    Int unitPrice
    Int totalPrice
    String status
    String externalLineId
    String externalBarcode
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  Review {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String listingId FK
    String platform
    Int rating
    String title
    String content
    String reviewerName
    String externalReviewId
    String externalOptionId
    String externalProductId
    String itemName
    Int imageCount
    Int videoCount
    Boolean isDeleted
    Boolean isBlinded
    DateTime reviewedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ReviewCollectionChunk {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    Int windowIndex
    Int sequence
    String checksum
    Int itemCount
    Json payload
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaOrderTransmissionIntent {
    String id PK
    String organizationId FK
    String intentKey
    String status
    String createdBy FK
    DateTime preparedAt
    DateTime finalizedAt
    DateTime abortedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaOrderTransmissionIntentReconciliation {
    String id PK
    String organizationId FK
    String intentId FK
    String reconciledBy FK
    DateTime reconciledAt
    String note
    String outcome
  }
  Settlement {
    String id PK
    String organizationId FK
    String period
    Int expectedAmount
    Int actualAmount
    Int commission
    Int shippingFee
    Int adjustments
    Int difference
    Int orderCount
    Int returnCount
    String status
    DateTime settledAt
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangDirectTransportReceipt ||--o{ CoupangDirectTransportConsumption : "receipt"
  Order ||--o{ OrderLineItem : "order"
  SellpiaOrderTransmissionIntent ||--o{ SellpiaOrderTransmissionIntentReconciliation : "intent"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| CoupangDirectPoSnapshot | organization | references external | Core | Organization |
| CoupangDirectTransportConsumption | organization | references external | Core | Organization |
| CoupangDirectTransportConsumption | sourceImportRun | references external | Core | SourceImportRun |
| CoupangDirectTransportReceipt | channelAccount | references external | Core | ChannelAccount |
| CoupangDirectTransportReceipt | effectSourceImportRun | references external | Core | SourceImportRun |
| CoupangDirectTransportReceipt | organization | references external | Core | Organization |
| CoupangDirectTransportReceipt | rocketPurchaseConfirmation | references external | Supply | RocketPurchaseConfirmation |
| Order | channelAccount | references external | Core | ChannelAccount |
| Order | organization | references external | Core | Organization |
| Order | sourceImportRun | references external | Core | SourceImportRun |
| OrderCollectionArtifact | organization | references external | Core | Organization |
| OrderCollectionArtifact | sourceImportRun | references external | Core | SourceImportRun |
| OrderLineItem | listingOption | references external | Core | ChannelListingOption |
| OrderLineItem | organization | references external | Core | Organization |
| Review | listing | references external | Core | ChannelListing |
| Review | organization | references external | Core | Organization |
| Review | sourceImportRun | references external | Core | SourceImportRun |
| ReviewCollectionChunk | organization | references external | Core | Organization |
| ReviewCollectionChunk | sourceImportRun | references external | Core | SourceImportRun |
| SellpiaOrderTransmissionIntent | creator | references external | Core | User |
| SellpiaOrderTransmissionIntent | organization | references external | Core | Organization |
| SellpiaOrderTransmissionIntentReconciliation | organization | references external | Core | Organization |
| SellpiaOrderTransmissionIntentReconciliation | reconciler | references external | Core | User |
| Settlement | organization | references external | Core | Organization |
