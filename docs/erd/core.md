# Core ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| BundleComponent | `bundle_components` | 세트 옵션의 구성품 관계. bundleOption(isBundle=true) ↔ componentOption. Cross-master 허용, cross-company 금지. |
| CategoryMapping | `category_mappings` | - |
| ChannelListing | `channel_listings` | 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등. |
| ChannelListingOption | `channel_listing_options` | 채널 listing 내 옵션 externalOptionId 와 내부 ProductOption 매핑. |
| Company | `companies` | - |
| MasterProduct | `master_products` | 기획상품 family. 같은 컨셉의 옵션들을 묶는 entity. 운영/광고/전략 단위. |
| MasterProductImage | `master_product_images` | MasterProduct 이미지 갤러리. Source of truth 이며 MasterProduct.imageUrl 은 대표 이미지 캐시로만 동기화된다. |
| ProductOption | `product_options` | 물리 SKU. 바코드 1:1. 재고/매입/창고 단위. isBundle 이면 구성품 기반 계산. |
| User | `users` | human(직원) / agent(AI, agentDefinitionId 연결) / system(챗봇, companyId=null) 통합 관리. |

## Mermaid ER Diagram

```mermaid
erDiagram
  BundleComponent {
    String id PK
    String bundleOptionId FK
    String componentOptionId FK
    String companyId FK
    Int qty
    DateTime createdAt
    DateTime updatedAt
  }
  CategoryMapping {
    String id PK
    String companyId FK
    String internalCategory
    String coupangCategoryId
    String coupangCategoryName
    String keywords
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListing {
    String id PK
    String masterId FK
    String companyId FK
    String channel
    String externalId
    String channelName
    Int channelPrice
    String status
    String exposureStatus
    String deliveryChargeType
    Int freeShipOverAmount
    Int returnCharge
    Json deliveryInfo
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListingOption {
    String id PK
    String listingId FK
    String optionId FK
    String companyId FK
    String externalOptionId
    String itemName
    Int salePrice
    Boolean isActive
    Boolean isUnmatched
    DateTime createdAt
    DateTime updatedAt
  }
  Company {
    String id PK
    String name
    String slug UK
    String businessNumber
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProduct {
    String id PK
    String companyId FK
    String code UK
    String legacyCode
    String barcode
    String name
    String description
    String category
    String brand
    Json tags
    Int optionCounter
    String thumbnailUrl
    String imageUrl
    String abcGrade
    String profitTag
    String adTier
    Int adBudgetLimit
    Int healthScore
    DateTime healthUpdatedAt
    String sourceUrl
    String sourcePlatform
    Decimal costCny
    Decimal marginRate
    Json rawData
    Json processedData
    Json draftContent
    String pipelineStep
    String detailPageUrl
    String thumbnailStrategy
    String supplierId FK
    Boolean isDeleted
    DateTime deletedAt
    Boolean isTemporary
    String temporaryReason
    String memo
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductImage {
    String id PK
    String companyId FK
    String masterId FK
    String url
    String storageKey
    String role
    String label
    Int sortOrder
    String source
    String mimeType
    Int width
    Int height
    Int fileSize
    Boolean isPrimary
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ProductOption {
    String id PK
    String masterId FK
    String companyId FK
    String sku UK
    String barcode
    String legacyCode
    String optionName
    Int sortOrder
    Int costPrice
    Int sellPrice
    Decimal commissionRate
    Int shippingCost
    Int otherCost
    Boolean isBundle
    Int availableStock
    Boolean isDeleted
    DateTime deletedAt
    Boolean isTemporary
    String temporaryReason
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  User {
    String id PK
    String companyId FK
    String email UK
    String name
    String password
    String role
    String type
    String team
    String avatarUrl
    String agentDefinitionId FK
    Boolean isActive
    DateTime lastLoginAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListing ||--o{ ChannelListingOption : "listing"
  Company ||--o{ BundleComponent : "company"
  Company ||--o{ CategoryMapping : "company"
  Company ||--o{ ChannelListing : "company"
  Company ||--o{ ChannelListingOption : "company"
  Company ||--o{ MasterProduct : "company"
  Company ||--o{ MasterProductImage : "company"
  Company ||--o{ ProductOption : "company"
  Company o|--o{ User : "company"
  MasterProduct ||--o{ ChannelListing : "master"
  MasterProduct ||--o{ MasterProductImage : "master"
  MasterProduct ||--o{ ProductOption : "master"
  ProductOption ||--o{ BundleComponent : "bundleOption"
  ProductOption ||--o{ BundleComponent : "componentOption"
  ProductOption o|--o{ ChannelListingOption : "option"
```

## External References

| Local model | Relation | Direction | External domain | External model |
|---|---|---|---|---|
| ChannelListing | listing | referenced by external | Advertising | AdAction |
| ChannelListing | listing | referenced by external | AI | Thumbnail |
| ChannelListing | listing | referenced by external | AI | ThumbnailTracking |
| ChannelListing | listing | referenced by external | Channels | ChannelAdTargetDailySnapshot |
| ChannelListing | listing | referenced by external | Channels | ChannelListingDailySnapshot |
| ChannelListing | listing | referenced by external | Channels | ChannelListingOptionDailySnapshot |
| ChannelListing | listing | referenced by external | Channels | ChannelScrapeSnapshot |
| ChannelListing | listing | referenced by external | Finance | ProfitLoss |
| ChannelListing | listing | referenced by external | Orders | CSRecord |
| ChannelListing | listing | referenced by external | Orders | Order |
| ChannelListing | listing | referenced by external | Orders | Review |
| ChannelListing | listing | referenced by external | Orders | Shipment |
| ChannelListing | listing | referenced by external | Orders | UnshippedItem |
| ChannelListingOption | listingOption | referenced by external | Channels | ChannelAdTargetDailySnapshot |
| ChannelListingOption | listingOption | referenced by external | Channels | ChannelListingOptionDailySnapshot |
| ChannelListingOption | listingOption | referenced by external | Channels | ChannelScrapeSnapshot |
| ChannelListingOption | listingOption | referenced by external | Orders | OrderLineItem |
| Company | company | referenced by external | Advertising | AdAction |
| Company | company | referenced by external | Advertising | ExecutionWorker |
| Company | company | referenced by external | Advertising | ScrapeTarget |
| Company | company | referenced by external | Agents | AgentDefinition |
| Company | company | referenced by external | Agents | AgentEvent |
| Company | company | referenced by external | Agents | AgentWakeupRequest |
| Company | company | referenced by external | Agents | HeartbeatRun |
| Company | company | referenced by external | Agents | WorkflowTemplate |
| Company | company | referenced by external | AI | ContentGeneration |
| Company | company | referenced by external | AI | Thumbnail |
| Company | company | referenced by external | AI | ThumbnailAnalysis |
| Company | company | referenced by external | AI | ThumbnailGeneration |
| Company | company | referenced by external | AI | ThumbnailGenerationCandidate |
| Company | company | referenced by external | AI | ThumbnailGenerationInputImage |
| Company | company | referenced by external | AI | ThumbnailRegistrationAttempt |
| Company | company | referenced by external | AI | ThumbnailTracking |
| Company | company | referenced by external | Channels | ChannelAccountDailyKpiSnapshot |
| Company | company | referenced by external | Channels | ChannelAdTargetDailySnapshot |
| Company | company | referenced by external | Channels | ChannelListingDailySnapshot |
| Company | company | referenced by external | Channels | ChannelListingOptionDailySnapshot |
| Company | company | referenced by external | Channels | ChannelScrapeRun |
| Company | company | referenced by external | Channels | ChannelScrapeSnapshot |
| Company | company | referenced by external | Finance | GradeHistory |
| Company | company | referenced by external | Finance | ManualLedger |
| Company | company | referenced by external | Finance | ProcessingCost |
| Company | company | referenced by external | Finance | ProfitLoss |
| Company | company | referenced by external | Finance | SalesPlan |
| Company | company | referenced by external | Inventory | Inventory |
| Company | company | referenced by external | Inventory | PickingList |
| Company | company | referenced by external | Inventory | ReturnTransfer |
| Company | company | referenced by external | Inventory | StockAudit |
| Company | company | referenced by external | Inventory | StockTransaction |
| Company | company | referenced by external | Inventory | StockTransfer |
| Company | company | referenced by external | Inventory | Warehouse |
| Company | company | referenced by external | Orders | CSRecord |
| Company | company | referenced by external | Orders | Order |
| Company | company | referenced by external | Orders | OrderLineItem |
| Company | company | referenced by external | Orders | OrderReturn |
| Company | company | referenced by external | Orders | OrderReturnLineItem |
| Company | company | referenced by external | Orders | Review |
| Company | company | referenced by external | Orders | Settlement |
| Company | company | referenced by external | Orders | Shipment |
| Company | company | referenced by external | Orders | UnshippedItem |
| Company | company | referenced by external | Supply | PurchaseOrder |
| Company | company | referenced by external | Supply | Supplier |
| Company | company | referenced by external | Supply | SupplierPayment |
| Company | company | referenced by external | System | ActionTask |
| Company | company | referenced by external | System | ActivityEvent |
| Company | company | referenced by external | System | Alert |
| Company | company | referenced by external | System | BusinessRule |
| Company | company | referenced by external | System | SystemSetting |
| MasterProduct | master | referenced by external | AI | ContentGeneration |
| MasterProduct | master | referenced by external | AI | ThumbnailAnalysis |
| MasterProduct | master | referenced by external | AI | ThumbnailGeneration |
| MasterProduct | master | referenced by external | Finance | GradeHistory |
| MasterProduct | master | referenced by external | Finance | ProcessingCost |
| MasterProduct | master | referenced by external | Supply | MasterSupplierProduct |
| MasterProduct | supplier | references external | Supply | Supplier |
| ProductOption | option | referenced by external | Channels | ChannelAdTargetDailySnapshot |
| ProductOption | option | referenced by external | Channels | ChannelListingOptionDailySnapshot |
| ProductOption | option | referenced by external | Channels | ChannelScrapeSnapshot |
| ProductOption | option | referenced by external | Inventory | Inventory |
| ProductOption | option | referenced by external | Inventory | PickingItem |
| ProductOption | option | referenced by external | Inventory | ReturnTransfer |
| ProductOption | option | referenced by external | Inventory | StockTransaction |
| ProductOption | option | referenced by external | Inventory | StockTransfer |
| ProductOption | option | referenced by external | Orders | OrderLineItem |
| ProductOption | option | referenced by external | Orders | OrderReturnLineItem |
| ProductOption | option | referenced by external | Orders | Shipment |
| ProductOption | option | referenced by external | Orders | UnshippedItem |
| ProductOption | option | referenced by external | Supply | PurchaseOrderItem |
| ProductOption | option | referenced by external | Supply | SupplierProduct |
| User | agentDefinition | references external | Agents | AgentDefinition |
| User | assigneeUser | referenced by external | System | ActionTask |
| User | triggeredByUser | referenced by external | Agents | HeartbeatRun |
| User | triggeredByUser | referenced by external | Agents | WorkflowRun |
| User | triggeredByUser | referenced by external | AI | ThumbnailGeneration |
