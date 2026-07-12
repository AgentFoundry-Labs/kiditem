# Orders ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| CSRecord | `cs_records` | - |
| Order | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderLineItem | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| OrderReturn | `order_returns` | 채널-agnostic 반품 aggregate. 반품 item 은 OrderReturnLineItem 으로 정규화. type=RETURN/EXCHANGE 구분 first-class. |
| OrderReturnLineItem | `order_return_line_items` | 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. return FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | `reviews` | - |
| Settlement | `settlements` | 월별 정산 (예상 vs 실제 비교). |
| Shipment | `shipments` | - |
| ShipmentItem | `shipment_items` | Order-line shipment detail staged beside retained legacy Shipment listing/option columns. |
| UnshippedItem | `unshipped_items` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  CSRecord {
    String id PK
    String organizationId FK
    String orderId FK
    String listingId FK
    String csType
    String csStatus
    String priority
    String assignee
    String content
    String resolution
    String createdBy
    DateTime createdAt
    DateTime updatedAt
  }
  Order {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String platform
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
    String listingId FK
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  OrderLineItem {
    String id PK
    String organizationId FK
    String orderId FK
    String listingOptionId FK
    String optionId FK
    String productName
    String optionName
    String sku
    Int quantity
    Int unitPrice
    Int totalPrice
    String status
    String externalLineId
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  OrderReturn {
    String id PK
    String organizationId FK
    String orderId FK
    String channelAccountId FK
    String platform
    String externalReturnId
    String type
    String status
    String reason
    String reasonCategory1
    String reasonCategory2
    String faultBy
    String requesterName
    Int enclosePrice
    DateTime requestedAt
    DateTime completedAt
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  OrderReturnLineItem {
    String id PK
    String organizationId FK
    String returnId FK
    String orderLineItemId FK
    String optionId FK
    String listingOptionId FK
    String productName
    String optionName
    String externalSku
    Int quantity
    Json metadata
    DateTime createdAt
  }
  Review {
    String id PK
    String organizationId FK
    String listingId FK
    String platform
    Int rating
    String content
    String reviewerName
    DateTime reviewedAt
    DateTime createdAt
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
  Shipment {
    String id PK
    String organizationId FK
    String orderId FK
    String listingId FK
    String optionId FK
    String trackingNo
    String courierCode
    String courierName
    String status
    DateTime shippedAt
    DateTime deliveredAt
    Int deliveryDays
    String warehouseId FK
    DateTime createdAt
    DateTime updatedAt
  }
  ShipmentItem {
    String id PK
    String organizationId FK
    String shipmentId FK
    String orderLineItemId FK
    Int quantity
    DateTime createdAt
  }
  UnshippedItem {
    String id PK
    String organizationId FK
    String orderId FK
    String listingId FK
    String optionId FK
    String orderLineItemId FK
    String productName
    String optionName
    String externalSku
    Int quantity
    DateTime orderDate
    Int delayDays
    String reason
    Boolean isNotified
    DateTime notifiedAt
    DateTime createdAt
  }
  Order o|--o{ CSRecord : "order"
  Order ||--o{ OrderLineItem : "order"
  Order o|--o{ OrderReturn : "order"
  Order o|--o{ Shipment : "order"
  Order ||--o{ UnshippedItem : "order"
  OrderLineItem o|--o{ OrderReturnLineItem : "orderLineItem"
  OrderLineItem ||--o{ ShipmentItem : "orderLineItem"
  OrderLineItem o|--o{ UnshippedItem : "orderLineItem"
  OrderReturn ||--o{ OrderReturnLineItem : "return"
  Shipment ||--o{ ShipmentItem : "shipment"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| CSRecord | listing | references external | Core | ChannelListing |
| CSRecord | organization | references external | Core | Organization |
| Order | channelAccount | references external | Core | ChannelAccount |
| Order | listing | references external | Core | ChannelListing |
| Order | organization | references external | Core | Organization |
| OrderLineItem | listingOption | references external | Core | ChannelListingOption |
| OrderLineItem | option | references external | Core | ProductOption |
| OrderLineItem | organization | references external | Core | Organization |
| OrderReturn | channelAccount | references external | Core | ChannelAccount |
| OrderReturn | organization | references external | Core | Organization |
| OrderReturnLineItem | listingOption | references external | Core | ChannelListingOption |
| OrderReturnLineItem | option | references external | Core | ProductOption |
| OrderReturnLineItem | organization | references external | Core | Organization |
| Review | listing | references external | Core | ChannelListing |
| Review | organization | references external | Core | Organization |
| Settlement | organization | references external | Core | Organization |
| Shipment | listing | references external | Core | ChannelListing |
| Shipment | option | references external | Core | ProductOption |
| Shipment | organization | references external | Core | Organization |
| Shipment | warehouse | references external | Inventory | Warehouse |
| ShipmentItem | organization | references external | Core | Organization |
| UnshippedItem | listing | references external | Core | ChannelListing |
| UnshippedItem | option | references external | Core | ProductOption |
| UnshippedItem | organization | references external | Core | Organization |
