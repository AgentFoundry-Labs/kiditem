# Database ERD

> Generated from `prisma/models/*.prisma`. Do not edit the diagram by hand.
> Regenerate this file with `npm run db:erd` after Prisma schema changes.

This ERD is a development-time navigation aid. The source of truth is the Prisma schema under `prisma/`.

## Sources

- `prisma/models/advertising.prisma`
- `prisma/models/agent-work.prisma`
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
| [AgentOS](erd/agentos.md) | 1 |
| [AI](erd/ai.md) | 22 |
| [Automation](erd/automation.md) | 2 |
| [Channels](erd/channels.md) | 26 |
| [Core](erd/core.md) | 16 |
| [Finance](erd/finance.md) | 1 |
| [Inventory](erd/inventory.md) | 6 |
| [Orders](erd/orders.md) | 9 |
| [Sourcing](erd/sourcing.md) | 32 |
| [Supply](erd/supply.md) | 13 |
| [System](erd/system.md) | 12 |

## Model Index

| Model | Domain | Table | Description |
|---|---:|---|---|
| AdAction | Advertising | `ad_actions` | 광고 자동 실행 큐. ChannelAdTargetDailySnapshot→AdAction→ExecutionTask→ExecutionLog 파이프라인. |
| ExecutionLog | Advertising | `execution_logs` | - |
| ExecutionTask | Advertising | `execution_tasks` | - |
| ExecutionWorker | Advertising | `execution_workers` | - |
| ScrapeTarget | Advertising | `scrape_targets` | - |
| CapabilityInvocation | AgentOS | `capability_invocations` | Exact request-driven mutation admission and replay receipt. |
| AiDirectJob | AI | `ai_direct_jobs` | Durable queue and projection checkpoint for direct thumbnail, detail-page, and image-edit model work. |
| ContentAsset | AI | `content_assets` | Organization-scoped managed media with optional generation-group provenance. |
| ContentGeneration | AI | `content_generations` | - |
| ContentGenerationAssetUsage | AI | `content_generation_asset_usages` | Current image assets used by a generated content row. Asset location stays on ContentAsset; this table is the replace-on-save usage set. |
| ContentGenerationGroup | AI | `content_generation_groups` | Same-input generation group owned by a content workspace. |
| ContentGenerationSource | AI | `content_generation_sources` | Generation-level provenance. The source of a generated work unit can be a sourcing candidate, input asset, or another generation. |
| ContentWorkspace | AI | `content_workspaces` | Product content workspace owned by a sourcing candidate, channel listing, or direct detail page. |
| ContentWorkspaceThumbnailSelection | AI | `content_workspace_thumbnail_selections` | Stable workspace-owned thumbnail adoption with optional generation provenance. |
| DetailPageArtifact | AI | `detail_page_artifacts` | Candidate-centered editable detail-page artifact. One artifact owns the user-visible draft line; revisions keep generated/manual HTML history. |
| DetailPageImageArtifact | AI | `detail_page_image_artifacts` | Durable single-JPEG marketplace rendition for one immutable detail-page revision and renderer variant. |
| DetailPageImageRenderIntent | AI | `detail_page_image_render_intents` | Short-lived organization-scoped claim that binds a browser renderer to one exact detail-page revision and object key. |
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
| WorkflowRun | Automation | `workflow_runs` | Durable deterministic workflow run. |
| WorkflowTemplate | Automation | `workflow_templates` | Deterministic workflow definition. |
| ChannelAccountDailyKpiSnapshot | Channels | `channel_account_daily_kpi_snapshots` | 채널 계정/스토어 단위 KPI 일별 정규화 fact (listing 에 귀속되지 않는 dashboard KPI 용). |
| ChannelAdTargetDailySnapshot | Channels | `channel_ad_target_daily_snapshots` | 채널 광고 타겟(캠페인/키워드/상품)의 일별 정규화 fact. 기간 view 는 SUM 으로 derive. |
| ChannelListingDailySnapshot | Channels | `channel_listing_daily_snapshots` | 채널 listing 의 일별 정규화 상태. 반복 scrape 는 businessDate row 를 upsert. |
| ChannelListingDeletionOperation | Channels | `channel_listing_deletion_operations` | Channel listing 삭제의 provider side effect 실행 기록. 삭제 대상 외부 listing identity를 요청 시점에 동결한다. |
| ChannelListingOptionDailySnapshot | Channels | `channel_listing_option_daily_snapshots` | 채널 listing option/vendor item 의 일별 정규화 상태. |
| ChannelRegistrationOwnerIdempotencyReceipt | Channels | `channel_registration_owner_idempotency_receipts` | Agent-triggered registration mutation receipt keyed by the exact Channels owner input, atomically retained with local listing resolution. |
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
| MallListingProfile | Channels | `mall_listing_profiles` | 몰 계정별 송신 프로필(배송/반품/출고지/판매정책). 사방넷 부가정보와 달리 복제·대량 적용·삭제가 가능하다. |
| MallOperationOutcome | Channels | `mall_operation_outcomes` | 쇼핑몰 에이전트의 기억 — 몰 작업 결과 한 줄(주문수집 · 송장 전송 · 등록 폼 채움 · 로그인 테스트 · 로그인 확인). append-only 이고 같은 idempotencyKey 는 한 번만 쓴다. 비밀번호 · 받는 사람 · 주소 · 주문번호는 담지 않는다 — 개수와 이유 코드만. |
| ProductCertification | Channels | `product_certifications` | KC/어린이제품 인증. 유효기간이 지난 인증은 송신 게이트에서 차단한다. certType='none'은 '해당 없음'을 운영자가 명시적으로 선언한 상태다. |
| ProductNoticeAttribute | Channels | `product_notice_attributes` | 상품정보고시. 미충족이면 송신을 시작하지 않는다 — 사방넷은 몰이 거절한 뒤에야 알려줬다. channel 이 있으면 그 몰 전용 override. |
| RocketPoCatalogLine | Channels | `rocket_po_catalog_lines` | Normalized Rocket PO line and confirmation-workbook evidence owned by one completed catalog snapshot. |
| RocketPoCatalogSnapshot | Channels | `rocket_po_catalog_snapshots` | Completed Coupang Rocket PO collection evidence that can be reopened without another provider collection. Inventory capacity is never stored here. |
| SellpiaManualMatchAlias | Channels | `sellpia_manual_match_aliases` | Exact normalized marketplace-title evidence linking one historical Sellpia manual match to an active physical SKU and positive unit quantity. |
| SellpiaManualMatchSnapshot | Channels | `sellpia_manual_match_snapshots` | Current organization-scoped, read-only Sellpia manual-match evidence restricted to exact aliases used by current channel listings. |
| SellpiaProductMonthlySales | Channels | `sellpia_product_monthly_sales` | Sellpia 상품별 이익현황(stat_prd_profit) 월별 판매수량(재고 소진) fact. stat_action.ajax.html(mode=stat_prd_profit)의 graph(월별 매입액/판매액/판매수량)에서 상품×옵션×연월로 수집. 재고관리용 1개월/2개월 평균 소진량 산정 소스. 메이크샵 주문 데이터 기준. |
| SellpiaSalesDailySnapshot | Channels | `sellpia_sales_daily_snapshots` | Sellpia 판매현황(sale_summary) 몰별·일별 매출 fact. order_search.ajax.html(mode=selldate, 주문일자 기준)에서 판매처(seller)별로 수집. channelGroup 으로 rocket(쿠팡-직배송) / others(쿠팡윙+기타 전체몰) 버킷을 구분해 대시보드 '몰별 매출' 섹션에 표시한다. price=판매금액, buy_price=매입금액, amount=판매수량. |
| AuthSession | Core | `auth_sessions` | Revocable KidItem-owned browser and extension authentication session. Only a SHA-256 token hash is persisted. |
| CategoryMapping | Core | `category_mappings` | - |
| ChannelAccount | Core | `channel_accounts` | Marketplace/store account such as Coupang Wing or Naver SmartStore. Operational channel ownership is distinct from the SaaS organization. |
| ChannelListing | Core | `channel_listings` | 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등. |
| ChannelListingOption | Core | `channel_listing_options` | One sellable SKU under a channel listing. |
| ChannelListingOptionInventoryComponent | Core | `channel_listing_option_inventory_components` | Confirmed Sellpia inventory consumption for one channel sellable option. |
| LegalEntity | Core | `legal_entities` | Legal/business entity under an organization. This stores tax, invoice, and settlement identity separately from the SaaS organization boundary. |
| MasterProduct | Core | `master_products` | Organization-owned canonical inventory product and sole official product ABC identity. |
| MasterProductAbcEvaluation | Core | `master_product_abc_evaluations` | Current Products-owned automatic profitability ABC explanation snapshot for one MasterProduct. |
| MasterProductAbcFormulaState | Core | `master_product_abc_formula_states` | One Prisma-owned current-formula pointer for each organization. |
| MasterProductAbcFormulaVersion | Core | `master_product_abc_formula_versions` | Immutable organization-owned formula versions for automatic product profitability ABC. |
| MasterProductAbcGradeHistory | Core | `master_product_abc_grade_histories` | Immutable publication history for automatic product profitability ABC grade changes. |
| Organization | Core | `organizations` | - |
| OrganizationMembership | Core | `organization_memberships` | B2B customer/workspace membership. A user may belong to multiple organizations; this row supplies request organization and role. |
| SourceImportRun | Core | `source_import_runs` | Durable provenance and publication fence for Sellpia and channel full-snapshot imports. |
| User | Core | `users` | Human or system account. Organization membership is the source of truth. |
| SalesPlan | Finance | `sales_plans` | - |
| CoupangShipmentDateSummary | Inventory | `coupang_shipment_date_summaries` | Persisted Coupang shipment 발송일별 건수/박스 요약 snapshot so the calendar survives reload and only new dates are collected. |
| ReturnTransfer | Inventory | `return_transfers` | - |
| SellpiaInventorySku | Inventory | `sellpia_inventory_skus` | One physical Sellpia source SKU owned by at most one canonical MasterProduct, with its latest imported current stock. |
| SellpiaInventoryState | Inventory | `sellpia_inventory_states` | Organization-scoped Sellpia inventory trust state, source binding, generation fence, and active collection lease. |
| StockTransfer | Inventory | `stock_transfers` | Warehouse-to-warehouse movement record. It never mutates SellpiaInventorySku.currentStock. |
| Warehouse | Inventory | `warehouses` | - |
| CoupangDirectPoSnapshot | Orders | `coupang_direct_po_snapshots` | 쿠팡직배송 발주확정 스냅샷. 입고예정일 달력이 매번 쿠팡을 다시 긁지 않도록 |
| Order | Orders | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderLineItem | Orders | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| OrderReturn | Orders | `order_returns` | 채널-agnostic 반품 aggregate. 반품 item 은 OrderReturnLineItem 으로 정규화. type=RETURN/EXCHANGE 구분 first-class. |
| OrderReturnLineItem | Orders | `order_return_line_items` | 반품 라인 아이템 — 반품 건 내 SKU 단위 상세. return FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | Orders | `reviews` | 채널 상품평 원본 1건. 쿠팡은 Wing 상품평 화면(`/tenants/cs/product/review`)을 |
| SellpiaOrderTransmissionIntent | Orders | `sellpia_order_transmission_intents` | Organization-scoped idempotency fence for browser Sellpia order transmission. It does not represent or mutate inventory freshness. |
| SellpiaOrderTransmissionIntentReconciliation | Orders | `sellpia_order_transmission_intent_reconciliations` | Append-only owner/admin audit for resolving an ambiguous Sellpia order transmission outcome. |
| Settlement | Orders | `settlements` | 월별 정산 (예상 vs 실제 비교). |
| CandidateImage | Sourcing | `sourcing_candidate_images` | 소싱 후보가 소유하는 이미지 갤러리. 소싱 콘텐츠와 썸네일 생성 입력으로 사용한다. |
| LiveCommerceBroadcastDailySnapshot | Sourcing | `live_commerce_broadcast_daily_snapshots` | 타오바오 공식 API 또는 로그인된 1688·도우인 브라우저 화면에서 수집한 라이브 방송 일별 스냅샷. source와 broadcastId가 외부 방송 식별자를 이룬다. |
| LiveCommerceProductDailySnapshot | Sourcing | `live_commerce_product_daily_snapshots` | 중국 라이브 방송에 노출된 상품의 일별 스냅샷. broadcastId로 방송 스냅샷과 논리적으로 연결하고 상품 단위 비교를 지원한다. |
| NaverKeywordDailySnapshot | Sourcing | `naver_keyword_daily_snapshots` | 네이버 키워드(검색광고 월검색량 + 데이터랩 검색어트렌드) 일별 스냅샷. 시드 키워드당 하루 1행(최신본 upsert). trendRatio 는 latestRatio 반올림(0-100). |
| NaverPopularKeywordDailySnapshot | Sourcing | `naver_popular_keyword_daily_snapshots` | 네이버 데이터랩 인기키워드 보드(출산/육아·완구/인형·문구/사무 등)의 일별 순위 스냅샷. 보드×키워드 identity를 사용하고 매 수집마다 보드×일자 범위를 통째로 교체한다. |
| ProductRegistrationExecution | Sourcing | `product_registration_executions` | Reviewed product preparation의 marketplace create/reconcile side effect 실행 기록. 준비 입력과 provider lifecycle을 분리해 보존한다. |
| ShortsTrendDailySnapshot | Sourcing | `shorts_trend_daily_snapshots` | 쇼츠트렌드(shortstrend.co.kr) 급상승 쇼츠 일별 스냅샷. rank 는 소스 노출 순위, videoKey 는 영상 식별자. video×일자당 1행. |
| Sourcing1688OfferKeywordObservation | Sourcing | `sourcing_1688_offer_keyword_observations` | 1688 키워드 검색에서 수집한 정확한 offer/variant 관측치. 같은 offer가 여러 키워드에서 발견된 provenance를 보존한다. |
| SourcingCandidate | Sourcing | `sourcing_candidates` | 외부 플랫폼에서 스크랩한 소싱 후보. MasterProduct와 분리된 sourcing inbox. |
| SourcingCollectionSourceControl | Sourcing | `sourcing_collection_source_controls` | Optional organization-level pause for an allowlisted collection source. Absence means enabled. |
| SourcingDecisionBatch | Sourcing | `sourcing_decision_batches` | Immutable point-in-time policy decision header. Items and evidence are inserted in the same transaction after deterministic evaluation succeeds. |
| SourcingDecisionBatchItem | Sourcing | `sourcing_decision_batch_items` | One immutable canonical test_order, hold, or reject decision. Offer-only rows support RFQ provenance before an exact LaunchCandidate exists. |
| SourcingDecisionEvidence | Sourcing | `sourcing_decision_evidence` | Immutable many-to-many link from one decision item to the exact observations available at its decision cutoff. |
| SourcingEvidenceIngestionRun | Sourcing | `sourcing_evidence_ingestion_runs` | Durable collector attempt with a fenced lease, request identity, collection window, coverage, and terminal result. |
| SourcingEvidenceObservation | Sourcing | `sourcing_evidence_observations` | Append-only, revision-aware source fact. Feature and decision reads must apply both availableAt and ingestedAt point-in-time cutoffs. |
| SourcingInterestTarget | Sourcing | `sourcing_interest_targets` | 서버가 소유하는 관심 키워드. 화면의 전체 JSON snapshot 대체를 금지하고 낙관적 버전으로 개별 변경을 보장한다. |
| SourcingKeywordPreference | Sourcing | `sourcing_keyword_preferences` | 조직별 키워드 제외 설정. 전체 JSON snapshot 대신 키 하나를 낙관적으로 갱신한다. |
| SourcingLaunchCandidate | Sourcing | `sourcing_launch_candidates` | Immutable launch and outcome identity that freezes an exact supplier variant, Korean bundle, launch plan, compliance/IP/quality versions, target account, price, and initial quantity. |
| SourcingOwnerIdempotencyReceipt | Sourcing | `sourcing_owner_idempotency_receipts` | 최종 소싱 capability의 불변 owner idempotency 결과. 후보 수명주기와 독립적으로 replay 결과를 보존한다. |
| SourcingRecommendationItem | Sourcing | `sourcing_recommendation_items` | 한 추천 실행 안의 stable offer/variant 후보. 점수와 근거는 이 행을 기준으로 추적한다. |
| SourcingRecommendationItemEvidence | Sourcing | `sourcing_recommendation_item_evidence` | 추천 후보가 사용한 immutable evidence 링크. retention과 재현성의 기준이다. |
| SourcingRecommendationRun | Sourcing | `sourcing_recommendation_runs` | 재현 가능한 추천 계산의 immutable header. 입력 manifest와 모델 버전을 함께 고정한다. |
| SourcingReviewBatch | Sourcing | `sourcing_review_batches` | Final 화면에서 생성하는 immutable review handoff. procurement intent나 provider side effect를 만들지 않는다. |
| SourcingReviewBatchItem | Sourcing | `sourcing_review_batch_items` | review batch가 실제로 검토한 recommendation, validation, exact offer observation을 동결한다. |
| SourcingReviewSelection | Sourcing | `sourcing_review_selections` | Entry/Final 화면 선택 상태의 org-scoped, optimistic-concurrency record. |
| SourcingSourceEntitlementVersion | Sourcing | `sourcing_source_entitlement_versions` | Reviewed permission and coverage contract for one collection source scope. Append-only versions; exactly one row per scope is current. |
| SourcingValidationCheck | Sourcing | `sourcing_validation_checks` | 하나의 검증 episode를 구성하는 데이터 기반 check 결과. |
| SourcingValidationCheckEvidence | Sourcing | `sourcing_validation_check_evidence` | 검증 check가 참조한 immutable evidence link. |
| SourcingValidationEpisode | Sourcing | `sourcing_validation_episodes` | 추천 후보의 실데이터 검증 life-cycle. fixture 점수는 이 record로 대체된다. |
| SourcingWorkspaceSnapshot | Sourcing | `sourcing_workspace_snapshots` | 조직/KST 날짜/scope 단위의 소싱 AI 결과 캐시. 오늘의 추천/키워드 분석 결과를 최신 1개로 재사용한다. |
| TiktokCreativeTrendDailySnapshot | Sourcing | `tiktok_creative_trend_daily_snapshots` | 틱톡 크리에이티브 센터(Creative Center)에서 확장이 스크랩한 인기 트렌드 일별 스냅샷. trendType(hashtag\|keyword\|product\|song)으로 종류를, region(국가코드)으로 시장을 구분하고 (region,trendType,entityKey)가 외부 식별자를 이룬다. viewCount 는 int4 를 초과할 수 있어 BigInt. ⚠️ 라이브 틱톡 원본은 봇/리전 차단이라 무료로는 확장 스크랩 경로로만 적재한다([[reference_market_trend_research_tools]]). |
| TrendSeedKeyword | Sourcing | `trend_seed_keywords` | 문구·완구 시장 트렌드 정기 수집의 시드 키워드. sources 로 몰별(naver/shorts/1688) 수집 대상을 제어. keywordCn 은 1688 中文 검색어(null이면 keyword 사용). |
| ProcurementTestIntent | Supply | `procurement_test_intents` | Reviewable pre-inventory RFQ, sample, or test-order intent. Approval never submits to a provider; provider IO remains PurchaseOrderSubmissionAttempt-owned. |
| PurchaseOrder | Supply | `purchase_orders` | 발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2). |
| PurchaseOrderItem | Supply | `purchase_order_items` | - |
| PurchaseOrderSubmissionAttempt | Supply | `purchase_order_submission_attempts` | Durable idempotency intent and reconciliation record for an external purchase-order submission. |
| RocketPurchaseConfirmation | Supply | `rocket_purchase_confirmations` | Durable immutable Rocket workbook export and external synchronization workflow. |
| RocketPurchaseConfirmationAllocation | Supply | `rocket_purchase_confirmation_allocations` | Immutable component recipe evidence captured for one Rocket workbook line. |
| RocketPurchaseConfirmationLine | Supply | `rocket_purchase_confirmation_lines` | Immutable Rocket workbook line decision and matching final-order evidence. |
| RocketPurchaseConfirmationTransmission | Supply | `rocket_purchase_confirmation_transmissions` | One transport-specific Coupang collection probe and optional stable Sellpia transmission key for a Rocket workbook export. |
| Supplier | Supply | `suppliers` | - |
| SupplierOfferPriceTier | Supply | `supplier_offer_price_tiers` | Immutable quantity price tier nested under one supplier-offer snapshot. |
| SupplierOfferSkuSnapshot | Supply | `supplier_offer_sku_snapshots` | Immutable observed supplier-offer identity and commercial terms before a Sellpia inventory SKU exists. identityStatus is offer_only or exact_variant. |
| SupplierPayment | Supply | `supplier_payments` | - |
| SupplierProduct | Supply | `supplier_products` | 공급사별 Sellpia 물리 상품 단위 공급가/주공급처 정책. |
| ActionTask | System | `action_tasks` | 액션 보드 (수동 할일 관리). |
| ActivityEvent | System | `activity_events` | - |
| Alert | System | `alerts` | - |
| BusinessRule | System | `business_rules` | 온톨로지 룰 엔진 (조건→액션 자동화). |
| DataMigrationRun | System | `data_migration_runs` | 운영 data migration ledger. Schema-only db push와 별도로 영속 데이터 보정 실행 여부를 기록한다. |
| FeatureGate | System | `feature_gates` | 피처 플래그. allowedOrganizations: string[] 로 회사별 enable. |
| Marketplace | System | `marketplace` | type 으로 agent/workflow 카탈로그 통합. |
| OperationRun | System | `operation_runs` | Organization-scoped top-level execution ledger for dashboard, domain, Agent OS, and scheduled work. |
| OperationRunCheckpoint | System | `operation_run_checkpoints` | Immutable monotonic recovery checkpoint owned by an organization-scoped Operation run. |
| OperationSchedule | System | `operation_schedules` | Organization-managed cron schedule for a code-owned operation definition. All schedules start disabled. |
| RulesEvaluationApplication | System | `rules_evaluation_applications` | Exactly-once Rules result-application receipt for one organization-scoped Operation run. |
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
  AuthSession {
    String id PK
    String userId FK
    String tokenHash UK
    DateTime createdAt
    DateTime expiresAt
    DateTime revokedAt
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
  CapabilityInvocation {
    String id PK
    String organizationId FK
    String initiatingUserId FK
    String capabilityKey
    String actingAgentKey
    String requestKey
    Json canonicalInput
    String inputHash
    String status
    String approvalStatus
    String approvalInputHash
    DateTime approvalRequestedAt
    DateTime approvalExpiresAt
    String approvalDecidedByUserId FK
    String approvalDecisionReason
    DateTime approvalDecidedAt
    Json result
    Json error
    DateTime createdAt
    DateTime updatedAt
    DateTime finishedAt
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
    String channelAccountId FK
    String channel
    DateTime businessDate
    String listingId FK
    String listingOptionId FK
    String externalId
    String externalOptionId
    String targetType
    String targetKey
    String campaignId
    String campaignIdentity
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
    String adCoverageStatus
    DateTime adObservedAt
    Int trafficVisitors
    Int trafficViews
    Int trafficCartAdds
    Int trafficOrders
    Int trafficSalesQty
    Int trafficRevenue
    String trafficCoverageStatus
    DateTime trafficObservedAt
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
  ChannelListingOptionInventoryComponent {
    String id PK
    String organizationId FK
    String channelListingOptionId FK
    String sellpiaInventorySkuId FK
    Int quantity
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelRegistrationOwnerIdempotencyReceipt {
    String id PK
    String organizationId FK
    String capabilityKey
    String ownerIdempotencyKey
    String requestHash
    Json resultJson
    DateTime createdAt
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
  CoupangShipmentDateSummary {
    String id PK
    String organizationId FK
    String shipmentDate
    Int count
    Int boxes
    DateTime capturedAt
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
  DetailPageImageArtifact {
    String id PK
    String organizationId FK
    String revisionId FK
    String variant
    Int outputWidth
    String objectKey
    String imageUrl
    String contentType
    Int byteLength
    Int pixelWidth
    Int pixelHeight
    String sha256
    String rendererKind
    String createdByUserId FK
    DateTime createdAt
    DateTime updatedAt
  }
  DetailPageImageRenderIntent {
    String id PK
    String organizationId FK
    String sourceCandidateId FK
    String detailPageArtifactId FK
    String revisionId FK
    String variant
    Int outputWidth
    String objectKey
    String state
    Int attempt
    DateTime expiresAt
    String requestedByUserId FK
    String claimedByUserId FK
    DateTime claimedAt
    DateTime uploadedAt
    DateTime completedAt
    DateTime failedAt
    String failureCode
    String failureMessage
    String completedArtifactId FK
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
  MallListingProfile {
    String id PK
    String organizationId FK
    String channelAccountId FK
    String name
    Boolean isDefault
    Boolean isActive
    Json shippingJson
    Json returnJson
    Json addressJson
    String asPhone
    String categoryCode
    String namePrefix
    String nameSuffix
    String descriptionHeaderHtml
    String descriptionFooterHtml
    Json extraJson
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  MallOperationOutcome {
    String id PK
    String organizationId FK
    String actorUserId FK
    String idempotencyKey
    String mallKey
    String operation
    String outcome
    String reasonCode
    String message
    Int itemCount
    Int failedCount
    Int warningCount
    String trigger
    String runId
    DateTime occurredAt
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
  MasterProductAbcEvaluation {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String calculationStatus
    Decimal rawScore
    Decimal adjustedScore
    Decimal reliability
    Decimal weightedRevenue
    Decimal weightedOrderTimeCogs
    Decimal weightedAdSpend
    Decimal weightedContributionProfit
    Decimal profitVelocity30
    Decimal weightedContributionMargin
    Decimal lossRecurrence
    Int paidOrderCount
    Int observationDays
    DateTime firstValidPaidSaleAt
    DateTime sourceCoverageStartDate
    DateTime sourceCoverageEndDate
    DateTime evaluationCutoffDate
    DateTime sellpiaCoverageStartDate
    DateTime sellpiaCoverageEndDate
    String sellpiaSourceStatus
    DateTime sellpiaSourceCapturedAt
    DateTime advertisingCoverageStartDate
    DateTime advertisingCoverageEndDate
    String advertisingSourceStatus
    DateTime advertisingSourceCapturedAt
    String ordersSourceStatus
    DateTime ordersCoverageStartDate
    DateTime ordersCoverageEndDate
    DateTime ordersSourceCapturedAt
    String mappingSourceStatus
    BigInt mappingInventoryGeneration
    DateTime mappingVerifiedAt
    Json costComponentsJson
    String statusDetail
    String runToken
    DateTime calculatedAt
  }
  MasterProductAbcFormulaState {
    String organizationId PK,FK
    String activeFormulaVersionId FK
    DateTime activatedAt
    Int revision
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcFormulaVersion {
    String id PK
    String organizationId FK
    String formulaKey
    Int version
    String calculationCodeChecksum
    Json formulaJson
    String formulaChecksum
    DateTime trainingStartDate
    DateTime trainingEndDate
    Int sampleCount
    Int foldCount
    Json calibrationMetricsJson
    DateTime firstActivatedAt
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcGradeHistory {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String oldGrade
    String newGrade
    String calculationStatus
    Decimal adjustedScore
    Decimal weightedContributionProfit
    Decimal weightedContributionMargin
    DateTime sourceCutoffDate
    String reason
    DateTime calculatedAt
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
  OperationRun {
    String id PK
    String organizationId FK
    String operationKey
    Int definitionVersion
    String ownerDomain
    String title
    String engineType
    String resourceClass
    Int executionTimeoutMs
    String status
    String triggerSource
    String requestedByUserId FK
    String parentRunId FK
    String scheduleId FK
    String idempotencyKey
    Json input
    Json result
    Float progress
    String stage
    DateTime stageUpdatedAt
    Int progressCurrent
    Int progressTotal
    DateTime deadlineAt
    String nativeRunType
    String nativeRunId
    Int attempts
    Int maxAttempts
    String claimedBy
    String attemptToken
    DateTime claimedAt
    DateTime leaseExpiresAt
    DateTime scheduledFor
    String errorCode
    String errorMessage
    DateTime startedAt
    DateTime finishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  OperationRunCheckpoint {
    String id PK
    String organizationId FK
    String operationRunId FK
    BigInt sequence
    String kind
    Json state
    DateTime createdAt
  }
  OperationSchedule {
    String id PK
    String organizationId FK
    String operationKey
    String cronExpression
    String timeZone
    String misfirePolicy
    Json input
    Boolean enabled
    DateTime nextRunAt
    DateTime lastScheduledFor
    String createdByUserId FK
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
  ProductCertification {
    String id PK
    String organizationId FK
    String masterProductId FK
    String certType
    String certNumber
    String certAgency
    Int targetAgeMonths
    DateTime validFrom
    DateTime validTo
    String documentUrl
    DateTime createdAt
    DateTime updatedAt
  }
  ProductNoticeAttribute {
    String id PK
    String organizationId FK
    String masterProductId FK
    String noticeCategory
    Json attributesJson
    String channel
    String source
    DateTime createdAt
    DateTime updatedAt
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
    String ownerIdempotencyKey
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
    String channelListingOptionId FK
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
  RulesEvaluationApplication {
    String id PK
    String organizationId FK
    String operationRunId FK
    Int productCount
    Int violationCount
    Int criticalCount
    DateTime appliedAt
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
    String masterProductId FK
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
    String requestedSyncScope
    DateTime syncNotBefore
    String activeSyncToken
    String activeSyncOwnerUserId FK
    DateTime activeSyncStartedAt
    DateTime activeSyncLeaseExpiresAt
    String activeSyncScope
    BigInt requestedGeneration
    BigInt activeGeneration
    BigInt verifiedGeneration
    BigInt failedGeneration
    DateTime lastAttemptAt
    String lastAttemptStatus
    String lastAttemptSyncScope
    String lastErrorCode
    String lastErrorMessage
    String freshnessFence
    DateTime createdAt
    DateTime updatedAt
  }
  SellpiaManualMatchAlias {
    String id PK
    String organizationId FK
    String snapshotId FK
    String sellpiaInventorySkuId FK
    String aliasTitle
    String normalizedAlias
    Int itemCount
    String matchedType
    Int evidenceCount
    DateTime createdAt
  }
  SellpiaManualMatchSnapshot {
    String id PK
    String organizationId FK,UK
    String sourceOrigin
    String sourcePath
    Int schemaVersion
    Int targetCount
    Int matchedTargetCount
    Int aliasCount
    String snapshotHash
    DateTime capturedAt
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
    String costBasis
    Boolean vatIncluded
    DateTime coverageStartDate
    DateTime coverageEndDate
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
    DateTime coverageStartDate
    DateTime coverageEndDate
    DateTime createdAt
    DateTime updatedAt
  }
  Sourcing1688OfferKeywordObservation {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String ingestionRunId FK
    DateTime businessDate
    String sourceKeywordNormalized
    String externalOfferId
    String variantKeyNormalized
    String sourceUrl
    String title
    String supplierName
    String imageUrl
    Int rank
    Decimal priceCny
    Int monthlySales
    Json rawOffer
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingCandidate {
    String id PK
    String organizationId FK
    String sourceUrl
    String sourcePlatform
    String externalOfferId
    String variantKeyNormalized
    String sourceIdentityHash
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
  SourcingCollectionSourceControl {
    String id PK
    String organizationId FK
    String sourceKey
    Boolean enabled
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingDecisionBatch {
    String id PK
    String organizationId FK
    String requestedByUserId FK
    String idempotencyKey
    String requestHash
    String decisionMode
    DateTime businessDate
    DateTime decisionAt
    DateTime evidenceCutoffAt
    String policyKey
    String policyVersion
    String modelVersionKey
    String status
    String keyword
    String category
    String modelPipeline
    String modelGeneratorVersion
    DateTime expiresAt
    String heuristicArtifactHash
    Int capitalBudgetKrw
    Int testSlotLimit
    String constraintSetHash
    DateTime createdAt
  }
  SourcingDecisionBatchItem {
    String id PK
    String organizationId FK
    String decisionBatchId FK
    String launchCandidateId FK
    String supplierOfferSkuSnapshotId FK
    String itemKey
    String modelCandidateId
    String displayName
    Int rank
    String baselineDecision
    String decision
    Boolean executionEligible
    String confidenceKind
    Decimal policyProbability
    Int evidenceFamilyCount
    Int evidencePlatformCount
    Boolean hasCoupangEvidence
    Boolean has1688Evidence
    String nextEvidenceAction
    Decimal heuristicScore
    Decimal decisionConfidence
    Int expectedContributionProfit90dKrw
    Int capitalAtRiskKrw
    StringArray reasonCodes
    StringArray riskCodes
    Json modelOutput
    String featureManifestHash
    DateTime createdAt
  }
  SourcingDecisionEvidence {
    String id PK
    String organizationId FK
    String decisionBatchItemId FK
    String evidenceObservationId FK
    String role
    Int ordinal
    DateTime createdAt
  }
  SourcingEvidenceIngestionRun {
    String id PK
    String organizationId FK
    String sourceKey
    String scopeKey
    String leaseToken
    DateTime leaseExpiresAt
    DateTime sourceControlCheckedAt
    Int generation
    DateTime cancelRequestedAt
    Int staleDiscardedCount
    String targetKey
    String idempotencyKey
    String requestHash
    String collectorKey
    String collectorVersion
    String triggerKind
    String triggeredByUserId FK
    String status
    DateTime sourceWindowStartAt
    DateTime sourceWindowEndAt
    String watermarkBefore
    String watermarkAfter
    Int discoveredCount
    Int acceptedCount
    Int rejectedCount
    Int duplicateCount
    Int coverageNumerator
    Int coverageDenominator
    Json qualityReport
    String errorCode
    String errorMessage
    DateTime startedAt
    DateTime completedAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingEvidenceObservation {
    String id PK
    String organizationId FK
    String ingestionRunId FK
    String supersedesObservationId FK
    String sourceKey
    String platform
    String evidenceFamily
    String signalRole
    String conceptKey
    Boolean supportsCandidate
    String observationKey
    Int revision
    String sourceEntityType
    String sourceEntityKey
    String observationType
    String schemaVersion
    String evidenceClass
    DateTime eventAt
    DateTime observedAt
    DateTime availableAt
    DateTime revisionAt
    DateTime businessDate
    String sourceRevisionKey
    String sourceUrl
    String payloadHash
    String envelopeHash
    Json payload
    String rawArtifactRef
    DateTime ingestedAt
    DateTime createdAt
  }
  SourcingInterestTarget {
    String id PK
    String organizationId FK
    String targetKey
    String targetType
    String label
    StringArray sourceKeys
    String keyword
    String category
    String productId
    String itemId
    String vendorItemId
    String productName
    Boolean enabled
    Int version
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingKeywordPreference {
    String id PK
    String organizationId FK
    String keywordNormalized
    String displayKeyword
    Boolean excluded
    Int version
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingLaunchCandidate {
    String id PK
    String organizationId FK
    String sourceCandidateId FK
    String supplierOfferSkuSnapshotId FK
    String targetChannelAccountId FK
    String supersedesLaunchCandidateId FK
    String candidateSeriesKey
    Int revision
    String identityHash
    String name
    String productConceptVersionKey
    String koreanSellableBundleVersionKey
    String launchPlanVersionKey
    String complianceAssessmentVersionKey
    String ipClearanceVersionKey
    String qualitySpecVersionKey
    Int intendedAgeMinMonths
    Int intendedAgeMaxMonths
    String intendedUse
    String materialProfileKey
    String labelingProfileKey
    Int unitsPerSellableBundle
    Int initialOrderQuantity
    Int targetSalePriceKrw
    String fulfillmentMode
    String economicsStatus
    String complianceStatus
    String qualityStatus
    String ipStatus
    Int landedCostKrw
    Int profitP10Krw
    StringArray blockingRiskCodes
    StringArray unknownRiskCodes
    Json bundleSnapshot
    Json launchPlanSnapshot
    Json economicsSnapshot
    Json complianceSnapshot
    Json qualitySnapshot
    Json ipSnapshot
    DateTime validUntil
    String createdByUserId FK
    DateTime createdAt
  }
  SourcingOwnerIdempotencyReceipt {
    String id PK
    String organizationId FK
    String capabilityKey
    String idempotencyKey
    String requestHash
    Json result
    DateTime createdAt
  }
  SourcingRecommendationItem {
    String id PK
    String organizationId FK
    String recommendationRunId FK
    String itemKey
    String sourcePlatform
    String externalOfferId
    String variantKeyNormalized
    String matchedCoupangProductId
    String displayName
    Int rank
    Int score
    String grade
    String baselineAction
    StringArray reasonCodes
    StringArray riskCodes
    Json scoreComponents
    Json sourceSnapshot
    DateTime createdAt
  }
  SourcingRecommendationItemEvidence {
    String id PK
    String organizationId FK
    String recommendationItemId FK
    String evidenceObservationId FK
    String role
    Int ordinal
    DateTime createdAt
  }
  SourcingRecommendationRun {
    String id PK
    String organizationId FK
    String policyKey
    String policyVersion
    String modelVersion
    String calculationVersion
    String inputManifestHash
    Json inputManifest
    String status
    DateTime businessDate
    DateTime generatedAt
    DateTime completedAt
    DateTime expiresAt
    StringArray warningCodes
    String errorCode
    String errorMessage
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingReviewBatch {
    String id PK
    String organizationId FK
    String recommendationRunId FK
    String requestedByUserId FK
    String idempotencyKey
    String requestHash
    String status
    DateTime requestedAt
    DateTime cancelledAt
    String cancelReason
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingReviewBatchItem {
    String id PK
    String organizationId FK
    String reviewBatchId FK
    String recommendationItemId FK
    String validationEpisodeId FK
    String offerKeywordObservationId FK
    Int ordinal
    DateTime createdAt
  }
  SourcingReviewSelection {
    String id PK
    String organizationId FK
    String recommendationRunId FK
    String workspaceKey
    String itemKey
    String state
    Int version
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingSourceEntitlementVersion {
    String id PK
    String organizationId FK
    String sourceKey
    String scopeKey
    Int version
    String versionHash
    String sourceLifecycle
    String decisionImpact
    String ownerLabel
    String legalBasis
    String allowedMethod
    String credentialRef
    StringArray permittedFields
    StringArray prohibitedUses
    Int rateLimitValue
    Int rateLimitWindowSeconds
    StringArray geographyCoverage
    String coverageDefinition
    String accountCoverage
    String searchCoverage
    String categoryCoverage
    String denominatorDefinition
    String historyBackfillPolicy
    Int expectedDelaySeconds
    Int maxStalenessSeconds
    Int minimumCoverageBps
    String revisionPolicy
    Int retentionDays
    DateTime permissionStartsAt
    DateTime permissionExpiresAt
    Boolean killSwitch
    String killReason
    Boolean isCurrent
    String reviewedByUserId FK
    DateTime reviewedAt
    DateTime retiredAt
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingValidationCheck {
    String id PK
    String organizationId FK
    String validationEpisodeId FK
    String checkKey
    String status
    String severity
    Int score
    String summary
    Json details
    DateTime evaluatedAt
    DateTime createdAt
  }
  SourcingValidationCheckEvidence {
    String id PK
    String organizationId FK
    String validationCheckId FK
    String evidenceObservationId FK
    String role
    Int ordinal
    DateTime createdAt
  }
  SourcingValidationEpisode {
    String id PK
    String organizationId FK
    String recommendationRunId FK
    String recommendationItemId FK
    String status
    String policyKey
    String policyVersion
    DateTime evidenceCutoffAt
    DateTime startedAt
    DateTime completedAt
    DateTime validUntil
    Json summary
    DateTime createdAt
    DateTime updatedAt
  }
  SourcingWorkspaceSnapshot {
    String id PK
    String organizationId FK
    String scope
    DateTime businessDate
    String projectionVersion
    String inputHash
    Json payload
    DateTime generatedAt
    DateTime expiresAt
    DateTime createdAt
    DateTime updatedAt
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
    String ownerIdempotencyKey
    String requestHash
    String providerOutcome
    Json resultJson
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
  TiktokCreativeTrendDailySnapshot {
    String id PK
    String organizationId FK
    DateTime businessDate
    String region
    String trendType
    String entityKey
    Int rank
    String label
    String industry
    String sourceKeyword
    Int postCount
    BigInt viewCount
    Decimal growthPct
    String thumbnailUrl
    String sourceUrl
    String source
    DateTime capturedAt
    DateTime createdAt
    DateTime updatedAt
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
  User {
    String id PK
    String email UK
    String name
    String passwordHash
    String role
    String type
    String team
    String avatarUrl
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
  CandidateImage o|--o{ ThumbnailGenerationInputImage : "candidateImage"
  ChannelAccount ||--o{ ChannelAccountDailyKpiSnapshot : "channelAccount"
  ChannelAccount ||--o{ ChannelAdTargetDailySnapshot : "channelAccount"
  ChannelAccount ||--o{ ChannelListing : "channelAccount"
  ChannelAccount ||--o{ ChannelListingDeletionOperation : "channelAccount"
  ChannelAccount ||--o{ ChannelScrapeRun : "channelAccount"
  ChannelAccount ||--o{ MallListingProfile : "channelAccount"
  ChannelAccount ||--o{ Order : "channelAccount"
  ChannelAccount ||--o{ OrderReturn : "channelAccount"
  ChannelAccount ||--o{ ProductPreparation : "channelAccount"
  ChannelAccount ||--o{ ProductRegistrationExecution : "channelAccount"
  ChannelAccount ||--o{ RocketPoCatalogSnapshot : "channelAccount"
  ChannelAccount ||--o{ RocketPurchaseConfirmation : "channelAccount"
  ChannelAccount o|--o{ SourceImportRun : "channelAccount"
  ChannelAccount ||--o{ SourcingLaunchCandidate : "targetChannelAccount"
  ChannelAdTargetDailySnapshot o|--o{ AdAction : "adTargetDaily"
  ChannelListing o|--o{ AdAction : "listing"
  ChannelListing o|--o{ ChannelAdTargetDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingDeletionOperation : "channelListing"
  ChannelListing ||--o{ ChannelListingOption : "listing"
  ChannelListing ||--o{ ChannelListingOptionDailySnapshot : "listing"
  ChannelListing o|--o{ ChannelScrapeSnapshot : "listing"
  ChannelListing o|--o{ ContentWorkspace : "channelListing"
  ChannelListing o|--o| MasterProduct : "originChannelListing"
  ChannelListing o|--o{ ProductPreparation : "channelListing"
  ChannelListing o|--o{ ProductRegistrationExecution : "channelListing"
  ChannelListing o|--o{ Review : "listing"
  ChannelListing ||--o{ Thumbnail : "listing"
  ChannelListing ||--o{ ThumbnailTracking : "listing"
  ChannelListingOption o|--o{ AdAction : "listingOption"
  ChannelListingOption o|--o{ ChannelAdTargetDailySnapshot : "listingOption"
  ChannelListingOption ||--o{ ChannelListingOptionDailySnapshot : "listingOption"
  ChannelListingOption ||--o{ ChannelListingOptionInventoryComponent : "channelListingOption"
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
  DetailPageArtifact ||--o{ DetailPageImageRenderIntent : "detailPageArtifact"
  DetailPageArtifact ||--o{ DetailPageRevision : "artifact"
  DetailPageArtifact o|--o{ ProductPreparation : "selectedDetailPageArtifact"
  DetailPageImageArtifact o|--o{ DetailPageImageRenderIntent : "completedArtifact"
  DetailPageRevision o|--o{ ContentWorkspace : "currentDetailPageRevision"
  DetailPageRevision o|--o{ DetailPageArtifact : "currentRevision"
  DetailPageRevision ||--o{ DetailPageImageArtifact : "revision"
  DetailPageRevision ||--o{ DetailPageImageRenderIntent : "revision"
  DetailPageRevision o|--o{ ProductPreparation : "selectedDetailPageRevision"
  ExecutionTask ||--o{ ExecutionLog : "task"
  ExecutionWorker o|--o{ ExecutionTask : "worker"
  Marketplace o|--o{ WorkflowTemplate : "marketplace"
  MasterProduct o|--o{ ChannelListing : "masterProduct"
  MasterProduct ||--|| MasterProductAbcEvaluation : "masterProduct"
  MasterProduct ||--o{ MasterProductAbcGradeHistory : "masterProduct"
  MasterProduct ||--o{ ProductCertification : "masterProduct"
  MasterProduct ||--o{ ProductNoticeAttribute : "masterProduct"
  MasterProduct o|--o{ SellpiaInventorySku : "masterProduct"
  MasterProduct o|--o| SourcingCandidate : "provenanceMasterProduct"
  MasterProductAbcFormulaVersion o|--o{ MasterProductAbcEvaluation : "formulaVersion"
  MasterProductAbcFormulaVersion o|--o| MasterProductAbcFormulaState : "activeFormulaVersion"
  MasterProductAbcFormulaVersion ||--o{ MasterProductAbcGradeHistory : "formulaVersion"
  OperationRun o|--o{ OperationRun : "parentRun"
  OperationRun ||--o{ OperationRunCheckpoint : "operationRun"
  OperationRun ||--|| RulesEvaluationApplication : "operationRun"
  OperationSchedule o|--o{ OperationRun : "schedule"
  Order ||--o{ OrderLineItem : "order"
  Order o|--o{ OrderReturn : "order"
  OrderLineItem o|--o{ OrderReturnLineItem : "orderLineItem"
  OrderReturn ||--o{ OrderReturnLineItem : "return"
  Organization ||--o{ ActionTask : "organization"
  Organization ||--o{ ActivityEvent : "organization"
  Organization ||--o{ AdAction : "organization"
  Organization ||--o{ AiDirectJob : "organization"
  Organization ||--o{ Alert : "organization"
  Organization ||--o{ BusinessRule : "organization"
  Organization ||--o{ CandidateImage : "organization"
  Organization ||--o{ CapabilityInvocation : "organization"
  Organization ||--o{ CategoryMapping : "organization"
  Organization ||--o{ ChannelAccount : "organization"
  Organization ||--o{ ChannelAccountDailyKpiSnapshot : "organization"
  Organization ||--o{ ChannelAdTargetDailySnapshot : "organization"
  Organization ||--o{ ChannelListing : "organization"
  Organization ||--o{ ChannelListingDailySnapshot : "organization"
  Organization ||--o{ ChannelListingDeletionOperation : "organization"
  Organization ||--o{ ChannelListingOption : "organization"
  Organization ||--o{ ChannelListingOptionDailySnapshot : "organization"
  Organization ||--o{ ChannelListingOptionInventoryComponent : "organization"
  Organization ||--o{ ChannelRegistrationOwnerIdempotencyReceipt : "organization"
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
  Organization ||--o{ CoupangDirectPoSnapshot : "organization"
  Organization ||--o{ CoupangKeywordRankDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordSerpDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordTracker : "organization"
  Organization ||--o{ CoupangRepresentativeKeywordOverride : "organization"
  Organization ||--o{ CoupangShipmentDateSummary : "organization"
  Organization ||--o{ CoupangWingSalesRankDailySnapshot : "organization"
  Organization ||--o{ CoupangWingTrackedProduct : "organization"
  Organization ||--o{ CoupangWingTrackedProductDailySnapshot : "organization"
  Organization ||--o{ DetailPageArtifact : "organization"
  Organization ||--o{ DetailPageImageArtifact : "organization"
  Organization ||--o{ DetailPageImageRenderIntent : "organization"
  Organization ||--o{ DetailPageRevision : "organization"
  Organization ||--o{ ExecutionWorker : "organization"
  Organization ||--o{ LegalEntity : "organization"
  Organization ||--o{ LiveCommerceBroadcastDailySnapshot : "organization"
  Organization ||--o{ LiveCommerceProductDailySnapshot : "organization"
  Organization ||--o{ MallListingProfile : "organization"
  Organization ||--o{ MallOperationOutcome : "organization"
  Organization ||--o{ MasterProduct : "organization"
  Organization ||--o{ MasterProductAbcEvaluation : "organization"
  Organization ||--o{ MasterProductAbcFormulaState : "organization"
  Organization ||--o{ MasterProductAbcFormulaVersion : "organization"
  Organization ||--o{ MasterProductAbcGradeHistory : "organization"
  Organization ||--o{ NaverKeywordDailySnapshot : "organization"
  Organization ||--o{ NaverPopularKeywordDailySnapshot : "organization"
  Organization ||--o{ OperationRun : "organization"
  Organization ||--o{ OperationRunCheckpoint : "organization"
  Organization ||--o{ OperationSchedule : "organization"
  Organization ||--o{ Order : "organization"
  Organization ||--o{ OrderLineItem : "organization"
  Organization ||--o{ OrderReturn : "organization"
  Organization ||--o{ OrderReturnLineItem : "organization"
  Organization ||--o{ OrganizationMembership : "organization"
  Organization ||--o{ ProcurementTestIntent : "organization"
  Organization ||--o{ ProductCertification : "organization"
  Organization ||--o{ ProductNoticeAttribute : "organization"
  Organization ||--o{ ProductPreparation : "organization"
  Organization ||--o{ ProductRegistrationExecution : "organization"
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
  Organization ||--o{ RocketPurchaseConfirmationTransmission : "organization"
  Organization ||--o{ RulesEvaluationApplication : "organization"
  Organization ||--o{ SalesPlan : "organization"
  Organization ||--o{ ScrapeTarget : "organization"
  Organization ||--o{ SellpiaInventorySku : "organization"
  Organization ||--o{ SellpiaInventoryState : "organization"
  Organization ||--o{ SellpiaManualMatchAlias : "organization"
  Organization ||--|| SellpiaManualMatchSnapshot : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntent : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntentReconciliation : "organization"
  Organization ||--o{ SellpiaProductMonthlySales : "organization"
  Organization ||--o{ SellpiaSalesDailySnapshot : "organization"
  Organization ||--o{ Settlement : "organization"
  Organization ||--o{ ShortsTrendDailySnapshot : "organization"
  Organization ||--o{ SourceImportRun : "organization"
  Organization ||--o{ Sourcing1688OfferKeywordObservation : "organization"
  Organization ||--o{ SourcingCandidate : "organization"
  Organization ||--o{ SourcingCollectionSourceControl : "organization"
  Organization ||--o{ SourcingDecisionBatch : "organization"
  Organization ||--o{ SourcingDecisionBatchItem : "organization"
  Organization ||--o{ SourcingDecisionEvidence : "organization"
  Organization ||--o{ SourcingEvidenceIngestionRun : "organization"
  Organization ||--o{ SourcingEvidenceObservation : "organization"
  Organization ||--o{ SourcingInterestTarget : "organization"
  Organization ||--o{ SourcingKeywordPreference : "organization"
  Organization ||--o{ SourcingLaunchCandidate : "organization"
  Organization ||--o{ SourcingOwnerIdempotencyReceipt : "organization"
  Organization ||--o{ SourcingRecommendationItem : "organization"
  Organization ||--o{ SourcingRecommendationItemEvidence : "organization"
  Organization ||--o{ SourcingRecommendationRun : "organization"
  Organization ||--o{ SourcingReviewBatch : "organization"
  Organization ||--o{ SourcingReviewBatchItem : "organization"
  Organization ||--o{ SourcingReviewSelection : "organization"
  Organization ||--o{ SourcingSourceEntitlementVersion : "organization"
  Organization ||--o{ SourcingValidationCheck : "organization"
  Organization ||--o{ SourcingValidationCheckEvidence : "organization"
  Organization ||--o{ SourcingValidationEpisode : "organization"
  Organization ||--o{ SourcingWorkspaceSnapshot : "organization"
  Organization ||--o{ StockTransfer : "organization"
  Organization ||--o{ Supplier : "organization"
  Organization ||--o{ SupplierOfferPriceTier : "organization"
  Organization ||--o{ SupplierOfferSkuSnapshot : "organization"
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
  Organization ||--o{ TiktokCreativeTrendDailySnapshot : "organization"
  Organization ||--o{ TrendSeedKeyword : "organization"
  Organization ||--o{ Warehouse : "organization"
  Organization ||--o{ WorkflowTemplate : "organization"
  ProductPreparation ||--o{ ProductRegistrationExecution : "productPreparation"
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder ||--o{ PurchaseOrderSubmissionAttempt : "purchaseOrder"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  RocketPoCatalogSnapshot ||--o{ RocketPoCatalogLine : "snapshot"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationLine : "confirmation"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationTransmission : "confirmation"
  RocketPurchaseConfirmationLine ||--o{ RocketPurchaseConfirmationAllocation : "confirmationLine"
  SellpiaInventorySku ||--o{ ChannelListingOptionInventoryComponent : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ PurchaseOrderItem : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ ReturnTransfer : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ RocketPurchaseConfirmationAllocation : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ SellpiaManualMatchAlias : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ StockTransfer : "sellpiaInventorySku"
  SellpiaInventorySku ||--o{ SupplierProduct : "sellpiaInventorySku"
  SellpiaManualMatchSnapshot ||--o{ SellpiaManualMatchAlias : "snapshot"
  SellpiaOrderTransmissionIntent ||--o{ SellpiaOrderTransmissionIntentReconciliation : "intent"
  SourceImportRun o|--o{ ChannelListing : "lastImportRun"
  SourceImportRun o|--o{ ChannelListingOption : "lastImportRun"
  SourceImportRun o|--o{ ChannelScrapeRun : "sourceImportRun"
  SourceImportRun o|--o{ Order : "sourceImportRun"
  SourceImportRun ||--|| RocketPoCatalogSnapshot : "sourceImportRun"
  SourceImportRun ||--o{ RocketPurchaseConfirmation : "sourceImportRun"
  SourceImportRun ||--o{ RocketPurchaseConfirmationTransmission : "sourceImportRun"
  SourceImportRun o|--o{ SellpiaInventorySku : "lastImportRun"
  SourceImportRun o|--o{ SellpiaInventoryState : "lastCompletedImportRun"
  Sourcing1688OfferKeywordObservation ||--o{ SourcingReviewBatchItem : "offerKeywordObservation"
  SourcingCandidate ||--o{ CandidateImage : "candidate"
  SourcingCandidate o|--o{ ChannelListing : "sourceCandidate"
  SourcingCandidate o|--o{ ContentGeneration : "sourceCandidate"
  SourcingCandidate o|--o{ ContentGenerationSource : "sourceCandidate"
  SourcingCandidate o|--o{ ContentWorkspace : "sourceCandidate"
  SourcingCandidate ||--o{ DetailPageImageRenderIntent : "sourceCandidate"
  SourcingCandidate ||--o{ ProductPreparation : "sourceCandidate"
  SourcingCandidate o|--o{ SourcingLaunchCandidate : "sourceCandidate"
  SourcingCandidate o|--o{ ThumbnailGeneration : "sourceCandidate"
  SourcingDecisionBatch ||--o{ SourcingDecisionBatchItem : "decisionBatch"
  SourcingDecisionBatchItem ||--o{ ProcurementTestIntent : "decisionBatchItem"
  SourcingDecisionBatchItem ||--o{ SourcingDecisionEvidence : "decisionBatchItem"
  SourcingEvidenceIngestionRun ||--o{ Sourcing1688OfferKeywordObservation : "ingestionRun"
  SourcingEvidenceIngestionRun ||--o{ SourcingEvidenceObservation : "ingestionRun"
  SourcingEvidenceObservation ||--|| Sourcing1688OfferKeywordObservation : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SourcingDecisionEvidence : "evidenceObservation"
  SourcingEvidenceObservation o|--o| SourcingEvidenceObservation : "supersedesObservation"
  SourcingEvidenceObservation ||--o{ SourcingRecommendationItemEvidence : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SourcingValidationCheckEvidence : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SupplierOfferSkuSnapshot : "evidenceObservation"
  SourcingLaunchCandidate o|--o{ ProcurementTestIntent : "launchCandidate"
  SourcingLaunchCandidate o|--o{ SourcingDecisionBatchItem : "launchCandidate"
  SourcingLaunchCandidate o|--o| SourcingLaunchCandidate : "supersedesLaunchCandidate"
  SourcingRecommendationItem ||--o{ SourcingRecommendationItemEvidence : "recommendationItem"
  SourcingRecommendationItem ||--o{ SourcingReviewBatchItem : "recommendationItem"
  SourcingRecommendationItem ||--o{ SourcingValidationEpisode : "recommendationItem"
  SourcingRecommendationRun ||--o{ SourcingRecommendationItem : "recommendationRun"
  SourcingRecommendationRun ||--o{ SourcingReviewBatch : "recommendationRun"
  SourcingRecommendationRun ||--o{ SourcingReviewSelection : "recommendationRun"
  SourcingRecommendationRun ||--o{ SourcingValidationEpisode : "recommendationRun"
  SourcingReviewBatch ||--o{ SourcingReviewBatchItem : "reviewBatch"
  SourcingValidationCheck ||--o{ SourcingValidationCheckEvidence : "validationCheck"
  SourcingValidationEpisode o|--o{ SourcingReviewBatchItem : "validationEpisode"
  SourcingValidationEpisode ||--o{ SourcingValidationCheck : "validationEpisode"
  Supplier o|--o{ PurchaseOrder : "supplier"
  Supplier o|--o{ SupplierOfferSkuSnapshot : "supplier"
  Supplier ||--o{ SupplierPayment : "supplier"
  Supplier ||--o{ SupplierProduct : "supplier"
  SupplierOfferPriceTier o|--o{ ProcurementTestIntent : "selectedPriceTier"
  SupplierOfferSkuSnapshot ||--o{ ProcurementTestIntent : "supplierOfferSkuSnapshot"
  SupplierOfferSkuSnapshot o|--o{ SourcingDecisionBatchItem : "supplierOfferSkuSnapshot"
  SupplierOfferSkuSnapshot ||--o{ SourcingLaunchCandidate : "supplierOfferSkuSnapshot"
  SupplierOfferSkuSnapshot ||--o{ SupplierOfferPriceTier : "supplierOfferSkuSnapshot"
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
  User o|--o{ Alert : "actorUser"
  User ||--o{ AuthSession : "user"
  User o|--o{ CapabilityInvocation : "approvalDecidedByUser"
  User ||--o{ CapabilityInvocation : "initiatingUser"
  User o|--o{ ChannelListingDeletionOperation : "requestedByUser"
  User o|--o{ ContentAsset : "createdByUser"
  User o|--o{ ContentGeneration : "triggeredByUser"
  User o|--o{ ContentWorkspace : "createdByUser"
  User o|--o{ ContentWorkspaceThumbnailSelection : "createdByUser"
  User o|--o{ DetailPageArtifact : "createdByUser"
  User o|--o{ DetailPageImageArtifact : "createdBy"
  User o|--o{ DetailPageImageRenderIntent : "claimedBy"
  User o|--o{ DetailPageImageRenderIntent : "requestedBy"
  User o|--o{ DetailPageRevision : "createdByUser"
  User o|--o{ MallOperationOutcome : "actorUser"
  User o|--o{ OperationRun : "requestedBy"
  User o|--o{ OperationSchedule : "createdBy"
  User o|--o{ OrganizationMembership : "invitedBy"
  User ||--o{ OrganizationMembership : "user"
  User ||--o{ ProcurementTestIntent : "requestedByUser"
  User o|--o{ ProcurementTestIntent : "reviewedByUser"
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
  User ||--o{ SourcingDecisionBatch : "requestedByUser"
  User o|--o{ SourcingEvidenceIngestionRun : "triggeredByUser"
  User ||--o{ SourcingLaunchCandidate : "createdByUser"
  User ||--o{ SourcingReviewBatch : "requestedBy"
  User o|--o{ SourcingSourceEntitlementVersion : "reviewedByUser"
  User o|--o{ ThumbnailGeneration : "triggeredByUser"
  User o|--o{ ThumbnailGenerationEvent : "actor"
  User o|--o{ WorkflowRun : "triggeredByUser"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
  WorkflowTemplate ||--o{ WorkflowRun : "template"
```
