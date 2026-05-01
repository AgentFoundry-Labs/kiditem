# Core ERD

> Generated from `prisma/models/*.prisma`. Do not edit by hand.
> Regenerate with `npm run db:erd` or `npm run graphify:schema`.

[Back to full ERD](../ERD.md)

## Models

| Model | Table | Description |
|---|---|---|
| BundleComponent | `bundle_components` | 세트 옵션의 구성품 관계. bundleOption(isBundle=true) ↔ componentOption. Cross-master 허용, cross-organization 금지. |
| CategoryMapping | `category_mappings` | - |
| ChannelAccount | `channel_accounts` | Marketplace/store account such as Coupang Wing or Naver SmartStore. Operational channel ownership is distinct from the SaaS organization. |
| ChannelListing | `channel_listings` | 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등. |
| ChannelListingOption | `channel_listing_options` | 채널 listing 내 옵션 externalOptionId 와 내부 ProductOption 매핑. |
| LegalEntity | `legal_entities` | Legal/business entity under an organization. This stores tax, invoice, and settlement identity separately from the SaaS organization boundary. |
| MasterCodeCounter | `master_code_counters` | MasterProduct.code allocator. Prisma-owned replacement for the former PostgreSQL sequence. |
| MasterProduct | `master_products` | 기획상품 family. 같은 컨셉의 옵션들을 묶는 entity. 운영/광고/전략 단위. |
| MasterProductImage | `master_product_images` | MasterProduct 이미지 갤러리. Source of truth 이며 MasterProduct.imageUrl 은 대표 이미지 캐시로만 동기화된다. |
| Organization | `organizations` | - |
| OrganizationMembership | `organization_memberships` | B2B customer/workspace membership. A user may belong to multiple organizations; this row supplies request organization and role. |
| ProductOption | `product_options` | 물리 SKU. 바코드 1:1. 재고/매입/창고 단위. isBundle 이면 구성품 기반 계산. |
| User | `users` | human(직원) / agent(AI, agentDefinitionId 연결) / system(챗봇). 조직 소속은 OrganizationMembership 이 source of truth. |

## Mermaid ER Diagram

```mermaid
erDiagram
  BundleComponent {
    String id PK
    String bundleOptionId FK
    String componentOptionId FK
    String organizationId FK
    Int qty
    DateTime createdAt
    DateTime updatedAt
  }
  CategoryMapping {
    String id PK
    String organizationId FK
    String internalCategory
    String coupangCategoryId
    String coupangCategoryName
    String keywords
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelAccount {
    String id PK
    String organizationId FK
    String channel
    String name
    String externalAccountId
    String sellerId
    String vendorId
    String status
    Boolean isPrimary
    Json config
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListing {
    String id PK
    String masterId FK
    String organizationId FK
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
    String organizationId FK
    String externalOptionId
    String itemName
    Int salePrice
    Boolean isActive
    Boolean isUnmatched
    DateTime createdAt
    DateTime updatedAt
  }
  LegalEntity {
    String id PK
    String organizationId FK
    String name
    String businessNumber
    String countryCode
    String representativeName
    String address
    Boolean isPrimary
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  MasterCodeCounter {
    String key PK
    Int value
    DateTime updatedAt
  }
  MasterProduct {
    String id PK
    String organizationId FK
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
    String organizationId FK
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
  Organization {
    String id PK
    String name
    String slug UK
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  OrganizationMembership {
    String id PK
    String organizationId FK
    String userId FK
    String role
    String status
    String invitedById FK
    DateTime joinedAt
    DateTime lastSelectedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ProductOption {
    String id PK
    String masterId FK,UK
    String organizationId FK
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
  MasterProduct ||--o{ ChannelListing : "master"
  MasterProduct ||--o{ MasterProductImage : "master"
  MasterProduct ||--|| ProductOption : "master"
  Organization ||--o{ BundleComponent : "organization"
  Organization ||--o{ CategoryMapping : "organization"
  Organization ||--o{ ChannelAccount : "organization"
  Organization ||--o{ ChannelListing : "organization"
  Organization ||--o{ ChannelListingOption : "organization"
  Organization ||--o{ LegalEntity : "organization"
  Organization ||--o{ MasterProduct : "organization"
  Organization ||--o{ MasterProductImage : "organization"
  Organization ||--o{ OrganizationMembership : "organization"
  Organization ||--o{ ProductOption : "organization"
  ProductOption ||--o{ BundleComponent : "bundleOption"
  ProductOption ||--o{ BundleComponent : "componentOption"
  ProductOption o|--o{ ChannelListingOption : "option"
  User o|--o{ OrganizationMembership : "invitedBy"
  User ||--o{ OrganizationMembership : "user"
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
| MasterProduct | master | referenced by external | AI | ContentGeneration |
| MasterProduct | master | referenced by external | AI | ThumbnailAnalysis |
| MasterProduct | master | referenced by external | AI | ThumbnailGeneration |
| MasterProduct | master | referenced by external | Finance | GradeHistory |
| MasterProduct | master | referenced by external | Finance | ProcessingCost |
| MasterProduct | master | referenced by external | Supply | MasterSupplierProduct |
| Organization | organization | referenced by external | Advertising | AdAction |
| Organization | organization | referenced by external | Advertising | ExecutionWorker |
| Organization | organization | referenced by external | Advertising | ScrapeTarget |
| Organization | organization | referenced by external | Agents | AgentDefinition |
| Organization | organization | referenced by external | Agents | AgentEvent |
| Organization | organization | referenced by external | Agents | AgentWakeupRequest |
| Organization | organization | referenced by external | Agents | HeartbeatRun |
| Organization | organization | referenced by external | Agents | WorkflowTemplate |
| Organization | organization | referenced by external | AI | ContentGeneration |
| Organization | organization | referenced by external | AI | Thumbnail |
| Organization | organization | referenced by external | AI | ThumbnailAnalysis |
| Organization | organization | referenced by external | AI | ThumbnailGeneration |
| Organization | organization | referenced by external | AI | ThumbnailGenerationCandidate |
| Organization | organization | referenced by external | AI | ThumbnailGenerationInputImage |
| Organization | organization | referenced by external | AI | ThumbnailRegistrationAttempt |
| Organization | organization | referenced by external | AI | ThumbnailTracking |
| Organization | organization | referenced by external | Channels | ChannelAccountDailyKpiSnapshot |
| Organization | organization | referenced by external | Channels | ChannelAdTargetDailySnapshot |
| Organization | organization | referenced by external | Channels | ChannelListingDailySnapshot |
| Organization | organization | referenced by external | Channels | ChannelListingOptionDailySnapshot |
| Organization | organization | referenced by external | Channels | ChannelScrapeRun |
| Organization | organization | referenced by external | Channels | ChannelScrapeSnapshot |
| Organization | organization | referenced by external | Finance | GradeHistory |
| Organization | organization | referenced by external | Finance | ManualLedger |
| Organization | organization | referenced by external | Finance | ProcessingCost |
| Organization | organization | referenced by external | Finance | ProfitLoss |
| Organization | organization | referenced by external | Finance | SalesPlan |
| Organization | organization | referenced by external | Inventory | Inventory |
| Organization | organization | referenced by external | Inventory | PickingList |
| Organization | organization | referenced by external | Inventory | ReturnTransfer |
| Organization | organization | referenced by external | Inventory | StockAudit |
| Organization | organization | referenced by external | Inventory | StockTransaction |
| Organization | organization | referenced by external | Inventory | StockTransfer |
| Organization | organization | referenced by external | Inventory | Warehouse |
| Organization | organization | referenced by external | Orders | CSRecord |
| Organization | organization | referenced by external | Orders | Order |
| Organization | organization | referenced by external | Orders | OrderLineItem |
| Organization | organization | referenced by external | Orders | OrderReturn |
| Organization | organization | referenced by external | Orders | OrderReturnLineItem |
| Organization | organization | referenced by external | Orders | Review |
| Organization | organization | referenced by external | Orders | Settlement |
| Organization | organization | referenced by external | Orders | Shipment |
| Organization | organization | referenced by external | Orders | UnshippedItem |
| Organization | organization | referenced by external | Supply | PurchaseOrder |
| Organization | organization | referenced by external | Supply | Supplier |
| Organization | organization | referenced by external | Supply | SupplierPayment |
| Organization | organization | referenced by external | System | ActionTask |
| Organization | organization | referenced by external | System | ActivityEvent |
| Organization | organization | referenced by external | System | Alert |
| Organization | organization | referenced by external | System | BusinessRule |
| Organization | organization | referenced by external | System | SystemSetting |
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
