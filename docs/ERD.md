# Database ERD

> Generated from `prisma/models/*.prisma`. Do not edit the diagram by hand.
> Regenerate this file with `npm run db:erd` after Prisma schema changes.
> When committing schema navigation artifacts, run `npm run graphify:schema` as well.

This ERD is a development-time navigation aid. The source of truth is the Prisma schema under `prisma/`.

## Sources

- `prisma/models/advertising.prisma`
- `prisma/models/agents.prisma`
- `prisma/models/ai.prisma`
- `prisma/models/channels.prisma`
- `prisma/models/core.prisma`
- `prisma/models/finance.prisma`
- `prisma/models/inventory.prisma`
- `prisma/models/orders.prisma`
- `prisma/models/supply.prisma`
- `prisma/models/system.prisma`

## Domain ERDs

| Domain | Models |
|---|---:|
| [Advertising](erd/advertising.md) | 5 |
| [AgentOS](erd/agentos.md) | 15 |
| [AI](erd/ai.md) | 8 |
| [Channels](erd/channels.md) | 8 |
| [Core](erd/core.md) | 13 |
| [Finance](erd/finance.md) | 5 |
| [Inventory](erd/inventory.md) | 8 |
| [Orders](erd/orders.md) | 9 |
| [Supply](erd/supply.md) | 6 |
| [System](erd/system.md) | 8 |

## Model Index

| Model | Domain | Table | Description |
|---|---:|---|---|
| AdAction | Advertising | `ad_actions` | 광고 자동 실행 큐. ChannelAdTargetDailySnapshot→AdAction→ExecutionTask→ExecutionLog 파이프라인. |
| ExecutionLog | Advertising | `execution_logs` | - |
| ExecutionTask | Advertising | `execution_tasks` | - |
| ExecutionWorker | Advertising | `execution_workers` | - |
| ScrapeTarget | Advertising | `scrape_targets` | - |
| AgentApprovalRequest | AgentOS | `agent_approval_requests` | Human approval state. While pending, AgentRunRequest.status = requires_approval. |
| AgentAuthorizationEvent | AgentOS | `agent_authorization_events` | Authorization audit. Logged before, during, and outside runs (eg. admin policy widening). |
| AgentBlueprint | AgentOS | `agent_blueprints` | Global catalog template for an agent kind. Replaces the global side of the legacy AgentDefinition. |
| AgentBlueprintToolPolicy | AgentOS | `agent_blueprint_tool_policies` | Default tool policy at the blueprint level (allow / deny / approval_required). |
| AgentCostEvent | AgentOS | `agent_cost_events` | Cost ledger source of truth. Insert + AgentRuntimeState aggregate update share one transaction. |
| AgentInstance | AgentOS | `agent_instances` | Organization-owned runnable subject. Replaces the tenant-owned side of legacy AgentDefinition. |
| AgentInstanceToolPolicy | AgentOS | `agent_instance_tool_policies` | Per-instance override for tool policy. Resolution: instance overrides blueprint, deny wins. |
| AgentRun | AgentOS | `agent_runs` | Accepted execution attempt. Replaces HeartbeatRun. Always starts at status="running"; queue state lives on AgentRunRequest. |
| AgentRunEvent | AgentOS | `agent_run_events` | Run-local event timeline (status, tool, model, safety, fallback). Bulk logs go to external store via logRef. |
| AgentRunRequest | AgentOS | `agent_run_requests` | Durable request inbox + queue + dedupe + audit. Replaces AgentWakeupRequest. Queue state lives here, not on AgentRun. |
| AgentRuntimeState | AgentOS | `agent_runtime_states` | Frequently-changing per-instance runtime state (last run, totals, cached aggregates). 1:1 with AgentInstance. |
| AgentTaskSession | AgentOS | `agent_task_sessions` | Per-task durable session. taskKey defaults to "default" only at API boundary. |
| AgentToolDefinition | AgentOS | `agent_tool_definitions` | Catalog of business tools agents may invoke. KidItem ships a curated set; not a generic HTTP/DB tool marketplace. |
| WorkflowRun | AgentOS | `workflow_runs` | Workflow run record. Workflow runner triggers Agent OS via AgentRunnerPort with sourceWorkflowRunId. |
| WorkflowTemplate | AgentOS | `workflow_templates` | Workflow definition. Trigger config + nodes/edges. |
| ContentGeneration | AI | `content_generations` | - |
| Thumbnail | AI | `thumbnails` | CTR 기반 썸네일 트래킹 (ThumbnailAnalysis 와 별도 시스템). |
| ThumbnailAnalysis | AI | `thumbnail_analyses` | 5차원 scores(heroShot·composition·branding·mobile·differentiation) + complianceGrade(PASS/WARN/FAIL) + imageSpec(사전검수). 스펙 FAIL 시 AI 호출 생략. |
| ThumbnailGeneration | AI | `thumbnail_generations` | 상태: pending→generating→ready/failed→applied/skipped. method=edit 만 사용 (generate Imagen 방식 삭제됨). |
| ThumbnailGenerationCandidate | AI | `thumbnail_generation_candidates` | 썸네일 생성 후보 이미지. 바이너리는 object storage 에 저장하고 DB 는 URL/key 메타데이터만 보관한다. |
| ThumbnailGenerationInputImage | AI | `thumbnail_generation_input_images` | 썸네일 편집/생성 입력 이미지. base64 원문 대신 object storage 참조와 역할 메타데이터만 저장한다. |
| ThumbnailRegistrationAttempt | AI | `thumbnail_registration_attempts` | Wing 등 외부 채널 등록 시도 이력. 마지막 상태만 덮어쓰지 않고 재시도/실패 원인을 보존한다. |
| ThumbnailTracking | AI | `thumbnail_trackings` | - |
| ChannelAccountDailyKpiSnapshot | Channels | `channel_account_daily_kpi_snapshots` | 채널 계정/스토어 단위 KPI 일별 정규화 fact (listing 에 귀속되지 않는 dashboard KPI 용). |
| ChannelAdTargetDailySnapshot | Channels | `channel_ad_target_daily_snapshots` | 채널 광고 타겟(캠페인/키워드/상품)의 일별 정규화 fact. 기간 view 는 SUM 으로 derive. |
| ChannelListingDailySnapshot | Channels | `channel_listing_daily_snapshots` | 채널 listing 의 일별 정규화 상태. 반복 scrape 는 businessDate row 를 upsert. |
| ChannelListingOptionDailySnapshot | Channels | `channel_listing_option_daily_snapshots` | 채널 listing option/vendor item 의 일별 정규화 상태. |
| ChannelReconciliationItem | Channels | `channel_reconciliation_items` | 사용자가 처리하는 채널-내부 상품 매칭 queue. MasterProduct 자동 생성 없이 기존 ProductOption/ChannelListing 연결만 추적. |
| ChannelReconciliationRun | Channels | `channel_reconciliation_runs` | 채널-KidItem 상품 매칭 스캔 실행 이력. 실제 연결 source of truth 는 ChannelListing / ChannelListingOption. |
| ChannelScrapeRun | Channels | `channel_scrape_runs` | 채널별 상품/광고/트래픽 스크래핑 실행 단위. 원본 row 는 ChannelScrapeSnapshot 에 저장. |
| ChannelScrapeSnapshot | Channels | `channel_scrape_snapshots` | 채널 스크래퍼/API 가 본 원본 row. 매칭 실패/파서 변경 대비 rawJson 을 보존. |
| BundleComponent | Core | `bundle_components` | 세트 옵션의 구성품 관계. bundleOption(isBundle=true) ↔ componentOption. Cross-master 허용, cross-organization 금지. |
| CategoryMapping | Core | `category_mappings` | - |
| ChannelAccount | Core | `channel_accounts` | Marketplace/store account such as Coupang Wing or Naver SmartStore. Operational channel ownership is distinct from the SaaS organization. |
| ChannelListing | Core | `channel_listings` | 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등. |
| ChannelListingOption | Core | `channel_listing_options` | 채널 listing 내 옵션 externalOptionId 와 내부 ProductOption 매핑. |
| LegalEntity | Core | `legal_entities` | Legal/business entity under an organization. This stores tax, invoice, and settlement identity separately from the SaaS organization boundary. |
| MasterCodeCounter | Core | `master_code_counters` | MasterProduct.code allocator. Prisma-owned replacement for the former PostgreSQL sequence. |
| MasterProduct | Core | `master_products` | 기획상품 family. 같은 컨셉의 옵션들을 묶는 entity. 운영/광고/전략 단위. |
| MasterProductImage | Core | `master_product_images` | MasterProduct 이미지 갤러리. Source of truth 이며 MasterProduct.imageUrl 은 대표 이미지 캐시로만 동기화된다. |
| Organization | Core | `organizations` | - |
| OrganizationMembership | Core | `organization_memberships` | B2B customer/workspace membership. A user may belong to multiple organizations; this row supplies request organization and role. |
| ProductOption | Core | `product_options` | 물리 SKU. 바코드 1:1. 재고/매입/창고 단위. isBundle 이면 구성품 기반 계산. |
| User | Core | `users` | human(직원) / agent(AI, agentInstanceId 연결) / system(챗봇). 조직 소속은 OrganizationMembership 이 source of truth. |
| GradeHistory | Finance | `grade_histories` | ABC 등급 변경 추적. |
| ManualLedger | Finance | `manual_ledgers` | 자동 집계 외 수기 수입/지출. |
| ProcessingCost | Finance | `processing_costs` | - |
| ProfitLoss | Finance | `profit_loss` | 월간 손익. organizationId+listingId+year+month unique. |
| SalesPlan | Finance | `sales_plans` | - |
| Inventory | Inventory | `inventory` | ProductOption 에 1:1. Bundle option 은 inventory 미생성 (availableStock 계산값 사용). |
| PickingItem | Inventory | `picking_items` | - |
| PickingList | Inventory | `picking_lists` | - |
| ReturnTransfer | Inventory | `return_transfers` | - |
| StockAudit | Inventory | `stock_audits` | - |
| StockTransaction | Inventory | `stock_transactions` | - |
| StockTransfer | Inventory | `stock_transfers` | 창고 간 이동 (from → to warehouse). |
| Warehouse | Inventory | `warehouses` | - |
| CSRecord | Orders | `cs_records` | - |
| Order | Orders | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderLineItem | Orders | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| OrderReturn | Orders | `order_returns` | 채널-agnostic 반품 aggregate. 반품 item 은 OrderReturnLineItem 으로 정규화. type=RETURN/EXCHANGE 구분 first-class. |
| OrderReturnLineItem | Orders | `order_return_line_items` | 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. return FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | Orders | `reviews` | - |
| Settlement | Orders | `settlements` | 월별 정산 (예상 vs 실제 비교). |
| Shipment | Orders | `shipments` | - |
| UnshippedItem | Orders | `unshipped_items` | - |
| MasterSupplierProduct | Supply | `master_supplier_products` | Master 단위 주공급처 정책. 여러 supplier 후보 중 isPrimary 가 기본. |
| PurchaseOrder | Supply | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | Supply | `purchase_order_items` | - |
| Supplier | Supply | `suppliers` | - |
| SupplierPayment | Supply | `supplier_payments` | - |
| SupplierProduct | Supply | `supplier_products` | 공급사별 SKU(옵션) 단위 공급가 관리. |
| ActionTask | System | `action_tasks` | 액션 보드 (수동 할일 관리). |
| ActivityEvent | System | `activity_events` | - |
| Alert | System | `alerts` | - |
| BusinessRule | System | `business_rules` | 온톨로지 룰 엔진 (조건→액션 자동화). |
| FeatureGate | System | `feature_gates` | 피처 플래그. allowedOrganizations: string[] 로 회사별 enable. |
| Marketplace | System | `marketplace` | type 으로 agent/workflow 카탈로그 통합. |
| MigrationCheckpoint | System | `migration_checkpoints` | 이관 스크립트 체크포인트 (Plan C 용). 이관 완료 후 drop 가능. |
| SystemSetting | System | `system_settings` | - |

## Mermaid ER Diagram

```mermaid
erDiagram
  ActionTask {
    String id PK
    String organizationId FK
    String taskKey
    String type
    String label
    String detail
    String where
    String href
    String priority
    String status
    String role
    Json apiCall
    Json result
    Json notes
    Json activityLog
    DateTime date
    String assigneeUserId FK
    String targetType
    String targetId
    DateTime createdAt
    DateTime updatedAt
  }
  ActivityEvent {
    String id PK
    String organizationId FK
    String objectType
    String objectId
    String eventType
    String source
    String title
    Json data
    DateTime createdAt
  }
  AdAction {
    String id PK
    String organizationId FK
    String listingId FK
    String adTargetDailyId FK
    String actionType
    String targetType
    String externalId
    String targetLabel
    String reason
    String priority
    Int currentValue
    Int proposedValue
    Json payload
    String approvalStatus
    String executeStatus
    Json beforeJson
    Json afterJson
    String errorMessage
    DateTime approvedAt
    DateTime executedAt
    DateTime createdAt
  }
  AgentApprovalRequest {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String status
    String reasonCode
    String reason
    String prompt
    Json payload
    Json actionSnapshot
    String requestedByActorType
    String requestedByActorId
    String requestedByUserId FK
    String approverUserId FK
    String decidedByUserId FK
    DateTime decidedAt
    String decisionReason
    DateTime expiresAt
    DateTime createdAt
    DateTime updatedAt
  }
  AgentAuthorizationEvent {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String toolId FK
    String actorType
    String actorId
    String action
    String decision
    String reasonCode
    String reason
    String resourceType
    String resourceId
    Json policySnapshot
    String requestedByUserId FK
    String decidedByUserId FK
    DateTime createdAt
  }
  AgentBlueprint {
    String id PK
    String type UK
    String name
    String description
    String promptPath
    String defaultAdapterType
    String defaultModel
    Json defaultRuntimeConfig
    Json defaultCapabilities
    String catalogStatus
    String marketplaceId FK
    DateTime createdAt
    DateTime updatedAt
  }
  AgentBlueprintToolPolicy {
    String id PK
    String blueprintId FK
    String toolId FK
    String effect
    String approvalMode
    String dryRunMode
    Json constraints
    DateTime createdAt
    DateTime updatedAt
  }
  AgentCostEvent {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String provider
    String model
    String biller
    String billingType
    Int inputTokens
    Int outputTokens
    Int cachedInputTokens
    BigInt costMicros
    Json metadata
    DateTime occurredAt
    DateTime createdAt
  }
  AgentInstance {
    String id PK
    String organizationId FK
    String blueprintId FK
    String type
    String name
    String role
    String title
    String icon
    String reportsToId FK
    String lifecycleStatus
    String pauseReason
    DateTime pausedAt
    Int trustLevel
    String adapterType
    String modelOverride
    Json adapterConfig
    Json runtimeConfig
    String promptPathOverride
    DateTime createdAt
    DateTime updatedAt
  }
  AgentInstanceToolPolicy {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String toolId FK
    String effect
    String approvalMode
    String dryRunMode
    Json constraints
    DateTime createdAt
    DateTime updatedAt
  }
  AgentRun {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String requestId FK
    String taskSessionId FK
    String retryOfRunId FK
    String status
    Int attempt
    String invocationSource
    String adapterType
    String model
    String provider
    String taskKey
    String sessionDisplayBefore
    String sessionDisplayAfter
    Json input
    Json output
    DateTime startedAt
    DateTime finishedAt
    DateTime heartbeatAt
    Int exitCode
    String signal
    String errorCode
    String errorMessage
    Json usageJson
    Json resultJson
    String logStore
    String logRef
    String logSha256
    BigInt logBytes
    Boolean logCompressed
    String stdoutExcerpt
    String stderrExcerpt
    Int lastEventSeq
    DateTime createdAt
    DateTime updatedAt
  }
  AgentRunEvent {
    String id PK
    String organizationId FK
    String runId FK
    String agentInstanceId FK
    Int seq
    String type
    String level
    String stream
    String message
    Json data
    String logRef
    DateTime createdAt
  }
  AgentRunRequest {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String taskSessionId FK
    String source
    String triggerDetail
    String reason
    String idempotencyKey
    Int priority
    String sourceWorkflowRunId FK
    String sourceWorkflowNodeId
    String sourceResourceType
    String sourceResourceId
    String requestedByUserId FK
    String requestedByActorType
    String requestedByActorId
    Json payload
    String status
    DateTime scheduledFor
    DateTime claimedAt
    String claimedBy
    Int attempts
    Int maxAttempts
    DateTime finishedAt
    String coalescedIntoRequestId FK
    String lastErrorCode
    String lastErrorMessage
    DateTime createdAt
    DateTime updatedAt
  }
  AgentRuntimeState {
    String id PK
    String organizationId FK
    String agentInstanceId FK,UK
    String lastRunId FK
    String lastRunStatus
    String lastError
    DateTime lastHeartbeatAt
    Int consecutiveFailureCount
    Int totalRuns
    Int totalInputTokens
    Int totalOutputTokens
    BigInt totalCostMicros
    Json stateJson
    DateTime createdAt
    DateTime updatedAt
  }
  AgentTaskSession {
    String id PK
    String organizationId FK
    String agentInstanceId FK
    String adapterType
    String taskKey
    String title
    Json metadata
    Json sessionParams
    String sessionDisplay
    String lastRunId FK
    String lastError
    DateTime createdAt
    DateTime updatedAt
  }
  AgentToolDefinition {
    String id PK
    String key UK
    String name
    String description
    String riskLevel
    String credentialKind
    Json inputSchemaJson
    Json outputSchemaJson
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  Alert {
    String id PK
    String organizationId FK
    String targetType
    String targetId
    String kind
    String status
    String type
    String severity
    String title
    String message
    Boolean isRead
    DateTime readAt
    String operationKey
    String sourceType
    String sourceId
    String actorUserId FK
    String href
    Float progress
    Json metadata
    String actionTaskId FK
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  BundleComponent {
    String id PK
    String bundleOptionId FK
    String componentOptionId FK
    String organizationId FK
    Int qty
    DateTime createdAt
    DateTime updatedAt
  }
  BusinessRule {
    String id PK
    String organizationId FK
    String name
    String displayName
    String description
    String category
    String severity
    String field
    String operator
    Json threshold
    String messageTemplate
    String actionType
    Json conditions
    Boolean autoExecute
    Boolean active
    Int sortOrder
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
  ChannelAccountDailyKpiSnapshot {
    String id PK
    String organizationId FK
    String channel
    String source
    String kpiType
    DateTime businessDate
    DateTime periodStart
    DateTime periodEnd
    Json normalizedJson
    Json rawJson
    String rawSnapshotId FK
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelAdTargetDailySnapshot {
    String id PK
    String organizationId FK
    String channel
    DateTime businessDate
    String listingId FK
    String listingOptionId FK
    String optionId FK
    String externalId
    String externalOptionId
    String targetType
    String targetKey
    String campaignId
    String campaignName
    String adGroup
    String keyword
    String placement
    String status
    String onOff
    Int currentBid
    Int dailyBudget
    Int spend
    Int revenue
    Int impressions
    Int clicks
    Int conversions
    Int orders
    Int adSpend
    Int adRevenue
    String rawSnapshotId FK
    Json metaJson
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
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
  ChannelListingDailySnapshot {
    String id PK
    String organizationId FK
    String listingId FK
    String channel
    String externalId
    DateTime businessDate
    String productName
    String status
    String exposureStatus
    String saleStatus
    Int channelPrice
    Int reviewCount
    Decimal avgRating
    Boolean isOfferWinner
    Int myPrice
    Int winnerPrice
    Int winnerGapPrice
    Int productRank
    Int categoryRank
    Int adSpend
    Int adRevenue
    Int adImpressions
    Int adClicks
    Int adConversions
    Int adOrders
    Int adDirectOrders1d
    Int adIndirectOrders1d
    Int adDirectQty1d
    Int adIndirectQty1d
    Int adDirectRevenue1d
    Int adIndirectRevenue1d
    Int adTotalOrders14d
    Int adDirectOrders14d
    Int adIndirectOrders14d
    Int adTotalQty14d
    Int adDirectQty14d
    Int adIndirectQty14d
    Int adTotalRevenue14d
    Int adDirectRevenue14d
    Int adIndirectRevenue14d
    Int trafficVisitors
    Int trafficViews
    Int trafficCartAdds
    Int trafficOrders
    Int trafficSalesQty
    Int trafficRevenue
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
    String rawSnapshotId FK
    Json metaJson
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
  ChannelListingOptionDailySnapshot {
    String id PK
    String organizationId FK
    String listingId FK
    String listingOptionId FK
    String optionId FK
    String channel
    String externalId
    String externalOptionId
    DateTime businessDate
    String optionName
    Int salePrice
    Int stockQty
    String saleStatus
    Boolean isActive
    Boolean isOfferWinner
    Int myPrice
    Int winnerPrice
    Int winnerGapPrice
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
    String rawSnapshotId FK
    Json metaJson
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelReconciliationItem {
    String id PK
    String organizationId FK
    String lastSeenRunId FK
    String channel
    String source
    String itemType
    String itemKey
    String status
    String externalId
    String externalOptionId
    String legacyCode
    String channelProductName
    String channelOptionName
    String channelImageUrl
    String channelUrl
    String channelStatus
    String linkedListingId
    String linkedListingOptionId
    String linkedMasterProductId
    String linkedProductOptionId
    String matchReason
    String resolutionSource
    Int confidence
    Json rawJson
    Json normalizedJson
    Json conflictJson
    DateTime resolvedAt
    String resolvedByUserId
    String ignoredReason
    DateTime firstObservedAt
    DateTime lastObservedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelReconciliationRun {
    String id PK
    String organizationId FK
    String channel
    String source
    String status
    Int totalCount
    Int alreadyLinkedCount
    Int autoLinkedCount
    Int needsReviewCount
    Int conflictCount
    Int ignoredCount
    Int errorCount
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
    Json metaJson
    Json errorJson
  }
  ChannelScrapeRun {
    String id PK
    String organizationId FK
    String channel
    String source
    String pageType
    DateTime businessDate
    DateTime periodStart
    DateTime periodEnd
    String status
    String targetUrl
    String period
    String parserVersion
    Int rowCount
    Int matchedCount
    Int unmatchedCount
    Int errorCount
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
    Json metaJson
    Json errorJson
  }
  ChannelScrapeSnapshot {
    String id PK
    String organizationId FK
    String scrapeRunId FK
    String channel
    String source
    String pageType
    DateTime businessDate
    DateTime observedAt
    String externalId
    String externalOptionId
    String listingId FK
    String listingOptionId FK
    String optionId FK
    String matchStatus
    String matchReason
    String rowHash
    Json rawJson
    Json normalizedJson
    DateTime createdAt
  }
  ContentGeneration {
    String id PK
    String organizationId FK
    String masterId FK
    Json originalImages
    Json processedImages
    String generatedTitle
    String generatedDescription
    String generatedCopy
    String detailPageHtml
    String status
    Int retryCount
    String errorMessage
    String triggeredByUserId FK
    DateTime createdAt
    DateTime updatedAt
  }
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
  ExecutionLog {
    String id PK
    String taskId FK
    String level
    String step
    String message
    Json payloadJson
    DateTime createdAt
  }
  ExecutionTask {
    String id PK
    String actionId FK
    String workerId FK
    String status
    DateTime leasedAt
    DateTime startedAt
    DateTime finishedAt
    Int attempt
    Json beforeJson
    Json afterJson
    String errorMessage
    String screenshotPath
    DateTime createdAt
  }
  ExecutionWorker {
    String id PK
    String organizationId FK
    String workerKey UK
    String label
    String status
    String currentTaskRef
    String currentUrl
    String currentPageType
    Json metaJson
    DateTime lastHeartbeatAt
    DateTime createdAt
  }
  FeatureGate {
    String id PK
    String name UK
    String description
    Boolean enabled
    StringArray allowedOrganizations
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  GradeHistory {
    String id PK
    String organizationId FK
    String masterId FK
    String oldGrade
    String newGrade
    Decimal score
    Decimal revenueScore
    Decimal marginScore
    Decimal velocityScore
    String reason
    DateTime calculatedAt
  }
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
  ManualLedger {
    String id PK
    String organizationId FK
    DateTime date
    String type
    String category
    String counterpart
    String description
    Int amount
    Int tax
    String memo
    String createdBy
    DateTime createdAt
  }
  Marketplace {
    String id PK
    String type
    String name
    String description
    String category
    String icon
    String module
    Json nodesJson
    Json edgesJson
    String role
    String adapterType
    String promptTemplate
    StringArray skills
    Json permissions
    Json configurableParams
    Int version
    Int installCount
    Boolean isPublished
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
  MigrationCheckpoint {
    String id PK
    String scriptName
    String stepName
    String entityKey
    String status
    String error
    Json payload
    DateTime createdAt
    DateTime updatedAt
  }
  Order {
    String id PK
    String organizationId FK
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
    String productName
    Int quantity
    Json metadata
    DateTime createdAt
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
  ProcessingCost {
    String id PK
    String organizationId FK
    String masterId FK
    String productName
    String vendor
    String processType
    Int unitCost
    Int quantity
    Int totalCost
    DateTime date
    String status
    String notes
    DateTime createdAt
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
  ProfitLoss {
    String id PK
    String organizationId FK
    String listingId FK
    Int year
    Int month
    Int revenue
    Int cogs
    Int commission
    Int shippingCost
    Int adCost
    Int otherCost
    Int netProfit
    Decimal profitRate
    Int orderCount
    Int returnCount
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
    String orderId FK
    String optionId FK
    String productName
    Int quantity
    Decimal unitPriceCny
    DateTime createdAt
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
  SalesPlan {
    String id PK
    String organizationId FK
    String period
    Int targetRevenue
    Int targetOrders
    Int targetProfit
    Int actualRevenue
    Int actualOrders
    Int actualProfit
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
  ScrapeTarget {
    String id PK
    String organizationId FK
    String url
    String label
    String category
    Boolean isActive
    DateTime lastScrapedAt
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
    String supplierId FK
    String optionId FK
    Int supplyPrice
    Int minOrderQty
    DateTime createdAt
    DateTime updatedAt
  }
  SystemSetting {
    String id PK
    String organizationId FK
    String key
    Json value
    DateTime createdAt
    DateTime updatedAt
  }
  Thumbnail {
    String id PK
    String organizationId FK
    String listingId FK
    String imageUrl
    String strategy
    String status
    Decimal ctr
    Decimal prevClickRate
    Int impressions
    Int clicks
    DateTime measuredAt
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailAnalysis {
    String id PK
    String organizationId FK
    String masterId FK,UK
    String imageUrl
    Int overallScore
    String grade
    Json scores
    Json issues
    Json suggestions
    String method
    String complianceGrade
    Json complianceScores
    Json imageSpec
    Json recompose
    DateTime qualityAnalyzedAt
    DateTime complianceAnalyzedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailGeneration {
    String id PK
    String organizationId FK
    String masterId FK
    String originalUrl
    String selectedUrl
    String status
    String phase
    String grade
    Int score
    String prompt
    String method
    Json editAnalysis
    Json inputMeta
    Int inputMetaVersion
    String errorMessage
    Int attemptCount
    String triggeredByUserId FK
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailGenerationCandidate {
    String id PK
    String organizationId FK
    String generationId FK
    String url
    String storageKey
    String filename
    Int sortOrder
    String mimeType
    Int width
    Int height
    Int fileSize
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailGenerationInputImage {
    String id PK
    String organizationId FK
    String generationId FK
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
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailRegistrationAttempt {
    String id PK
    String organizationId FK
    String generationId FK
    String status
    String errorMessage
    String screenshotUrl
    String externalId
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailTracking {
    String id PK
    String organizationId FK
    String listingId FK
    String generationId FK
    String originalGrade
    Int originalScore
    DateTime appliedAt
    Float ctrBefore
    Float ctrAfter
    Int reviewsBefore
    Int reviewsAfter
    Int salesBefore
    Int salesAfter
    String status
    DateTime createdAt
    DateTime updatedAt
  }
  UnshippedItem {
    String id PK
    String organizationId FK
    String orderId FK
    String listingId FK
    String optionId FK
    String productName
    Int quantity
    DateTime orderDate
    Int delayDays
    String reason
    Boolean isNotified
    DateTime notifiedAt
    DateTime createdAt
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
    String agentInstanceId FK
    Boolean isActive
    DateTime lastLoginAt
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
  WorkflowRun {
    String id PK
    String organizationId
    String templateId FK
    String status
    String triggeredBy
    String triggeredByUserId FK
    Json contextData
    Json steps
    String error
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  WorkflowTemplate {
    String id PK
    String organizationId FK
    String name
    String description
    String module
    Boolean isActive
    String triggerType
    String schedule
    Json nodesJson
    Json edgesJson
    Int version
    DateTime createdAt
    DateTime updatedAt
    String marketplaceId FK
  }
  ActionTask o|--o{ Alert : "actionTask"
  AdAction ||--o{ ExecutionTask : "action"
  AgentBlueprint ||--o{ AgentBlueprintToolPolicy : "blueprint"
  AgentBlueprint ||--o{ AgentInstance : "blueprint"
  AgentInstance ||--o{ AgentApprovalRequest : "agentInstance"
  AgentInstance ||--o{ AgentAuthorizationEvent : "agentInstance"
  AgentInstance ||--o{ AgentCostEvent : "agentInstance"
  AgentInstance o|--o{ AgentInstance : "parent"
  AgentInstance ||--o{ AgentInstanceToolPolicy : "agentInstance"
  AgentInstance ||--o{ AgentRun : "agentInstance"
  AgentInstance ||--o{ AgentRunEvent : "agentInstance"
  AgentInstance ||--o{ AgentRunRequest : "agentInstance"
  AgentInstance ||--|| AgentRuntimeState : "agentInstance"
  AgentInstance ||--o{ AgentTaskSession : "agentInstance"
  AgentInstance o|--o{ User : "agentInstance"
  AgentRun o|--o{ AgentApprovalRequest : "run"
  AgentRun o|--o{ AgentAuthorizationEvent : "run"
  AgentRun ||--o{ AgentCostEvent : "run"
  AgentRun o|--o{ AgentRun : "retryOfRun"
  AgentRun ||--o{ AgentRunEvent : "run"
  AgentRun o|--o{ AgentRuntimeState : "lastRun"
  AgentRun o|--o{ AgentTaskSession : "lastRun"
  AgentRunRequest ||--o{ AgentApprovalRequest : "request"
  AgentRunRequest o|--o{ AgentAuthorizationEvent : "request"
  AgentRunRequest ||--o{ AgentCostEvent : "request"
  AgentRunRequest ||--o{ AgentRun : "request"
  AgentRunRequest o|--o{ AgentRunRequest : "coalescedIntoRequest"
  AgentTaskSession ||--o{ AgentRun : "taskSession"
  AgentTaskSession ||--o{ AgentRunRequest : "taskSession"
  AgentToolDefinition o|--o{ AgentAuthorizationEvent : "tool"
  AgentToolDefinition ||--o{ AgentBlueprintToolPolicy : "tool"
  AgentToolDefinition ||--o{ AgentInstanceToolPolicy : "tool"
  ChannelAdTargetDailySnapshot o|--o{ AdAction : "adTargetDaily"
  ChannelListing o|--o{ AdAction : "listing"
  ChannelListing o|--o{ ChannelAdTargetDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingOption : "listing"
  ChannelListing ||--o{ ChannelListingOptionDailySnapshot : "listing"
  ChannelListing o|--o{ ChannelScrapeSnapshot : "listing"
  ChannelListing o|--o{ CSRecord : "listing"
  ChannelListing o|--o{ Order : "listing"
  ChannelListing ||--o{ ProfitLoss : "listing"
  ChannelListing o|--o{ Review : "listing"
  ChannelListing o|--o{ Shipment : "listing"
  ChannelListing ||--o{ Thumbnail : "listing"
  ChannelListing ||--o{ ThumbnailTracking : "listing"
  ChannelListing o|--o{ UnshippedItem : "listing"
  ChannelListingOption o|--o{ ChannelAdTargetDailySnapshot : "listingOption"
  ChannelListingOption ||--o{ ChannelListingOptionDailySnapshot : "listingOption"
  ChannelListingOption o|--o{ ChannelScrapeSnapshot : "listingOption"
  ChannelListingOption o|--o{ OrderLineItem : "listingOption"
  ChannelReconciliationRun o|--o{ ChannelReconciliationItem : "lastSeenRun"
  ChannelScrapeRun o|--o{ ChannelScrapeSnapshot : "scrapeRun"
  ChannelScrapeSnapshot o|--o{ ChannelAccountDailyKpiSnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelAdTargetDailySnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelListingDailySnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelListingOptionDailySnapshot : "rawSnapshot"
  ExecutionTask ||--o{ ExecutionLog : "task"
  ExecutionWorker o|--o{ ExecutionTask : "worker"
  Marketplace o|--o{ AgentBlueprint : "marketplace"
  Marketplace o|--o{ WorkflowTemplate : "marketplace"
  MasterProduct ||--o{ ChannelListing : "master"
  MasterProduct ||--o{ ContentGeneration : "master"
  MasterProduct ||--o{ GradeHistory : "master"
  MasterProduct ||--o{ MasterProductImage : "master"
  MasterProduct ||--o{ MasterSupplierProduct : "master"
  MasterProduct ||--o{ ProcessingCost : "master"
  MasterProduct ||--|| ProductOption : "master"
  MasterProduct ||--|| ThumbnailAnalysis : "master"
  MasterProduct ||--o{ ThumbnailGeneration : "master"
  Order o|--o{ CSRecord : "order"
  Order ||--o{ OrderLineItem : "order"
  Order o|--o{ OrderReturn : "order"
  Order o|--o{ Shipment : "order"
  Order ||--o{ UnshippedItem : "order"
  OrderLineItem o|--o{ OrderReturnLineItem : "orderLineItem"
  OrderReturn ||--o{ OrderReturnLineItem : "return"
  Organization ||--o{ ActionTask : "organization"
  Organization ||--o{ ActivityEvent : "organization"
  Organization ||--o{ AdAction : "organization"
  Organization ||--o{ AgentApprovalRequest : "organization"
  Organization ||--o{ AgentAuthorizationEvent : "organization"
  Organization ||--o{ AgentCostEvent : "organization"
  Organization ||--o{ AgentInstance : "organization"
  Organization ||--o{ AgentInstanceToolPolicy : "organization"
  Organization ||--o{ AgentRun : "organization"
  Organization ||--o{ AgentRunEvent : "organization"
  Organization ||--o{ AgentRunRequest : "organization"
  Organization ||--o{ AgentRuntimeState : "organization"
  Organization ||--o{ AgentTaskSession : "organization"
  Organization ||--o{ Alert : "organization"
  Organization ||--o{ BundleComponent : "organization"
  Organization ||--o{ BusinessRule : "organization"
  Organization ||--o{ CategoryMapping : "organization"
  Organization ||--o{ ChannelAccount : "organization"
  Organization ||--o{ ChannelAccountDailyKpiSnapshot : "organization"
  Organization ||--o{ ChannelAdTargetDailySnapshot : "organization"
  Organization ||--o{ ChannelListing : "organization"
  Organization ||--o{ ChannelListingDailySnapshot : "organization"
  Organization ||--o{ ChannelListingOption : "organization"
  Organization ||--o{ ChannelListingOptionDailySnapshot : "organization"
  Organization ||--o{ ChannelReconciliationItem : "organization"
  Organization ||--o{ ChannelReconciliationRun : "organization"
  Organization ||--o{ ChannelScrapeRun : "organization"
  Organization ||--o{ ChannelScrapeSnapshot : "organization"
  Organization ||--o{ ContentGeneration : "organization"
  Organization ||--o{ CSRecord : "organization"
  Organization ||--o{ ExecutionWorker : "organization"
  Organization ||--o{ GradeHistory : "organization"
  Organization ||--o{ Inventory : "organization"
  Organization ||--o{ LegalEntity : "organization"
  Organization ||--o{ ManualLedger : "organization"
  Organization ||--o{ MasterProduct : "organization"
  Organization ||--o{ MasterProductImage : "organization"
  Organization ||--o{ Order : "organization"
  Organization ||--o{ OrderLineItem : "organization"
  Organization ||--o{ OrderReturn : "organization"
  Organization ||--o{ OrderReturnLineItem : "organization"
  Organization ||--o{ OrganizationMembership : "organization"
  Organization ||--o{ PickingList : "organization"
  Organization ||--o{ ProcessingCost : "organization"
  Organization ||--o{ ProductOption : "organization"
  Organization ||--o{ ProfitLoss : "organization"
  Organization ||--o{ PurchaseOrder : "organization"
  Organization ||--o{ ReturnTransfer : "organization"
  Organization ||--o{ Review : "organization"
  Organization ||--o{ SalesPlan : "organization"
  Organization ||--o{ ScrapeTarget : "organization"
  Organization ||--o{ Settlement : "organization"
  Organization ||--o{ Shipment : "organization"
  Organization ||--o{ StockAudit : "organization"
  Organization ||--o{ StockTransaction : "organization"
  Organization ||--o{ StockTransfer : "organization"
  Organization ||--o{ Supplier : "organization"
  Organization ||--o{ SupplierPayment : "organization"
  Organization ||--o{ SystemSetting : "organization"
  Organization ||--o{ Thumbnail : "organization"
  Organization ||--o{ ThumbnailAnalysis : "organization"
  Organization ||--o{ ThumbnailGeneration : "organization"
  Organization ||--o{ ThumbnailGenerationCandidate : "organization"
  Organization ||--o{ ThumbnailGenerationInputImage : "organization"
  Organization ||--o{ ThumbnailRegistrationAttempt : "organization"
  Organization ||--o{ ThumbnailTracking : "organization"
  Organization ||--o{ UnshippedItem : "organization"
  Organization ||--o{ Warehouse : "organization"
  Organization ||--o{ WorkflowTemplate : "organization"
  PickingList ||--o{ PickingItem : "pickingList"
  ProductOption ||--o{ BundleComponent : "bundleOption"
  ProductOption ||--o{ BundleComponent : "componentOption"
  ProductOption o|--o{ ChannelAdTargetDailySnapshot : "option"
  ProductOption o|--o{ ChannelListingOption : "option"
  ProductOption o|--o{ ChannelListingOptionDailySnapshot : "option"
  ProductOption o|--o{ ChannelScrapeSnapshot : "option"
  ProductOption ||--|| Inventory : "option"
  ProductOption o|--o{ OrderLineItem : "option"
  ProductOption o|--o{ OrderReturnLineItem : "option"
  ProductOption ||--o{ PickingItem : "option"
  ProductOption o|--o{ PurchaseOrderItem : "option"
  ProductOption ||--o{ ReturnTransfer : "option"
  ProductOption o|--o{ Shipment : "option"
  ProductOption ||--o{ StockTransaction : "option"
  ProductOption ||--o{ StockTransfer : "option"
  ProductOption ||--o{ SupplierProduct : "option"
  ProductOption o|--o{ UnshippedItem : "option"
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  Supplier ||--o{ MasterSupplierProduct : "supplier"
  Supplier o|--o{ PurchaseOrder : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier ||--o{ SupplierProduct : "supplier"
  ThumbnailGeneration ||--o{ ThumbnailGenerationCandidate : "generation"
  ThumbnailGeneration ||--o{ ThumbnailGenerationInputImage : "generation"
  ThumbnailGeneration ||--o{ ThumbnailRegistrationAttempt : "generation"
  ThumbnailGeneration ||--o{ ThumbnailTracking : "generation"
  User o|--o{ ActionTask : "assigneeUser"
  User o|--o{ AgentApprovalRequest : "approver"
  User o|--o{ AgentApprovalRequest : "decidedBy"
  User o|--o{ AgentApprovalRequest : "requestedBy"
  User o|--o{ AgentAuthorizationEvent : "decidedBy"
  User o|--o{ AgentAuthorizationEvent : "requestedBy"
  User o|--o{ AgentRunRequest : "requestedBy"
  User o|--o{ Alert : "actorUser"
  User o|--o{ ContentGeneration : "triggeredByUser"
  User o|--o{ OrganizationMembership : "invitedBy"
  User ||--o{ OrganizationMembership : "user"
  User o|--o{ ThumbnailGeneration : "triggeredByUser"
  User o|--o{ WorkflowRun : "triggeredByUser"
  Warehouse o|--o{ Shipment : "warehouse"
  Warehouse o|--o{ StockTransaction : "warehouse"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
  WorkflowRun o|--o{ AgentRunRequest : "sourceWorkflowRun"
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```
