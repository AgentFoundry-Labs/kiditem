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
- `prisma/models/sourcing.prisma`
- `prisma/models/supply.prisma`
- `prisma/models/system.prisma`

## Domain ERDs

| Domain | Models |
|---|---:|
| [Advertising](erd/advertising.md) | 5 |
| [AgentOS](erd/agentos.md) | 17 |
| [AI](erd/ai.md) | 20 |
| [Channels](erd/channels.md) | 21 |
| [Core](erd/core.md) | 12 |
| [Finance](erd/finance.md) | 5 |
| [Inventory](erd/inventory.md) | 13 |
| [Orders](erd/orders.md) | 10 |
| [Sourcing](erd/sourcing.md) | 11 |
| [Supply](erd/supply.md) | 9 |
| [System](erd/system.md) | 9 |

## Model Index

| Model | Domain | Table | Description |
|---|---:|---|---|
| AdAction | Advertising | `ad_actions` | 광고 자동 실행 큐. ChannelAdTargetDailySnapshot→AdAction→ExecutionTask→ExecutionLog 파이프라인. |
| ExecutionLog | Advertising | `execution_logs` | - |
| ExecutionTask | Advertising | `execution_tasks` | - |
| ExecutionWorker | Advertising | `execution_workers` | - |
| ScrapeTarget | Advertising | `scrape_targets` | - |
| AgentApprovalRequest | AgentOS | `agent_approval_requests` | Human approval state. While pending, AgentRunRequest.status = requires_approval. |
| AgentArtifact | AgentOS | `agent_artifacts` | User-visible output card linked to task, tool, or domain record. |
| AgentAuthorizationEvent | AgentOS | `agent_authorization_events` | Authorization audit. Logged before, during, and outside runs (eg. admin policy widening). |
| AgentConversation | AgentOS | `agent_conversations` | User-facing Agent OS conversation thread. |
| AgentCostEvent | AgentOS | `agent_cost_events` | Cost ledger source of truth. Insert + AgentRuntimeState aggregate update share one transaction. |
| AgentInstance | AgentOS | `agent_instances` | Organization-owned runnable subject. Type must match the code-owned Agent Definition Registry. |
| AgentInstanceToolPolicy | AgentOS | `agent_instance_tool_policies` | Per-instance override for tool policy. Registry defaults are code-owned; DB stores organization overrides. |
| AgentMessage | AgentOS | `agent_messages` | Visible conversation message tied to user, Operator, agent, or tool output. |
| AgentRun | AgentOS | `agent_runs` | Accepted execution attempt. Replaces HeartbeatRun. Always starts at status="running"; queue state lives on AgentRunRequest. |
| AgentRunEvent | AgentOS | `agent_run_events` | Run-local event timeline (status, tool, model, safety, fallback). Bulk logs go to external store via logRef. |
| AgentRunRequest | AgentOS | `agent_run_requests` | Durable request inbox + queue + dedupe + audit. Replaces AgentWakeupRequest. Queue state lives here, not on AgentRun. |
| AgentRuntimeState | AgentOS | `agent_runtime_states` | Frequently-changing per-instance runtime state (last run, totals, cached aggregates). 1:1 with AgentInstance. |
| AgentTaskSession | AgentOS | `agent_task_sessions` | Per-task durable session. taskKey defaults to "default" only at API boundary. |
| AgentToolDefinition | AgentOS | `agent_tool_definitions` | Catalog of business tools agents may invoke. KidItem ships a curated set; not a generic HTTP/DB tool marketplace. |
| AgentToolInvocation | AgentOS | `agent_tool_invocations` | Durable capability/tool invocation audit record. |
| WorkflowRun | AgentOS | `workflow_runs` | Workflow run record. Workflow runner triggers Agent OS via AgentRunnerPort with sourceWorkflowRunId. |
| WorkflowTemplate | AgentOS | `workflow_templates` | Workflow definition. Trigger config + nodes/edges. |
| AiDirectJob | AI | `ai_direct_jobs` | Durable queue and projection checkpoint for direct thumbnail, detail-page, and image-edit model work. |
| ContentAsset | AI | `content_assets` | Organization-scoped managed media with optional generation-group provenance. |
| ContentGeneration | AI | `content_generations` | - |
| ContentGenerationAssetUsage | AI | `content_generation_asset_usages` | Current image assets used by a generated content row. Asset location stays on ContentAsset; this table is the replace-on-save usage set. |
| ContentGenerationGroup | AI | `content_generation_groups` | Same-input generation group owned by a content workspace. |
| ContentGenerationSource | AI | `content_generation_sources` | Generation-level provenance. The source of a generated work unit can be a sourcing candidate, input asset, or another generation. |
| ContentWorkspace | AI | `content_workspaces` | Product content workspace owned by a sourcing candidate, channel listing, or direct detail page. |
| ContentWorkspaceThumbnailSelection | AI | `content_workspace_thumbnail_selections` | Stable workspace-owned thumbnail adoption with optional generation provenance. |
| DetailPageArtifact | AI | `detail_page_artifacts` | Candidate-centered editable detail-page artifact. One artifact owns the user-visible draft line; revisions keep generated/manual HTML history. |
| DetailPageRevision | AI | `detail_page_revisions` | Append-only detail-page HTML revision. Editor saves create rows; DetailPageArtifact.currentRevisionId selects the active version. |
| ProductPreparation | AI | `product_preparations` | Product pipeline preparation state. Stores operator-confirmed registration inputs and selected generated assets before marketplace listing. |
| Thumbnail | AI | `thumbnails` | CTR 기반 썸네일 트래킹 (ThumbnailAnalysis 와 별도 시스템). |
| ThumbnailAnalysis | AI | `thumbnail_analyses` | 5차원 scores(heroShot·composition·branding·mobile·differentiation) + complianceGrade(PASS/WARN/FAIL) + imageSpec(사전검수). 스펙 FAIL 시 AI 호출 생략. |
| ThumbnailGeneration | AI | `thumbnail_generations` | 상태: status=pending/running/succeeded/failed/cancelled, phase=ready/applied. method=generate/creative/auto. |
| ThumbnailGenerationCandidate | AI | `thumbnail_generation_candidates` | 썸네일 생성 후보 이미지. 바이너리는 object storage 에 저장하고 DB 는 URL/key 메타데이터만 보관한다. |
| ThumbnailGenerationEvent | AI | `thumbnail_generation_events` | ThumbnailGeneration 의 status/phase/attempt/error 전이 audit ledger. row 누적, 덮어쓰기 X. |
| ThumbnailGenerationInputImage | AI | `thumbnail_generation_input_images` | 썸네일 편집/생성 입력 이미지. base64 원문 대신 object storage 참조와 역할 메타데이터만 저장한다. |
| ThumbnailRegistrationAttempt | AI | `thumbnail_registration_attempts` | Wing 등 외부 채널 등록 시도 이력. 마지막 상태만 덮어쓰지 않고 재시도/실패 원인을 보존한다. |
| ThumbnailTracking | AI | `thumbnail_trackings` | - |
| ThumbnailTrackingDailySnapshot | AI | `thumbnail_tracking_daily_snapshots` | 적용된 썸네일의 30일 매출/판매량 시계열 — playwriter 로 Wing vendor-inventory 검색해서 매일 한 row 씩 적재. |
| ChannelAccountDailyKpiSnapshot | Channels | `channel_account_daily_kpi_snapshots` | 채널 계정/스토어 단위 KPI 일별 정규화 fact (listing 에 귀속되지 않는 dashboard KPI 용). |
| ChannelAdTargetDailySnapshot | Channels | `channel_ad_target_daily_snapshots` | 채널 광고 타겟(캠페인/키워드/상품)의 일별 정규화 fact. 기간 view 는 SUM 으로 derive. |
| ChannelListingDailySnapshot | Channels | `channel_listing_daily_snapshots` | 채널 listing 의 일별 정규화 상태. 반복 scrape 는 businessDate row 를 upsert. |
| ChannelListingDeletionOperation | Channels | `channel_listing_deletion_operations` | Channel listing 삭제의 provider side effect 실행 기록. 삭제 대상 외부 listing identity를 요청 시점에 동결한다. |
| ChannelListingOptionDailySnapshot | Channels | `channel_listing_option_daily_snapshots` | 채널 listing option/vendor item 의 일별 정규화 상태. |
| ChannelScrapeChunk | Channels | `channel_scrape_chunks` | Browser catalog collection payloads kept in JSONB until an atomic publication succeeds. |
| ChannelScrapeRun | Channels | `channel_scrape_runs` | 채널별 상품/광고/트래픽 스크래핑 실행 단위. 원본 row 는 ChannelScrapeSnapshot 에 저장. |
| ChannelScrapeSnapshot | Channels | `channel_scrape_snapshots` | 채널 스크래퍼/API 가 본 원본 row. 매칭 실패/파서 변경 대비 rawJson 을 보존. |
| CoupangKeywordRankDailySnapshot | Channels | `coupang_keyword_rank_daily_snapshots` | 쿠팡 검색 키워드×상품(vendorItemId) 일별 순위 fact. 순위 null = 스캔한 페이지 내 미노출(순위권 밖). overallRank 는 광고 포함 전체 순위, organicRank 는 오가닉만, adRank 는 광고만 센 순위. |
| CoupangKeywordSerpDailySnapshot | Channels | `coupang_keyword_serp_daily_snapshots` | 쿠팡 검색 키워드별 SERP 전체 캡처(키워드-일자당 최신본 upsert). items 는 DOM 순서 그대로의 결과 리스트 JSON — 경쟁사 노출 확인·순위 재계산용. |
| CoupangKeywordTracker | Channels | `coupang_keyword_trackers` | 쿠팡 검색 키워드별 자사 상품 순위 추적 대상. 확장이 www.coupang.com 검색결과(SERP)를 수집할 키워드 정의. vendorItemIds 는 명시 추적 타깃(빈 배열 = 자사 카탈로그 자동매칭만). |
| CoupangRepresentativeKeywordOverride | Channels | `coupang_representative_keyword_overrides` | 자사 쿠팡 상품(vendorItemId)별 사용자가 직접 지정한 대표 검색 키워드. 없으면 쿠팡 카테고리와 Wing 28일 지표로 자동 추천한다. |
| CoupangWingSalesRankDailySnapshot | Channels | `coupang_wing_sales_rank_daily_snapshots` | Wing 상품 매칭 API의 키워드별 최근 28일 판매량순에서 자사 vendorItemId가 차지한 일별 순위. salesRank null은 수집 범위 밖이며 판매량·조회·매출 지표도 같은 Wing 응답에서 저장한다. |
| CoupangWingTrackedProduct | Channels | `coupang_wing_tracked_products` | 쿠팡 Wing 카탈로그 경쟁상품 추적 대상. 상품분석(wing-catalog)에서 사용자가 추적 등록한 카탈로그 상품(자사/경쟁 무관). sourceKeyword = 지표 갱신 시 재검색할 키워드. |
| CoupangWingTrackedProductDailySnapshot | Channels | `coupang_wing_tracked_product_daily_snapshots` | 쿠팡 Wing 추적상품 일별 지표 스냅샷(상품×일자당 최신본 upsert). Wing 카탈로그 28일 지표(클릭 pv·판매·매출·전환) + 판매가·리뷰. |
| RocketPoCatalogLine | Channels | `rocket_po_catalog_lines` | Normalized Rocket PO line and confirmation-workbook evidence owned by one completed catalog snapshot. |
| RocketPoCatalogSnapshot | Channels | `rocket_po_catalog_snapshots` | Completed Coupang Rocket PO collection evidence that can be reopened without another provider collection. Inventory capacity is never stored here. |
| RocketPurchaseOrder | Channels | `rocket_purchase_orders` | 쿠팡 로켓 발주 단건(per-PO) 상세 — 매출분석 드릴다운(일자→발주→품목)용. items 는 발주서 품목(SKU) 라인 JSON(표시 전용). |
| RocketSupplyDailySnapshot | Channels | `rocket_supply_daily_snapshots` | 쿠팡 로켓(공급사 발주) 일별 매출 fact. po-web 발주리스트의 발주금액(공급가)을 입고예정일(KST) 기준으로 집계한 값으로, 윙 매출과 분리된 로켓 매출 소스. |
| SellpiaProductMonthlySales | Channels | `sellpia_product_monthly_sales` | Sellpia 상품별 이익현황(stat_prd_profit) 월별 판매수량(재고 소진) fact. stat_action.ajax.html(mode=stat_prd_profit)의 graph(월별 매입액/판매액/판매수량)에서 상품×옵션×연월로 수집. 재고관리용 1개월/2개월 평균 소진량 산정 소스. 메이크샵 주문 데이터 기준. |
| SellpiaSalesDailySnapshot | Channels | `sellpia_sales_daily_snapshots` | Sellpia 판매현황(sale_summary) 몰별·일별 매출 fact. order_search.ajax.html(mode=selldate, 주문일자 기준)에서 판매처(seller)별로 수집. channelGroup 으로 rocket(쿠팡-직배송) / others(쿠팡윙+기타 전체몰) 버킷을 구분해 대시보드 '몰별 매출' 섹션에 표시한다. price=판매금액, buy_price=매입금액, amount=판매수량. |
| CategoryMapping | Core | `category_mappings` | - |
| ChannelAccount | Core | `channel_accounts` | Marketplace/store account such as Coupang Wing or Naver SmartStore. Operational channel ownership is distinct from the SaaS organization. |
| ChannelListing | Core | `channel_listings` | 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등. |
| ChannelListingOption | Core | `channel_listing_options` | One sellable SKU under a channel listing. |
| LegalEntity | Core | `legal_entities` | Legal/business entity under an organization. This stores tax, invoice, and settlement identity separately from the SaaS organization boundary. |
| MasterProduct | Core | `master_products` | KidItem-operated product identity and product-level operating metadata. |
| Organization | Core | `organizations` | - |
| OrganizationMembership | Core | `organization_memberships` | B2B customer/workspace membership. A user may belong to multiple organizations; this row supplies request organization and role. |
| ProductVariant | Core | `product_variants` | Reusable sellable unit beneath one MasterProduct. Code is stable organization-scoped identity. |
| ProductVariantComponent | Core | `product_variant_components` | Central confirmed variant recipe. source: manual \| deterministic; quantity is positive and validated by shared/service contracts. |
| SourceImportRun | Core | `source_import_runs` | Durable provenance and publication fence for Sellpia and channel full-snapshot imports. |
| User | Core | `users` | human(직원) / agent(AI, agentInstanceId 연결) / system(챗봇). 조직 소속은 OrganizationMembership 이 source of truth. |
| GradeHistory | Finance | `grade_histories` | ABC 등급 변경 추적. |
| ManualLedger | Finance | `manual_ledgers` | 자동 집계 외 수기 수입/지출. |
| ProcessingCost | Finance | `processing_costs` | - |
| ProfitLoss | Finance | `profit_loss` | 월간 손익. organizationId+listingId+year+month unique. |
| SalesPlan | Finance | `sales_plans` | - |
| InventoryCommitment | Inventory | `inventory_commitments` | Physical-stock-independent commitment that reduces common available Sellpia capacity. |
| InventoryCommitmentAllocation | Inventory | `inventory_commitment_allocations` | Component-level Sellpia SKU quantity held by one inventory commitment. |
| PickingItem | Inventory | `picking_items` | - |
| PickingList | Inventory | `picking_lists` | - |
| ReturnTransfer | Inventory | `return_transfers` | - |
| SellpiaInventorySku | Inventory | `sellpia_inventory_skus` | One physical Sellpia product-code row and its latest imported current stock. |
| SellpiaInventoryState | Inventory | `sellpia_inventory_states` | Organization-scoped Sellpia inventory trust state, source binding, generation fence, and active collection lease. |
| SellpiaOrderTransmissionIntent | Inventory | `sellpia_order_transmission_intents` | Organization-scoped idempotency fence for browser Sellpia order transmission and its post-submit inventory generation. |
| SellpiaOrderTransmissionIntentReconciliation | Inventory | `sellpia_order_transmission_intent_reconciliations` | Append-only owner/admin audit for resolving an ambiguous Sellpia order transmission outcome. |
| SellpiaReceiptUploadBatch | Inventory | `sellpia_receipt_upload_batches` | Record of an operator-confirmed receipt file upload to Sellpia. |
| StockAudit | Inventory | `stock_audits` | - |
| StockTransfer | Inventory | `stock_transfers` | Warehouse-to-warehouse movement record. It never mutates SellpiaInventorySku.currentStock. |
| Warehouse | Inventory | `warehouses` | - |
| CSRecord | Orders | `cs_records` | - |
| Order | Orders | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderLineItem | Orders | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| OrderReturn | Orders | `order_returns` | 채널-agnostic 반품 aggregate. 반품 item 은 OrderReturnLineItem 으로 정규화. type=RETURN/EXCHANGE 구분 first-class. |
| OrderReturnLineItem | Orders | `order_return_line_items` | 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. return FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | Orders | `reviews` | - |
| Settlement | Orders | `settlements` | 월별 정산 (예상 vs 실제 비교). |
| Shipment | Orders | `shipments` | - |
| ShipmentItem | Orders | `shipment_items` | Order-line shipment detail. |
| UnshippedItem | Orders | `unshipped_items` | - |
| CandidateImage | Sourcing | `sourcing_candidate_images` | 소싱 후보가 소유하는 이미지 갤러리. 소싱 콘텐츠와 썸네일 생성 입력으로 사용한다. |
| LiveCommerceBroadcastDailySnapshot | Sourcing | `live_commerce_broadcast_daily_snapshots` | 타오바오 공식 API 또는 로그인된 1688·도우인 브라우저 화면에서 수집한 라이브 방송 일별 스냅샷. source와 broadcastId가 외부 방송 식별자를 이룬다. |
| LiveCommerceProductDailySnapshot | Sourcing | `live_commerce_product_daily_snapshots` | 중국 라이브 방송에 노출된 상품의 일별 스냅샷. broadcastId로 방송 스냅샷과 논리적으로 연결하고 상품 단위 비교를 지원한다. |
| NaverKeywordDailySnapshot | Sourcing | `naver_keyword_daily_snapshots` | 네이버 키워드(검색광고 월검색량 + 데이터랩 검색어트렌드) 일별 스냅샷. 시드 키워드당 하루 1행(최신본 upsert). trendRatio 는 latestRatio 반올림(0-100). |
| NaverPopularKeywordDailySnapshot | Sourcing | `naver_popular_keyword_daily_snapshots` | 네이버 데이터랩 인기키워드 보드(출산/육아·완구/인형·문구/사무 등)의 일별 순위 스냅샷. 보드×키워드 identity를 사용하고 매 수집마다 보드×일자 범위를 통째로 교체한다. |
| ProductRegistrationExecution | Sourcing | `product_registration_executions` | Reviewed product preparation의 marketplace create/reconcile side effect 실행 기록. 준비 입력과 provider lifecycle을 분리해 보존한다. |
| ShortsTrendDailySnapshot | Sourcing | `shorts_trend_daily_snapshots` | 쇼츠트렌드(shortstrend.co.kr) 급상승 쇼츠 일별 스냅샷. rank 는 소스 노출 순위, videoKey 는 영상 식별자. video×일자당 1행. |
| Sourcing1688HotProductDailySnapshot | Sourcing | `sourcing_1688_hot_product_daily_snapshots` | 1688 키워드별 핫셀링 offer 일별 스냅샷. sourceKeyword 는 시드 키워드, rank 는 해당 키워드 결과셋 내 monthlySales 내림차순 순위. offer×일자당 1행. |
| SourcingCandidate | Sourcing | `sourcing_candidates` | 외부 플랫폼에서 스크랩한 소싱 후보. MasterProduct와 분리된 sourcing inbox. |
| SourcingWorkspaceSnapshot | Sourcing | `sourcing_workspace_snapshots` | 조직/KST 날짜/scope 단위의 소싱 AI 결과 캐시. 오늘의 추천/키워드 분석 결과를 최신 1개로 재사용한다. |
| TrendSeedKeyword | Sourcing | `trend_seed_keywords` | 문구·완구 시장 트렌드 정기 수집의 시드 키워드. sources 로 몰별(naver/shorts/1688) 수집 대상을 제어. keywordCn 은 1688 中文 검색어(null이면 keyword 사용). |
| PurchaseOrder | Supply | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | Supply | `purchase_order_items` | - |
| PurchaseOrderSubmissionAttempt | Supply | `purchase_order_submission_attempts` | Durable idempotency intent and reconciliation record for an external purchase-order submission. |
| RocketPurchaseConfirmation | Supply | `rocket_purchase_confirmations` | One operator-confirmed Rocket PO decision. It reserves component capacity without mutating Sellpia physical stock. |
| RocketPurchaseConfirmationAllocation | Supply | `rocket_purchase_confirmation_allocations` | Immutable component-capacity allocation captured from the confirmed ProductVariant recipe. |
| RocketPurchaseConfirmationLine | Supply | `rocket_purchase_confirmation_lines` | Audited Rocket PO line decision. Positive quantities require a confirmed channel variant recipe. |
| Supplier | Supply | `suppliers` | - |
| SupplierPayment | Supply | `supplier_payments` | - |
| SupplierProduct | Supply | `supplier_products` | 공급사별 Sellpia 물리 상품 단위 공급가/주공급처 정책. |
| ActionTask | System | `action_tasks` | 액션 보드 (수동 할일 관리). |
| ActivityEvent | System | `activity_events` | - |
| Alert | System | `alerts` | - |
| BusinessRule | System | `business_rules` | 온톨로지 룰 엔진 (조건→액션 자동화). |
| DataMigrationRun | System | `data_migration_runs` | 운영 data migration ledger. Schema-only db push와 별도로 영속 데이터 보정 실행 여부를 기록한다. |
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
    String listingOptionId FK
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
  AgentArtifact {
    String id PK
    String organizationId FK
    String conversationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String toolInvocationId FK
    String artifactType
    String targetDomain
    String targetModel
    String targetId
    String title
    String href
    Json summary
    String status
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
  AgentConversation {
    String id PK
    String organizationId FK
    String title
    String status
    String createdByUserId FK
    String rootRequestId FK
    DateTime lastMessageAt
    Json metadata
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
  AgentMessage {
    String id PK
    String organizationId FK
    String conversationId FK
    String role
    String content
    String agentInstanceId FK
    String requestId FK
    String runId FK
    Json metadata
    DateTime createdAt
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
    String conversationId FK
    String initiatedByMessageId FK
    String parentRequestId FK
    String delegatedByRunId FK
    String playbookKey
    String planStepKey
    String displayName
    String statusReason
    Json dependencyKeys
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
  AgentToolInvocation {
    String id PK
    String organizationId FK
    String conversationId FK
    String agentInstanceId FK
    String requestId FK
    String runId FK
    String approvalRequestId FK
    String capabilityKey
    String status
    String policyDecision
    String reasonCode
    String resourceType
    String resourceId
    String idempotencyKey
    Json inputSummary
    Json outputSummary
    String errorCode
    String errorMessage
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  AiDirectJob {
    String id PK
    String organizationId FK
    String jobType
    String sourceResourceId
    String status
    Json payload
    Json result
    Int attempts
    Int maxAttempts
    DateTime scheduledFor
    DateTime claimedAt
    String claimedBy
    DateTime leaseExpiresAt
    DateTime finishedAt
    String lastErrorCode
    String lastErrorMessage
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
  CandidateImage {
    String id PK
    String organizationId FK
    String candidateId FK
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
    String channelAccountId FK
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
    String organizationId FK
    String channelAccountId FK
    String sourceCandidateId FK
    String masterProductId FK
    String externalId
    String channelName
    String displayName
    String category
    String brand
    String manufacturer
    Json rawJson
    String lastImportRunId FK
    String status
    String exposureStatus
    String deliveryChargeType
    Int freeShipOverAmount
    Int returnCharge
    Json deliveryInfo
    Boolean isActive
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
  ChannelListingDeletionOperation {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String channelListingId FK
    String idempotencyKey
    String requestHash
    String externalListingId
    String expectedProviderAccountId
    String status
    String providerOutcome
    Json resultJson
    String lastErrorCode
    String lastErrorMessage
    String leaseToken
    DateTime leaseClaimedAt
    String requestedByUserId FK
    DateTime authorizationExpiresAt
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListingOption {
    String id PK
    String listingId FK
    String organizationId FK
    String productVariantId FK
    String externalOptionId
    String itemName
    Int salePrice
    Int costPriceOverride
    Decimal commissionRate
    Int shippingCost
    Int otherCost
    String sellerSku
    String barcode
    String modelNumber
    String status
    Json attributesJson
    Json rawJson
    String lastImportRunId FK
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListingOptionDailySnapshot {
    String id PK
    String organizationId FK
    String listingId FK
    String listingOptionId FK
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
  ChannelScrapeChunk {
    String id PK
    String organizationId FK
    String scrapeRunId FK
    String kind
    Int sequence
    String checksum
    Int itemCount
    Json payload
    DateTime publishedAt
    Json publicationJson
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelScrapeRun {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String clientRunKey
    String sourceImportRunId FK
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
    String matchStatus
    String matchReason
    String rowHash
    Json rawJson
    Json normalizedJson
    DateTime createdAt
  }
  ContentAsset {
    String id PK
    String organizationId FK
    String originGenerationGroupId FK
    String createdByUserId FK
    String assetKey
    String url
    String storageKey
    String assetType
    String role
    String label
    Int sortOrder
    String mimeType
    Int width
    Int height
    Int fileSize
    Json metadata
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ContentGeneration {
    String id PK
    String organizationId FK
    String generationGroupId FK
    String contentWorkspaceId FK
    String sourceCandidateId FK
    String detailPageArtifactId FK
    String contentType
    String templateId
    Json generationInput
    Json generationResult
    String generatedTitle
    String generatedDescription
    String generatedCopy
    String editedHtml
    DateTime editedHtmlSavedAt
    String status
    Int retryCount
    String errorMessage
    String triggeredByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ContentGenerationAssetUsage {
    String id PK
    String organizationId FK
    String contentGenerationId FK
    String contentAssetId FK
    DateTime createdAt
    DateTime updatedAt
  }
  ContentGenerationGroup {
    String id PK
    String organizationId FK
    String groupType
    String contentWorkspaceId FK
    String baseContentGenerationId FK
    String title
    String inputFingerprint
    Json metadata
    String createdByUserId
    DateTime createdAt
    DateTime updatedAt
  }
  ContentGenerationSource {
    String id PK
    String organizationId FK
    String contentGenerationId FK
    String sourceType
    String sourceCandidateId FK
    String sourceContentGenerationId FK
    String contentAssetId FK
    String label
    Int sortOrder
    Json metadata
    DateTime createdAt
    DateTime updatedAt
  }
  ContentWorkspace {
    String id PK
    String organizationId FK
    String ownerType
    String sourceCandidateId FK
    String channelListingId FK
    String originWorkspaceId FK
    String displayName
    String normalizedTitle
    String status
    String currentDetailPageArtifactId FK
    String currentDetailPageRevisionId FK
    String currentThumbnailSelectionId FK
    String createdByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ContentWorkspaceThumbnailSelection {
    String id PK
    String organizationId FK
    String contentWorkspaceId FK
    String contentAssetId FK
    String sourceThumbnailGenerationId FK
    String sourceThumbnailCandidateId FK
    String createdByUserId FK
    DateTime createdAt
  }
  CoupangKeywordRankDailySnapshot {
    String id PK
    String organizationId FK
    String keyword
    String vendorItemId
    DateTime businessDate
    String productId
    String itemId
    String productName
    Int overallRank
    Int organicRank
    Int adRank
    Int page
    Int positionInPage
    Int priceKrw
    Int reviewCount
    String source
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangKeywordSerpDailySnapshot {
    String id PK
    String organizationId FK
    String keyword
    DateTime businessDate
    Json items
    Int itemCount
    Int pagesScanned
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangKeywordTracker {
    String id PK
    String organizationId FK
    String keyword
    StringArray vendorItemIds
    Int maxPages
    Boolean enabled
    DateTime lastCapturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangRepresentativeKeywordOverride {
    String id PK
    String organizationId FK
    String vendorItemId
    String keyword
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangWingSalesRankDailySnapshot {
    String id PK
    String organizationId FK
    String keyword
    String vendorItemId
    DateTime businessDate
    String productId
    String itemId
    String productName
    String categoryHierarchy
    Int salesRank
    Int salesLast28d
    Int viewsLast28d
    Int revenueLast28d
    Decimal conversionRate28d
    Int salePrice
    Int reviewCount
    Int keywordSalesLast28d
    Int keywordViewsLast28d
    Decimal keywordConversionRate28d
    Int pagesScanned
    Int collectedCount
    Int totalResults
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangWingTrackedProduct {
    String id PK
    String organizationId FK
    String productId
    String itemId
    String vendorItemId
    String productName
    String imagePath
    String brandName
    String categoryHierarchy
    String sourceKeyword
    Boolean enabled
    DateTime lastCapturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  CoupangWingTrackedProductDailySnapshot {
    String id PK
    String organizationId FK
    String trackedProductId FK
    DateTime businessDate
    Int salePriceKrw
    Int ratingCount
    Decimal ratingAverage
    Int pvLast28Day
    Int salesLast28d
    Int estimatedRevenue28d
    Decimal conversionRate28d
    String sourceKeyword
    DateTime capturedAt
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
  DataMigrationRun {
    String migrationId PK
    String releaseVersion
    String name
    String status
    String gitSha
    String prismaSchemaHash
    Int affectedRows
    Json details
    String error
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  DetailPageArtifact {
    String id PK
    String organizationId FK
    String contentWorkspaceId FK
    String sourceContentGenerationId FK,UK
    String currentRevisionId FK
    String title
    String status
    Json metadata
    String createdByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  DetailPageRevision {
    String id PK
    String organizationId FK
    String artifactId FK
    String contentGenerationId FK
    String revisionType
    String html
    Json assetUrlMap
    Json imageUrls
    String createdByUserId FK
    DateTime createdAt
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
    String listingId FK
    String oldGrade
    String newGrade
    Decimal score
    Decimal revenueScore
    Decimal marginScore
    Decimal velocityScore
    String reason
    DateTime calculatedAt
  }
  InventoryCommitment {
    String id PK
    String organizationId FK
    String kind
    String sourceId
    String businessKey
    Int unitQuantity
    String status
    BigInt inventoryGeneration
    String predecessorCommitmentId FK
    String createdBy FK
    String releasedBy FK
    DateTime releasedAt
    String releaseReason
    String settledBy FK
    DateTime settledAt
    String settlementReason
    DateTime createdAt
    DateTime updatedAt
  }
  InventoryCommitmentAllocation {
    String id PK
    String organizationId FK
    String commitmentId FK
    String sellpiaInventorySkuId FK
    Int unitsPerItem
    Int quantity
    DateTime createdAt
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
  LiveCommerceBroadcastDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String source
    String broadcastId
    String title
    String broadcasterId
    String broadcasterName
    String status
    Int viewerCount
    Int likeCount
    DateTime startedAt
    DateTime endedAt
    String coverImageUrl
    String sourceUrl
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  LiveCommerceProductDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String source
    String broadcastId
    String productId
    Int rank
    String title
    Decimal priceCny
    Int salesCount
    String imageUrl
    String sourceUrl
    DateTime capturedAt
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
  MasterProduct {
    String id PK
    String organizationId FK
    String originChannelListingId FK
    String code
    String name
    String description
    String category
    String brand
    StringArray tags
    StringArray imageUrls
    String abcGrade
    String profitTag
    String adTier
    Int adBudgetLimit
    Int healthScore
    DateTime healthUpdatedAt
    Boolean isActive
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
  NaverKeywordDailySnapshot {
    String id PK
    String organizationId FK
    String keyword
    DateTime businessDate
    Int monthlyTotalSearchCount
    Int monthlyPcSearchCount
    Int monthlyMobileSearchCount
    String competitionIndex
    Int averageAdRank
    Int trendRatio
    Int trendDelta
    String source
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  NaverPopularKeywordDailySnapshot {
    String id PK
    String organizationId FK
    String boardKey
    String boardLabel
    String cid
    DateTime businessDate
    Int rank
    String keyword
    String linkId
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
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
  OrderReturn {
    String id PK
    String organizationId FK
    String orderId FK
    String channelAccountId FK
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
    String listingOptionId FK
    String productName
    String optionName
    String externalSku
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
    String organizationId FK
    String pickingListId FK
    String orderId
    String sellpiaInventorySkuId FK
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
  ProductPreparation {
    String id PK
    String organizationId FK
    String sourceCandidateId FK
    String channelAccountId FK
    String sourceContentWorkspaceId FK
    String channelListingId FK
    String displayName
    String status
    String selectedThumbnailUrl
    String selectedThumbnailGenerationId FK
    String selectedThumbnailGenerationCandidateId FK
    String selectedDetailPageArtifactId FK
    String selectedDetailPageRevisionId FK
    String selectedDetailPageGenerationId FK
    Json registrationInput
    String submissionKey
    String providerSubmissionId
    String lastError
    Json registrationResult
    Json submissionPayloadJson
    String submissionPayloadHash
    String providerOutcome
    String submissionLeaseToken
    DateTime submissionLeaseClaimedAt
    String reviewPayloadHash
    DateTime approvedAt
    String approvedByUserId FK
    String createdByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ProductRegistrationExecution {
    String id PK
    String organizationId FK
    String productPreparationId FK
    String channelAccountId FK
    String channelListingId FK
    String executionKind
    String expectedProviderAccountId
    String idempotencyKey
    String requestHash
    Json submissionPayloadJson
    String submissionPayloadHash
    String status
    String providerOutcome
    String providerSubmissionId
    String externalListingId
    Json resultJson
    String lastErrorCode
    String lastErrorMessage
    String leaseToken
    DateTime leaseClaimedAt
    String requestedByUserId FK
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ProductVariant {
    String id PK
    String organizationId FK
    String masterProductId FK,UK
    String code
    String name
    String optionLabel
    Boolean isDefault
    Boolean isActive
    DateTime createdAt
    DateTime updatedAt
  }
  ProductVariantComponent {
    String id PK
    String organizationId FK
    String productVariantId FK
    String sellpiaInventorySkuId FK
    Int quantity
    String source
    String confirmedBy
    DateTime confirmedAt
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
  ReturnTransfer {
    String id PK
    String organizationId FK
    String rtNumber
    String orderId
    String sellpiaInventorySkuId FK
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
  RocketPoCatalogLine {
    String id PK
    String organizationId FK
    String snapshotId FK
    String poLineId
    String poNumber
    String vendorId
    String productNo
    String barcode
    String productName
    Int orderQty
    DateTime plannedDeliveryDate
    String poStatusCode
    String businessDateBasis
    Boolean hasConfirmation
    String center
    String inboundType
    String poStatus
    String returnManager
    String returnContact
    String returnAddress
    Int purchasePrice
    Int supplyPrice
    Int vat
    Int totalPurchase
    String poRegisteredAt
    String xdock
    DateTime createdAt
    DateTime updatedAt
  }
  RocketPoCatalogSnapshot {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String sourceImportRunId FK
    String collectionRunId
    String vendorId
    Int listPagesRead
    Int totalListPages
    Int detailPoCount
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
    DateTime createdAt
  }
  RocketPurchaseOrder {
    String id PK
    String organizationId FK
    Int poSeq
    DateTime businessDate
    DateTime orderedAt
    String status
    String vendorName
    String centerName
    String firstSkuName
    Int skuCount
    Int orderQty
    Int orderAmount
    Json items
    DateTime createdAt
    DateTime updatedAt
  }
  RocketSupplyDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    Int revenueKrw
    Int poCount
    Int itemQty
    String source
    Json rawJson
    DateTime createdAt
    DateTime updatedAt
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
  SellpiaInventorySku {
    String id PK
    String organizationId FK
    String code
    String name
    String optionName
    String barcode
    Int currentStock
    Int purchasePrice
    Int salePrice
    Boolean isActive
    Json rawJson
    String lastImportRunId FK
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaInventoryState {
    String organizationId PK,FK
    String sourceOrigin
    String sourceAccountKey
    DateTime lastVerifiedAt
    String lastCompletedImportRunId FK
    DateTime refreshRequestedAt
    String refreshReason
    DateTime syncNotBefore
    String activeSyncToken
    String activeSyncOwnerUserId FK
    DateTime activeSyncStartedAt
    DateTime activeSyncLeaseExpiresAt
    BigInt requestedGeneration
    BigInt activeGeneration
    BigInt verifiedGeneration
    BigInt failedGeneration
    DateTime lastAttemptAt
    String lastAttemptStatus
    String lastErrorCode
    String lastErrorMessage
    String freshnessFence
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
    BigInt finalizedGeneration
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
  SellpiaProductMonthlySales {
    String id PK
    String organizationId FK
    String productCode
    String optionCode
    String yearMonth
    Int orderQty
    Int orderAmount
    Int inQty
    Int inAmount
    String productName
    String optionName
    String providerName
    Int salePrice
    Int buyPrice
    String barcode
    DateTime capturedAt
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
  SellpiaSalesDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String sellerId
    String sellerName
    String channelGroup
    Int revenueKrw
    Int qty
    Int costKrw
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
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
  ShortsTrendDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String videoKey
    Int rank
    String title
    String channelName
    Int viewCount
    Int likeCount
    Int commentCount
    String keyword
    DateTime publishedAt
    String thumbnailUrl
    String videoUrl
    String source
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourceImportRun {
    String id PK
    String organizationId FK
    String sourceType
    String channelAccountId FK
    String fileName
    String fileHash
    String status
    Int rowCount
    DateTime importedAt
    DateTime lastVerifiedAt
    Int verificationCount
    String lastTrigger
    BigInt freshnessGeneration
    DateTime manualFreshExportConfirmedAt
    String manualFreshExportConfirmedBy FK
    Json qualityReport
    String errorCode
    String errorMessage
    String createdBy
    String attemptToken
    BigInt publicationSequence
    DateTime createdAt
    DateTime updatedAt
  }
  Sourcing1688HotProductDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String offerId
    String sourceKeyword
    Int rank
    String title
    Decimal priceCny
    Int monthlySales
    String repurchaseRate
    String tradeScore
    String supplierName
    String imageUrl
    String sourceUrl
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingCandidate {
    String id PK
    String organizationId FK
    String sourceUrl
    String sourcePlatform
    Json rawData
    String name
    String description
    String category
    Json tags
    String thumbnailUrl
    String imageUrl
    Decimal costCny
    String status
    String provenanceMasterProductId FK
    String rejectedReason
    DateTime rejectedAt
    String rejectedByUserId FK
    String triggeredByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingWorkspaceSnapshot {
    String id PK
    String organizationId FK
    String scope
    DateTime businessDate
    Json payload
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
  StockTransfer {
    String id PK
    String organizationId FK
    String sellpiaInventorySkuId FK
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
    String contentWorkspaceId FK,UK
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
    String sourceCandidateId FK
    String contentWorkspaceId FK
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
    Boolean isDeleted
    DateTime deletedAt
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
  ThumbnailGenerationEvent {
    String id PK
    String organizationId FK
    String generationId FK
    String eventType
    String fromStatus
    String toStatus
    String fromPhase
    String toPhase
    Int attemptNumber
    String errorMessage
    Json payload
    String actorUserId FK
    DateTime occurredAt
    DateTime createdAt
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
    String candidateImageId FK
    String sourceThumbnailCandidateId FK
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
  ThumbnailTrackingDailySnapshot {
    String id PK
    String organizationId FK
    String trackingId FK
    DateTime capturedAt
    DateTime capturedDate
    Int unitsSold30d
    Int unitsSold7d
    Int revenueKrw
    Int reviewCount
    Float ratingAvg
    Json rawCellTexts
    String scrapeStatus
    String errorMessage
    DateTime createdAt
  }
  TrendSeedKeyword {
    String id PK
    String organizationId FK
    String keyword
    String keywordCn
    StringArray sources
    Boolean enabled
    DateTime createdAt
    DateTime updatedAt
  }
  UnshippedItem {
    String id PK
    String organizationId FK
    String orderId FK
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
  AgentApprovalRequest o|--o{ AgentToolInvocation : "approvalRequest"
  AgentConversation o|--o{ AgentArtifact : "conversation"
  AgentConversation ||--o{ AgentMessage : "conversation"
  AgentConversation o|--o{ AgentRunRequest : "conversation"
  AgentConversation o|--o{ AgentToolInvocation : "conversation"
  AgentInstance ||--o{ AgentApprovalRequest : "agentInstance"
  AgentInstance o|--o{ AgentArtifact : "agentInstance"
  AgentInstance ||--o{ AgentAuthorizationEvent : "agentInstance"
  AgentInstance ||--o{ AgentCostEvent : "agentInstance"
  AgentInstance o|--o{ AgentInstance : "parent"
  AgentInstance ||--o{ AgentInstanceToolPolicy : "agentInstance"
  AgentInstance o|--o{ AgentMessage : "agentInstance"
  AgentInstance ||--o{ AgentRun : "agentInstance"
  AgentInstance ||--o{ AgentRunEvent : "agentInstance"
  AgentInstance ||--o{ AgentRunRequest : "agentInstance"
  AgentInstance ||--|| AgentRuntimeState : "agentInstance"
  AgentInstance ||--o{ AgentTaskSession : "agentInstance"
  AgentInstance ||--o{ AgentToolInvocation : "agentInstance"
  AgentInstance o|--o{ User : "agentInstance"
  AgentMessage o|--o{ AgentRunRequest : "initiatedByMessage"
  AgentRun o|--o{ AgentApprovalRequest : "run"
  AgentRun o|--o{ AgentArtifact : "run"
  AgentRun o|--o{ AgentAuthorizationEvent : "run"
  AgentRun ||--o{ AgentCostEvent : "run"
  AgentRun o|--o{ AgentMessage : "run"
  AgentRun o|--o{ AgentRun : "retryOfRun"
  AgentRun ||--o{ AgentRunEvent : "run"
  AgentRun o|--o{ AgentRunRequest : "delegatedByRun"
  AgentRun o|--o{ AgentRuntimeState : "lastRun"
  AgentRun o|--o{ AgentTaskSession : "lastRun"
  AgentRun o|--o{ AgentToolInvocation : "run"
  AgentRunRequest ||--o{ AgentApprovalRequest : "request"
  AgentRunRequest o|--o{ AgentArtifact : "request"
  AgentRunRequest o|--o{ AgentAuthorizationEvent : "request"
  AgentRunRequest o|--o{ AgentConversation : "rootRequest"
  AgentRunRequest ||--o{ AgentCostEvent : "request"
  AgentRunRequest o|--o{ AgentMessage : "request"
  AgentRunRequest ||--o{ AgentRun : "request"
  AgentRunRequest o|--o{ AgentRunRequest : "coalescedIntoRequest"
  AgentRunRequest o|--o{ AgentRunRequest : "parentRequest"
  AgentRunRequest o|--o{ AgentToolInvocation : "request"
  AgentTaskSession ||--o{ AgentRun : "taskSession"
  AgentTaskSession ||--o{ AgentRunRequest : "taskSession"
  AgentToolDefinition o|--o{ AgentAuthorizationEvent : "tool"
  AgentToolDefinition ||--o{ AgentInstanceToolPolicy : "tool"
  AgentToolInvocation o|--o{ AgentArtifact : "toolInvocation"
  CandidateImage o|--o{ ThumbnailGenerationInputImage : "candidateImage"
  ChannelAccount ||--o{ ChannelAccountDailyKpiSnapshot : "channelAccount"
  ChannelAccount ||--o{ ChannelListing : "channelAccount"
  ChannelAccount ||--o{ ChannelListingDeletionOperation : "channelAccount"
  ChannelAccount ||--o{ ChannelScrapeRun : "channelAccount"
  ChannelAccount ||--o{ Order : "channelAccount"
  ChannelAccount ||--o{ OrderReturn : "channelAccount"
  ChannelAccount ||--o{ ProductPreparation : "channelAccount"
  ChannelAccount ||--o{ ProductRegistrationExecution : "channelAccount"
  ChannelAccount ||--o{ RocketPoCatalogSnapshot : "channelAccount"
  ChannelAccount ||--o{ RocketPurchaseConfirmation : "channelAccount"
  ChannelAccount o|--o{ SourceImportRun : "channelAccount"
  ChannelAdTargetDailySnapshot o|--o{ AdAction : "adTargetDaily"
  ChannelListing o|--o{ AdAction : "listing"
  ChannelListing o|--o{ ChannelAdTargetDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingDeletionOperation : "channelListing"
  ChannelListing ||--o{ ChannelListingOption : "listing"
  ChannelListing ||--o{ ChannelListingOptionDailySnapshot : "listing"
  ChannelListing o|--o{ ChannelScrapeSnapshot : "listing"
  ChannelListing o|--o{ ContentWorkspace : "channelListing"
  ChannelListing o|--o{ CSRecord : "listing"
  ChannelListing ||--o{ GradeHistory : "listing"
  ChannelListing o|--o| MasterProduct : "originChannelListing"
  ChannelListing o|--o{ ProductPreparation : "channelListing"
  ChannelListing o|--o{ ProductRegistrationExecution : "channelListing"
  ChannelListing ||--o{ ProfitLoss : "listing"
  ChannelListing o|--o{ Review : "listing"
  ChannelListing ||--o{ Thumbnail : "listing"
  ChannelListing ||--o{ ThumbnailTracking : "listing"
  ChannelListingOption o|--o{ AdAction : "listingOption"
  ChannelListingOption o|--o{ ChannelAdTargetDailySnapshot : "listingOption"
  ChannelListingOption ||--o{ ChannelListingOptionDailySnapshot : "listingOption"
  ChannelListingOption o|--o{ ChannelScrapeSnapshot : "listingOption"
  ChannelListingOption o|--o{ OrderLineItem : "listingOption"
  ChannelListingOption o|--o{ OrderReturnLineItem : "listingOption"
  ChannelListingOption o|--o{ RocketPurchaseConfirmationLine : "channelListingOption"
  ChannelScrapeRun ||--o{ ChannelScrapeChunk : "scrapeRun"
  ChannelScrapeRun o|--o{ ChannelScrapeSnapshot : "scrapeRun"
  ChannelScrapeSnapshot o|--o{ ChannelAccountDailyKpiSnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelAdTargetDailySnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelListingDailySnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelListingOptionDailySnapshot : "rawSnapshot"
  ContentAsset ||--o{ ContentGenerationAssetUsage : "contentAsset"
  ContentAsset o|--o{ ContentGenerationSource : "contentAsset"
  ContentAsset ||--o{ ContentWorkspaceThumbnailSelection : "contentAsset"
  ContentGeneration ||--o{ ContentGenerationAssetUsage : "contentGeneration"
  ContentGeneration o|--o{ ContentGenerationGroup : "baseContentGeneration"
  ContentGeneration ||--o{ ContentGenerationSource : "contentGeneration"
  ContentGeneration o|--o{ ContentGenerationSource : "sourceContentGeneration"
  ContentGeneration o|--o| DetailPageArtifact : "sourceContentGeneration"
  ContentGeneration o|--o{ DetailPageRevision : "contentGeneration"
  ContentGeneration o|--o{ ProductPreparation : "selectedDetailPageGeneration"
  ContentGenerationGroup o|--o{ ContentAsset : "originGenerationGroup"
  ContentGenerationGroup ||--o{ ContentGeneration : "generationGroup"
  ContentWorkspace ||--o{ ContentGeneration : "contentWorkspace"
  ContentWorkspace ||--o{ ContentGenerationGroup : "contentWorkspace"
  ContentWorkspace o|--o{ ContentWorkspace : "originWorkspace"
  ContentWorkspace ||--o{ ContentWorkspaceThumbnailSelection : "contentWorkspace"
  ContentWorkspace ||--o{ DetailPageArtifact : "contentWorkspace"
  ContentWorkspace ||--o{ ProductPreparation : "sourceContentWorkspace"
  ContentWorkspace ||--o{ ThumbnailAnalysis : "contentWorkspace"
  ContentWorkspace ||--o{ ThumbnailGeneration : "contentWorkspace"
  ContentWorkspaceThumbnailSelection o|--o| ContentWorkspace : "currentThumbnailSelection"
  CoupangWingTrackedProduct ||--o{ CoupangWingTrackedProductDailySnapshot : "trackedProduct"
  DetailPageArtifact o|--o{ ContentGeneration : "detailPageArtifact"
  DetailPageArtifact o|--o{ ContentWorkspace : "currentDetailPageArtifact"
  DetailPageArtifact ||--o{ DetailPageRevision : "artifact"
  DetailPageArtifact o|--o{ ProductPreparation : "selectedDetailPageArtifact"
  DetailPageRevision o|--o{ ContentWorkspace : "currentDetailPageRevision"
  DetailPageRevision o|--o{ DetailPageArtifact : "currentRevision"
  DetailPageRevision o|--o{ ProductPreparation : "selectedDetailPageRevision"
  ExecutionTask ||--o{ ExecutionLog : "task"
  ExecutionWorker o|--o{ ExecutionTask : "worker"
  InventoryCommitment o|--o{ InventoryCommitment : "predecessor"
  InventoryCommitment ||--o{ InventoryCommitmentAllocation : "commitment"
  Marketplace o|--o{ WorkflowTemplate : "marketplace"
  MasterProduct o|--o{ ChannelListing : "masterProduct"
  MasterProduct ||--o{ ProcessingCost : "master"
  MasterProduct ||--o{ ProductVariant : "masterProduct"
  MasterProduct o|--o| SourcingCandidate : "provenanceMasterProduct"
  Order o|--o{ CSRecord : "order"
  Order ||--o{ OrderLineItem : "order"
  Order o|--o{ OrderReturn : "order"
  Order ||--o{ Shipment : "order"
  Order ||--o{ UnshippedItem : "order"
  OrderLineItem o|--o{ OrderReturnLineItem : "orderLineItem"
  OrderLineItem ||--o{ ShipmentItem : "orderLineItem"
  OrderLineItem ||--o{ UnshippedItem : "orderLineItem"
  OrderReturn ||--o{ OrderReturnLineItem : "return"
  Organization ||--o{ ActionTask : "organization"
  Organization ||--o{ ActivityEvent : "organization"
  Organization ||--o{ AdAction : "organization"
  Organization ||--o{ AgentApprovalRequest : "organization"
  Organization ||--o{ AgentArtifact : "organization"
  Organization ||--o{ AgentAuthorizationEvent : "organization"
  Organization ||--o{ AgentConversation : "organization"
  Organization ||--o{ AgentCostEvent : "organization"
  Organization ||--o{ AgentInstance : "organization"
  Organization ||--o{ AgentInstanceToolPolicy : "organization"
  Organization ||--o{ AgentMessage : "organization"
  Organization ||--o{ AgentRun : "organization"
  Organization ||--o{ AgentRunEvent : "organization"
  Organization ||--o{ AgentRunRequest : "organization"
  Organization ||--o{ AgentRuntimeState : "organization"
  Organization ||--o{ AgentTaskSession : "organization"
  Organization ||--o{ AgentToolInvocation : "organization"
  Organization ||--o{ AiDirectJob : "organization"
  Organization ||--o{ Alert : "organization"
  Organization ||--o{ BusinessRule : "organization"
  Organization ||--o{ CandidateImage : "organization"
  Organization ||--o{ CategoryMapping : "organization"
  Organization ||--o{ ChannelAccount : "organization"
  Organization ||--o{ ChannelAccountDailyKpiSnapshot : "organization"
  Organization ||--o{ ChannelAdTargetDailySnapshot : "organization"
  Organization ||--o{ ChannelListing : "organization"
  Organization ||--o{ ChannelListingDailySnapshot : "organization"
  Organization ||--o{ ChannelListingDeletionOperation : "organization"
  Organization ||--o{ ChannelListingOption : "organization"
  Organization ||--o{ ChannelListingOptionDailySnapshot : "organization"
  Organization ||--o{ ChannelScrapeChunk : "organization"
  Organization ||--o{ ChannelScrapeRun : "organization"
  Organization ||--o{ ChannelScrapeSnapshot : "organization"
  Organization ||--o{ ContentAsset : "organization"
  Organization ||--o{ ContentGeneration : "organization"
  Organization ||--o{ ContentGenerationAssetUsage : "organization"
  Organization ||--o{ ContentGenerationGroup : "organization"
  Organization ||--o{ ContentGenerationSource : "organization"
  Organization ||--o{ ContentWorkspace : "organization"
  Organization ||--o{ ContentWorkspaceThumbnailSelection : "organization"
  Organization ||--o{ CoupangKeywordRankDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordSerpDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordTracker : "organization"
  Organization ||--o{ CoupangRepresentativeKeywordOverride : "organization"
  Organization ||--o{ CoupangWingSalesRankDailySnapshot : "organization"
  Organization ||--o{ CoupangWingTrackedProduct : "organization"
  Organization ||--o{ CoupangWingTrackedProductDailySnapshot : "organization"
  Organization ||--o{ CSRecord : "organization"
  Organization ||--o{ DetailPageArtifact : "organization"
  Organization ||--o{ DetailPageRevision : "organization"
  Organization ||--o{ ExecutionWorker : "organization"
  Organization ||--o{ GradeHistory : "organization"
  Organization ||--o{ InventoryCommitment : "organization"
  Organization ||--o{ InventoryCommitmentAllocation : "organization"
  Organization ||--o{ LegalEntity : "organization"
  Organization ||--o{ LiveCommerceBroadcastDailySnapshot : "organization"
  Organization ||--o{ LiveCommerceProductDailySnapshot : "organization"
  Organization ||--o{ ManualLedger : "organization"
  Organization ||--o{ MasterProduct : "organization"
  Organization ||--o{ NaverKeywordDailySnapshot : "organization"
  Organization ||--o{ NaverPopularKeywordDailySnapshot : "organization"
  Organization ||--o{ Order : "organization"
  Organization ||--o{ OrderLineItem : "organization"
  Organization ||--o{ OrderReturn : "organization"
  Organization ||--o{ OrderReturnLineItem : "organization"
  Organization ||--o{ OrganizationMembership : "organization"
  Organization ||--o{ PickingItem : "organization"
  Organization ||--o{ PickingList : "organization"
  Organization ||--o{ ProcessingCost : "organization"
  Organization ||--o{ ProductPreparation : "organization"
  Organization ||--o{ ProductRegistrationExecution : "organization"
  Organization ||--o{ ProductVariant : "organization"
  Organization ||--o{ ProductVariantComponent : "organization"
  Organization ||--o{ ProfitLoss : "organization"
  Organization ||--o{ PurchaseOrder : "organization"
  Organization ||--o{ PurchaseOrderItem : "organization"
  Organization ||--o{ PurchaseOrderSubmissionAttempt : "organization"
  Organization ||--o{ ReturnTransfer : "organization"
  Organization ||--o{ Review : "organization"
  Organization ||--o{ RocketPoCatalogLine : "organization"
  Organization ||--o{ RocketPoCatalogSnapshot : "organization"
  Organization ||--o{ RocketPurchaseConfirmation : "organization"
  Organization ||--o{ RocketPurchaseConfirmationAllocation : "organization"
  Organization ||--o{ RocketPurchaseConfirmationLine : "organization"
  Organization ||--o{ RocketPurchaseOrder : "organization"
  Organization ||--o{ RocketSupplyDailySnapshot : "organization"
  Organization ||--o{ SalesPlan : "organization"
  Organization ||--o{ ScrapeTarget : "organization"
  Organization ||--o{ SellpiaInventorySku : "organization"
  Organization ||--o{ SellpiaInventoryState : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntent : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntentReconciliation : "organization"
  Organization ||--o{ SellpiaProductMonthlySales : "organization"
  Organization ||--o{ SellpiaReceiptUploadBatch : "organization"
  Organization ||--o{ SellpiaSalesDailySnapshot : "organization"
  Organization ||--o{ Settlement : "organization"
  Organization ||--o{ Shipment : "organization"
  Organization ||--o{ ShipmentItem : "organization"
  Organization ||--o{ ShortsTrendDailySnapshot : "organization"
  Organization ||--o{ SourceImportRun : "organization"
  Organization ||--o{ Sourcing1688HotProductDailySnapshot : "organization"
  Organization ||--o{ SourcingCandidate : "organization"
  Organization ||--o{ SourcingWorkspaceSnapshot : "organization"
  Organization ||--o{ StockAudit : "organization"
  Organization ||--o{ StockTransfer : "organization"
  Organization ||--o{ Supplier : "organization"
  Organization ||--o{ SupplierPayment : "organization"
  Organization ||--o{ SupplierProduct : "organization"
  Organization ||--o{ SystemSetting : "organization"
  Organization ||--o{ Thumbnail : "organization"
  Organization ||--o{ ThumbnailAnalysis : "organization"
  Organization ||--o{ ThumbnailGeneration : "organization"
  Organization ||--o{ ThumbnailGenerationCandidate : "organization"
  Organization ||--o{ ThumbnailGenerationEvent : "organization"
  Organization ||--o{ ThumbnailGenerationInputImage : "organization"
  Organization ||--o{ ThumbnailRegistrationAttempt : "organization"
  Organization ||--o{ ThumbnailTracking : "organization"
  Organization ||--o{ ThumbnailTrackingDailySnapshot : "organization"
  Organization ||--o{ TrendSeedKeyword : "organization"
  Organization ||--o{ UnshippedItem : "organization"
  Organization ||--o{ Warehouse : "organization"
  Organization ||--o{ WorkflowTemplate : "organization"
  PickingList ||--o{ PickingItem : "pickingList"
  ProductPreparation ||--o{ ProductRegistrationExecution : "productPreparation"
  ProductVariant o|--o{ ChannelListingOption : "productVariant"
  ProductVariant ||--o{ ProductVariantComponent : "productVariant"
  ProductVariant o|--o{ RocketPurchaseConfirmationLine : "productVariant"
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder ||--o{ PurchaseOrderSubmissionAttempt : "purchaseOrder"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  RocketPoCatalogSnapshot ||--o{ RocketPoCatalogLine : "snapshot"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationLine : "confirmation"
  RocketPurchaseConfirmationLine ||--o{ RocketPurchaseConfirmationAllocation : "confirmationLine"
  SellpiaInventorySku ||--o{ InventoryCommitmentAllocation : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ PickingItem : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ ProductVariantComponent : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ PurchaseOrderItem : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ ReturnTransfer : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ RocketPurchaseConfirmationAllocation : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ StockTransfer : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ SupplierProduct : "sellpiaInventorySku"
  SellpiaOrderTransmissionIntent ||--o{ SellpiaOrderTransmissionIntentReconciliation : "intent"
  Shipment ||--o{ ShipmentItem : "shipment"
  SourceImportRun o|--o{ ChannelListing : "lastImportRun"
  SourceImportRun o|--o{ ChannelListingOption : "lastImportRun"
  SourceImportRun o|--o{ ChannelScrapeRun : "sourceImportRun"
  SourceImportRun o|--o{ Order : "sourceImportRun"
  SourceImportRun ||--|| RocketPoCatalogSnapshot : "sourceImportRun"
  SourceImportRun ||--o{ RocketPurchaseConfirmation : "sourceImportRun"
  SourceImportRun o|--o{ SellpiaInventorySku : "lastImportRun"
  SourceImportRun o|--o{ SellpiaInventoryState : "lastCompletedImportRun"
  SourcingCandidate ||--o{ CandidateImage : "candidate"
  SourcingCandidate o|--o{ ChannelListing : "sourceCandidate"
  SourcingCandidate o|--o{ ContentGeneration : "sourceCandidate"
  SourcingCandidate o|--o{ ContentGenerationSource : "sourceCandidate"
  SourcingCandidate o|--o{ ContentWorkspace : "sourceCandidate"
  SourcingCandidate ||--o{ ProductPreparation : "sourceCandidate"
  SourcingCandidate o|--o{ ThumbnailGeneration : "sourceCandidate"
  Supplier o|--o{ PurchaseOrder : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier ||--o{ SupplierProduct : "supplier"
  ThumbnailGeneration o|--o{ ContentWorkspaceThumbnailSelection : "sourceGeneration"
  ThumbnailGeneration o|--o{ ProductPreparation : "selectedThumbnailGeneration"
  ThumbnailGeneration ||--o{ ThumbnailGenerationCandidate : "generation"
  ThumbnailGeneration ||--o{ ThumbnailGenerationEvent : "generation"
  ThumbnailGeneration ||--o{ ThumbnailGenerationInputImage : "generation"
  ThumbnailGeneration ||--o{ ThumbnailRegistrationAttempt : "generation"
  ThumbnailGeneration ||--o{ ThumbnailTracking : "generation"
  ThumbnailGenerationCandidate o|--o{ ContentWorkspaceThumbnailSelection : "sourceCandidate"
  ThumbnailGenerationCandidate o|--o{ ProductPreparation : "selectedThumbnailGenerationCandidate"
  ThumbnailGenerationCandidate o|--o{ ThumbnailGenerationInputImage : "sourceThumbnailCandidate"
  ThumbnailTracking ||--o{ ThumbnailTrackingDailySnapshot : "tracking"
  User o|--o{ ActionTask : "assigneeUser"
  User o|--o{ AgentApprovalRequest : "approver"
  User o|--o{ AgentApprovalRequest : "decidedBy"
  User o|--o{ AgentApprovalRequest : "requestedBy"
  User o|--o{ AgentAuthorizationEvent : "decidedBy"
  User o|--o{ AgentAuthorizationEvent : "requestedBy"
  User o|--o{ AgentConversation : "createdBy"
  User o|--o{ AgentRunRequest : "requestedBy"
  User o|--o{ Alert : "actorUser"
  User o|--o{ ChannelListingDeletionOperation : "requestedByUser"
  User o|--o{ ContentAsset : "createdByUser"
  User o|--o{ ContentGeneration : "triggeredByUser"
  User o|--o{ ContentWorkspace : "createdByUser"
  User o|--o{ ContentWorkspaceThumbnailSelection : "createdByUser"
  User o|--o{ DetailPageArtifact : "createdByUser"
  User o|--o{ DetailPageRevision : "createdByUser"
  User ||--o{ InventoryCommitment : "creator"
  User o|--o{ InventoryCommitment : "releaser"
  User o|--o{ InventoryCommitment : "settler"
  User o|--o{ OrganizationMembership : "invitedBy"
  User ||--o{ OrganizationMembership : "user"
  User o|--o{ ProductPreparation : "approvedByUser"
  User o|--o{ ProductPreparation : "createdByUser"
  User o|--o{ ProductRegistrationExecution : "requestedByUser"
  User o|--o{ PurchaseOrderSubmissionAttempt : "reconciler"
  User ||--o{ RocketPurchaseConfirmation : "confirmer"
  User o|--o{ RocketPurchaseConfirmation : "releaser"
  User o|--o{ SellpiaInventoryState : "activeSyncOwner"
  User ||--o{ SellpiaOrderTransmissionIntent : "creator"
  User ||--o{ SellpiaOrderTransmissionIntentReconciliation : "reconciler"
  User o|--o{ SourceImportRun : "manualFreshExportConfirmer"
  User o|--o{ SourcingCandidate : "rejectedByUser"
  User o|--o{ SourcingCandidate : "triggeredByUser"
  User o|--o{ ThumbnailGeneration : "triggeredByUser"
  User o|--o{ ThumbnailGenerationEvent : "actor"
  User o|--o{ WorkflowRun : "triggeredByUser"
  Warehouse o|--o{ Shipment : "warehouse"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
  WorkflowRun o|--o{ AgentRunRequest : "sourceWorkflowRun"
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```
