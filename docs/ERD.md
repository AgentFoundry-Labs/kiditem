# Database ERD

> Generated from `prisma/models/*.prisma`. Do not edit the diagram by hand.
> Regenerate this file with `npm run db:erd` after Prisma schema changes.

This ERD is a development-time navigation aid. The source of truth is the Prisma schema under `prisma/`.

## Sources

- `prisma/models/advertising.prisma`
- `prisma/models/agent-work.prisma`
- `prisma/models/ai.prisma`
- `prisma/models/analytics.prisma`
- `prisma/models/channels.prisma`
- `prisma/models/core.prisma`
- `prisma/models/finance.prisma`
- `prisma/models/inventory.prisma`
- `prisma/models/operation.prisma`
- `prisma/models/orders.prisma`
- `prisma/models/sourcing.prisma`
- `prisma/models/supply.prisma`
- `prisma/models/system.prisma`

## Domain ERDs

| Domain | Models |
|---|---:|
| [Advertising](erd/advertising.md) | 11 |
| [AgentOS](erd/agentos.md) | 1 |
| [AI](erd/ai.md) | 10 |
| [Analytics](erd/analytics.md) | 2 |
| [Channels](erd/channels.md) | 18 |
| [Core](erd/core.md) | 7 |
| [Finance](erd/finance.md) | 1 |
| [Inventory](erd/inventory.md) | 3 |
| [Operation](erd/operation.md) | 3 |
| [Orders](erd/orders.md) | 13 |
| [Products](erd/products.md) | 6 |
| [Sourcing](erd/sourcing.md) | 35 |
| [Supply](erd/supply.md) | 13 |
| [System](erd/system.md) | 5 |

## Model Index

| Model | Domain | Table | Description |
|---|---:|---|---|
| AdAction | Advertising | `ad_actions` | 광고 자동 실행 큐. ChannelAdTargetDailySnapshot→AdAction→ExecutionTask 파이프라인. 실행 상태는 최신 ExecutionTask에서 파생한다. |
| ChannelAdListingProductMonthlyFact | Advertising | `channel_ad_listing_product_monthly_facts` | ChannelAdListingProductMonthlyFact canonical state owned by advertising. |
| ChannelAdTargetDailySnapshot | Advertising | `channel_ad_target_daily_snapshots` | ChannelAdTargetDailySnapshot canonical state owned by advertising. |
| CoupangKeywordRankDailySnapshot | Advertising | `coupang_keyword_rank_daily_snapshots` | CoupangKeywordRankDailySnapshot canonical state owned by advertising. |
| CoupangKeywordSerpDailySnapshot | Advertising | `coupang_keyword_serp_daily_snapshots` | CoupangKeywordSerpDailySnapshot canonical state owned by advertising. |
| CoupangKeywordTracker | Advertising | `coupang_keyword_trackers` | CoupangKeywordTracker canonical state owned by advertising. |
| CoupangRepresentativeKeywordOverride | Advertising | `coupang_representative_keyword_overrides` | CoupangRepresentativeKeywordOverride canonical state owned by advertising. |
| CoupangWingSalesRankDailySnapshot | Advertising | `coupang_wing_sales_rank_daily_snapshots` | CoupangWingSalesRankDailySnapshot canonical state owned by advertising. |
| CoupangWingTrackedProduct | Advertising | `coupang_wing_tracked_products` | CoupangWingTrackedProduct canonical state owned by advertising. |
| CoupangWingTrackedProductDailySnapshot | Advertising | `coupang_wing_tracked_product_daily_snapshots` | CoupangWingTrackedProductDailySnapshot canonical state owned by advertising. |
| ExecutionTask | Advertising | `execution_tasks` | - |
| CapabilityInvocation | AgentOS | `capability_invocations` | Exact request-driven mutation admission and replay receipt. |
| AiDirectJob | AI | `ai_direct_jobs` | Durable queue and projection checkpoint for direct thumbnail, detail-page, and image-edit model work. |
| AiUsageRecord | AI | `ai_usage_records` | Append-only metering of one Gemini call: tokens and an estimated cost, attributed to the agent whose request or job made it. Cost is null when the model has no registered price. |
| ContentAsset | AI | `content_assets` | 워크스페이스가 소유한 관리 이미지 한 표(KID-313 W3a): 운영자 업로드 · AI 썸네일 후보 · 상세 이미지 · 몰 카탈로그 사진이 모두 여기 한 행이다. 대표이미지는 ContentWorkspace.current_thumbnail_asset_id 가 가리킨다. |
| ContentWorkspace | AI | `content_workspaces` | Product content workspace owned by a sales product draft, its channel listing, or a direct detail page. |
| DetailPage | AI | `detail_pages` | 상세 페이지 하나(KID-313 W3b, ← content_generations + detail_page_artifacts): AI 생성 · 직접 작성 · 올린 파일 · 가져오기(사방넷) 어느 것이든 한 행이고, 그 이력은 detail_page_revisions 다. 워크스페이스에 여럿 있을 수 있고 몰로 가는 것은 ContentWorkspace.current_detail_page_revision_id 하나다. |
| DetailPageImageArtifact | AI | `detail_page_image_artifacts` | Durable single-JPEG marketplace rendition for one detail-page revision and renderer variant; the revision's HTML at render time is what the JPEG shows. |
| DetailPageImageRenderIntent | AI | `detail_page_image_render_intents` | Short-lived organization-scoped claim that binds a browser renderer to one exact detail-page revision and object key. |
| DetailPageRevision | AI | `detail_page_revisions` | Detail-page HTML revision history. AI 결과(generated) · 편집(manual_edit) · 복제(duplicate) · 가져오기(imported)가 한 이력에 쌓이고, DetailPage.current_revision_id 와 ContentWorkspace.current_detail_page_revision_id 가 현재를 고른다. 행은 지우지 않으며, 가져온(imported) revision 의 사진 주소만 사진 옮기기(KID-319)가 우리 저장소 주소로 바꿔 쓴다(source_digest 는 원문 것 그대로). |
| ListingThumbnailEvaluation | AI | `listing_thumbnail_evaluations` | 몰에 실제 등록된 리스팅 대표이미지 한 장당 평가 한 행(KID-313 W3a, Content 소유). channel_listing_id 는 교차 owner scalar id(FK 없음), image_url 은 channel_listings.image_url 그 시점 값. 이미지가 바뀌면 새 행이 생기고 옛 평가는 남는다. 규칙 검사는 저장하지 않고 계산한다. |
| ThumbnailGeneration | AI | `thumbnail_generations` | 대표이미지 생성 job 하나(KID-313 W3a): status=pending/running/succeeded/failed/cancelled, method=generate/creative/auto/edit. 결과 후보는 content_assets(thumbnail_generation_id) 행이고 채택은 ContentWorkspace.current_thumbnail_asset_id 다. 입력 사진 · 편집 분석 · 원본 URL 은 input_meta 에 둔다. |
| SellpiaProductMonthlySales | Analytics | `sellpia_product_monthly_sales` | SellpiaProductMonthlySales canonical state owned by analytics. |
| SellpiaSalesDailySnapshot | Analytics | `sellpia_sales_daily_snapshots` | SellpiaSalesDailySnapshot canonical state owned by analytics. |
| ChannelAccount | Channels | `channel_accounts` | ChannelAccount canonical state owned by channels. |
| ChannelListing | Channels | `channel_listings` | ChannelListing canonical state owned by channels. |
| ChannelListingDailySnapshot | Channels | `channel_listing_daily_snapshots` | 채널 listing 의 일별 정규화 상태. 반복 scrape 는 businessDate row 를 upsert. |
| ChannelListingOption | Channels | `channel_listing_options` | ChannelListingOption canonical state owned by channels. |
| ChannelListingOptionDailySnapshot | Channels | `channel_listing_option_daily_snapshots` | 채널 listing option/vendor item 의 일별 정규화 상태. |
| ChannelListingOptionInventoryComponent | Channels | `channel_listing_option_inventory_components` | ChannelListingOptionInventoryComponent canonical state owned by channels. |
| ChannelScrapeChunk | Channels | `channel_scrape_chunks` | Browser catalog collection payloads kept in JSONB until an atomic publication succeeds. |
| ChannelScrapeRun | Channels | `channel_scrape_runs` | 채널별 상품/광고/트래픽 스크래핑 실행 단위. 원본 row 는 ChannelScrapeSnapshot 에 저장. |
| ChannelScrapeSnapshot | Channels | `channel_scrape_snapshots` | 채널 스크래퍼/API 가 본 원본 row. 매칭 실패/파서 변경 대비 rawJson 을 보존. |
| ProductRegistrationExecution | Channels | `product_registration_executions` | One frozen registration intent. A reusable target has many executions; one active execution per target and idempotent requests prevent duplicate submissions (ADR-0020). |
| RegistrationTarget | Channels | `registration_targets` | Persistent registration target with explicit marketplace overrides. Executions freeze submitted values separately (ADR-0020). |
| RegistrationTargetOption | Channels | `registration_target_options` | Selected common option and explicit price overrides for one persistent registration target. |
| SalesProduct | Channels | `sales_products` | Channels-owned common selling product identified by its KID. Reusable registration targets select its options and override its defaults; inventory and ABC remain Products-owned (ADR-0020). |
| SalesProductOption | Channels | `sales_product_options` | Selling composition with a stable UUID, issued KID and final option price. Its template is not operational inventory; confirmed channel recipes own that composition (ADR-0020). |
| SalesProductOptionComponent | Channels | `sales_product_option_components` | Declared source composition for a selling option. Applied to an empty channel recipe only by an explicit request; never a capacity source (ADR-0020). |
| SalesProductPublicImage | Channels | `sales_product_public_images` | Public copy of a sales-product image or detail image that malls can download (우리 저장소는 사무실 밖에서 열리지 않는다). Keyed by our storage URL; the sales product keeps its own URL and mall bulk sheets use the copy (ADR-0014). |
| SellpiaManualMatchAlias | Channels | `sellpia_manual_match_aliases` | Exact normalized marketplace-title evidence linking one historical Sellpia manual match to an active physical SKU and positive unit quantity. |
| SellpiaManualMatchSnapshot | Channels | `sellpia_manual_match_snapshots` | Current organization-scoped, read-only Sellpia manual-match evidence restricted to exact aliases used by current channel listings. |
| AuthSession | Core | `auth_sessions` | Revocable KidItem-owned browser and extension authentication session. Only a SHA-256 token hash is persisted. |
| CategoryMapping | Core | `category_mappings` | - |
| LegalEntity | Core | `legal_entities` | Legal/business entity under an organization. This stores tax, invoice, and settlement identity separately from the SaaS organization boundary. |
| Organization | Core | `organizations` | - |
| OrganizationMembership | Core | `organization_memberships` | B2B customer/workspace membership. A user may belong to multiple organizations; this row supplies request organization and role. |
| SourceImportRun | Core | `source_import_runs` | Durable provenance and publication fence for Sellpia and channel full-snapshot imports. |
| User | Core | `users` | Human or system account. Organization membership is the source of truth. |
| SalesPlan | Finance | `sales_plans` | - |
| ReturnTransfer | Inventory | `return_transfers` | - |
| StockTransfer | Inventory | `stock_transfers` | Warehouse-to-warehouse movement record. It never mutates MasterProduct.currentStock. |
| Warehouse | Inventory | `warehouses` | - |
| Operation | Operation | `operations` | One run of any kind (collection, AI generation, ad action, registration) under the single operation contract (ADR-0025). Owned by common/operation; owner-specific values live in plan/progress/result JSON. |
| OperationChunk | Operation | `operation_chunks` | A staged chunk of an executing operation. Deleted in the finish transaction whether the operation succeeded or failed. |
| OperationLock | Operation | `operation_locks` | An overlap key an executing operation holds. Unique per organization without the kind, so one key fences across kinds (ADR-0025). |
| CoupangDirectPoSnapshot | Orders | `coupang_direct_po_snapshots` | 쿠팡직배송 발주확정 스냅샷. 입고예정일 달력이 매번 쿠팡을 다시 긁지 않도록 |
| CoupangDirectTransportConsumption | Orders | `coupang_direct_transport_consumptions` | Immutable alias from one completed source attempt and transport selection to its canonical downstream effect receipt. |
| CoupangDirectTransportReceipt | Orders | `coupang_direct_transport_receipts` | Immutable transport effect receipt for one normalized Coupang direct-order payload. It owns downstream publication identity, not source collection state. |
| CoupangShipmentDateSummary | Orders | `coupang_shipment_date_summaries` | Persisted Coupang shipment 발송일별 건수/박스 요약 snapshot so the calendar survives reload and only new dates are collected. |
| Order | Orders | `orders` | 채널-agnostic 주문 aggregate. Coupang 등 채널별 raw payload 는 metadata Json. 라인 아이템은 OrderLineItem. |
| OrderCollectionArtifact | Orders | `order_collection_artifacts` | Retained collection input evidence; converted downloads are not persisted and lifecycle belongs to SourceImportRun. |
| OrderLineItem | Orders | `order_line_items` | 주문 라인 아이템 — 1 SKU 단위. listingOption → option 으로 SKU 해상도. order FK 는 organizationId 를 함께 참조해 cross-organization mismatch 를 DB 가 차단한다. |
| Review | Orders | `reviews` | 채널 상품평 원본 1건. 쿠팡은 Wing 상품평 화면(`/tenants/cs/product/review`)을 |
| RocketPoCatalogLine | Orders | `rocket_po_catalog_lines` | RocketPoCatalogLine canonical state owned by orders. |
| RocketPoCatalogSnapshot | Orders | `rocket_po_catalog_snapshots` | RocketPoCatalogSnapshot canonical state owned by orders. |
| SellpiaOrderTransmissionIntent | Orders | `sellpia_order_transmission_intents` | Organization-scoped idempotency fence for browser Sellpia order transmission. It does not represent or mutate inventory freshness. |
| SellpiaOrderTransmissionIntentReconciliation | Orders | `sellpia_order_transmission_intent_reconciliations` | Append-only owner/admin audit for resolving an ambiguous Sellpia order transmission outcome. |
| Settlement | Orders | `settlements` | 월별 정산 (예상 vs 실제 비교). |
| MasterProduct | Products | `master_products` | Organization-owned canonical inventory product and sole official product ABC identity. |
| MasterProductAbcEvaluation | Products | `master_product_abc_evaluations` | Current Products-owned normal absolute ABC evaluation for one MasterProduct. |
| MasterProductAbcFormulaState | Products | `master_product_abc_formula_states` | One organization-owned formula and official publication envelope. |
| MasterProductAbcFormulaVersion | Products | `master_product_abc_formula_versions` | Immutable organization-owned formula versions for absolute product ABC publication. |
| MasterProductAbcGradeHistory | Products | `master_product_abc_grade_histories` | Immutable absolute ABC grade transitions after the initial baseline. |
| SellpiaInventoryState | Products | `sellpia_inventory_states` | Organization-scoped Sellpia source binding, completion state, generation fence, and active collection lease. |
| LiveCommerceBroadcastDailySnapshot | Sourcing | `live_commerce_broadcast_daily_snapshots` | 타오바오 공식 API 또는 로그인된 1688·도우인 브라우저 화면에서 수집한 라이브 방송 일별 스냅샷. source와 broadcastId가 외부 방송 식별자를 이룬다. |
| LiveCommerceProductDailySnapshot | Sourcing | `live_commerce_product_daily_snapshots` | 중국 라이브 방송에 노출된 상품의 일별 스냅샷. broadcastId로 방송 스냅샷과 논리적으로 연결하고 상품 단위 비교를 지원한다. |
| NaverKeywordDailySnapshot | Sourcing | `naver_keyword_daily_snapshots` | 네이버 키워드(검색광고 월검색량 + 데이터랩 검색어트렌드) 일별 스냅샷. 수집 attempt별 키워드/날짜 불변 관측. COMPLETE 범위에서 최신 관측을 조회한다. trendRatio 는 latestRatio 반올림(0-100). |
| NaverPopularKeywordDailySnapshot | Sourcing | `naver_popular_keyword_daily_snapshots` | 네이버 데이터랩 인기키워드 보드(출산/육아·완구/인형·문구/사무 등)의 일별 순위 스냅샷. 보드×키워드 identity를 사용하고 매 수집마다 보드×일자 범위를 통째로 교체한다. |
| ShortsTrendDailySnapshot | Sourcing | `shorts_trend_daily_snapshots` | 쇼츠트렌드(shortstrend.co.kr) 급상승 쇼츠 일별 스냅샷. rank 는 소스 노출 순위, videoKey 는 영상 식별자. video×일자당 1행. |
| SourceRecord | Sourcing | `source_records` | 원본 기록 — 한 번의 수집이 원천에서 가져온 불변 사실(원본 이름·이미지·원가·원문·출처). 수집 owner 만 쓰고 운영자는 만지지 않는다. 초안(SalesProduct.sourceRecordId)이 가리키는 출처이지 화면의 행이 아니다. (org, platform, identityHash) 완전 유일키로 같은 원본은 두 번 수집되지 않고, 초안을 지우면 함께 지워진다(KID-313). |
| SourceRecordImage | Sourcing | `source_record_images` | 원본 기록이 소유하는 이미지 갤러리. 콘텐츠 생성의 입력으로 쓰이며, Content 는 이 표의 id 를 원천 기록으로만 든다(교차 owner 참조, FK 없음). |
| Sourcing1688OfferKeywordObservation | Sourcing | `sourcing_1688_offer_keyword_observations` | 1688 키워드 검색에서 수집한 정확한 offer/variant 관측치. 같은 offer가 여러 키워드에서 발견된 provenance를 보존한다. |
| SourcingCollectionSourceControl | Sourcing | `sourcing_collection_source_controls` | Optional organization-level pause for an allowlisted collection source. Absence means enabled. |
| SourcingDecisionBatch | Sourcing | `sourcing_decision_batches` | Immutable point-in-time policy decision header. Items and evidence are inserted in the same transaction after deterministic evaluation succeeds. |
| SourcingDecisionBatchItem | Sourcing | `sourcing_decision_batch_items` | One immutable canonical test_order, hold, or reject decision. Offer-only rows support RFQ provenance before an exact LaunchCandidate exists. |
| SourcingDecisionEvidence | Sourcing | `sourcing_decision_evidence` | Immutable many-to-many link from one decision item to the exact observations available at its decision cutoff. |
| SourcingEvidenceIngestionRun | Sourcing | `sourcing_evidence_ingestion_runs` | Durable source-owner attempt. Browser sources use RUNNING, COMPLETE, and FAILED with a frozen plan and current COMPLETE pointer. |
| SourcingEvidenceObservation | Sourcing | `sourcing_evidence_observations` | Append-only, revision-aware source fact. Feature and decision reads must apply both availableAt and ingestedAt point-in-time cutoffs. |
| SourcingInterestTarget | Sourcing | `sourcing_interest_targets` | 서버가 소유하는 관심 키워드. 화면의 전체 JSON snapshot 대체를 금지하고 낙관적 버전으로 개별 변경을 보장한다. |
| SourcingKeywordPreference | Sourcing | `sourcing_keyword_preferences` | 조직별 키워드 제외 설정. 전체 JSON snapshot 대신 키 하나를 낙관적으로 갱신한다. |
| SourcingKeywordSuggestionSnapshot | Sourcing | `sourcing_keyword_suggestion_facts` | 쿠팡 키워드 제안 source owner가 발행하는 schema-validated immutable snapshot. Header가 존재하고 item이 비어 있으면 confirmed-empty이다. |
| SourcingLaunchCandidate | Sourcing | `sourcing_launch_candidates` | Immutable launch and outcome identity that freezes an exact supplier variant, Korean bundle, launch plan, compliance/IP/quality versions, target account, price, and initial quantity. |
| SourcingMarketShadowFact | Sourcing | `sourcing_market_shadow_facts` | 시장 shadow source owner가 발행하는 schema-validated immutable experiment document. Provider raw payload는 포함하지 않는다. |
| SourcingNaverKeywordAnalysisFact | Sourcing | `sourcing_naver_keyword_analysis_facts` | 네이버 키워드 분석 source owner가 발행하는 schema-validated immutable snapshot. input hash와 COMPLETE current run으로 화면 가시성을 결정한다. |
| SourcingOwnerIdempotencyReceipt | Sourcing | `sourcing_owner_idempotency_receipts` | 최종 소싱 capability의 불변 owner idempotency 결과. 후보 수명주기와 독립적으로 replay 결과를 보존한다. |
| SourcingRecommendationItem | Sourcing | `sourcing_recommendation_items` | 한 추천 실행 안의 stable offer/variant 후보. 점수와 근거는 이 행을 기준으로 추적한다. |
| SourcingRecommendationItemEvidence | Sourcing | `sourcing_recommendation_item_evidence` | 추천 후보가 사용한 immutable evidence 링크. retention과 재현성의 기준이다. |
| SourcingRecommendationRun | Sourcing | `sourcing_recommendation_runs` | 재현 가능한 추천 계산의 immutable header. 입력 manifest와 모델 버전을 함께 고정한다. |
| SourcingReviewBatch | Sourcing | `sourcing_review_batches` | Final 화면에서 생성하는 immutable review handoff. procurement intent나 provider side effect를 만들지 않는다. |
| SourcingReviewBatchItem | Sourcing | `sourcing_review_batch_items` | review batch가 실제로 검토한 recommendation, validation, exact offer observation을 동결한다. |
| SourcingReviewSelection | Sourcing | `sourcing_review_selections` | Entry/Final 화면 선택 상태의 org-scoped, optimistic-concurrency record. |
| SourcingSourcePublication | Sourcing | `sourcing_source_publications` | 소싱 원천의 발행 이력(KID-360). 성공한 수집 하나(옛 COMPLETE run 하나)가 (source, scope, target) 발행 1행이다. isCurrent 행이 그 대상의 "현재 완결 스냅샷"이고, 이력 리더는 같은 표를 날짜·키워드로 읽는다. 옛 run 표의 is_current_complete·attemptPlan·coverage·window·qualityReport를 대체한다. 실행 계약(operations)이 아니라 소싱 원장의 사실이며 finalize가 같은 트랜잭션에서 쓴다. operationId는 스칼라(FK 없음) — 옛 run으로 만든 행은 옛 run id를 가진다. |
| SourcingValidationCheck | Sourcing | `sourcing_validation_checks` | 하나의 검증 episode를 구성하는 데이터 기반 check 결과. |
| SourcingValidationCheckEvidence | Sourcing | `sourcing_validation_check_evidence` | 검증 check가 참조한 immutable evidence link. |
| SourcingValidationEpisode | Sourcing | `sourcing_validation_episodes` | 추천 후보의 실데이터 검증 life-cycle. fixture 점수는 이 record로 대체된다. |
| SourcingWingCatalogProductSnapshot | Sourcing | `sourcing_wing_catalog_product_facts` | Wing 카탈로그 source owner가 evidence와 같은 transaction에서 발행하는 immutable typed product fact. 화면과 추천은 COMPLETE run coverage를 통과한 이 행만 읽는다. |
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
| SupplierProduct | Supply | `supplier_products` | 공급사별 MasterProduct 단위 공급가/주공급처 정책. |
| Alert | System | `alerts` | - |
| DataMigrationRun | System | `data_migration_runs` | 운영 data migration ledger. Schema-only db push와 별도로 영속 데이터 보정 실행 여부를 기록한다. |
| FeatureGate | System | `feature_gates` | 피처 플래그. allowedOrganizations: string[] 로 회사별 enable. |
| SystemSetting | System | `system_settings` | - |
| TodoItem | System | `todo_items` | 할 일 한 줄(TO DO LIST 화면). 사장님이 해 줘야 하는 일과 우리가 만들 일을 한 곳에 적는다 — 몰 대량등록처럼 여러 화면에 걸친 일의 남은 조각을 잊지 않으려고 둔다. |

## Mermaid ER Diagram

```mermaid
erDiagram
  AdAction {
    String id PK
    String organizationId FK
    String listingId
    String listingOptionId
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
    DateTime approvedAt
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
  AiUsageRecord {
    String id PK
    String organizationId FK
    String agentKey
    String provider
    String model
    String operation
    Int inputTokens
    Int outputTokens
    BigInt costMicroUsd
    DateTime createdAt
  }
  Alert {
    String id PK
    String organizationId FK
    String dedupeKey
    String attemptId
    String targetType
    String targetId
    String status
    String type
    String title
    String message
    DateTime readAt
    String sourceType
    String href
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
    String approvalInputHash
    DateTime approvalRequestedAt
    DateTime approvalExpiresAt
    String approvalDecision
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
    String organizationId
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
  ChannelAdListingProductMonthlyFact {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String channelAccountId
    String channelListingId
    String masterProductId
    DateTime month
    DateTime coveredStartDate
    DateTime coveredEndDate
    Int wholeRecipeWeight
    BigInt mappingGeneration
    Int observedTargetDayCount
    BigInt allocatedSpend
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelAdTargetDailySnapshot {
    String id PK
    String organizationId FK
    String channelAccountId
    String channel
    DateTime businessDate
    String listingId
    String listingOptionId
    String externalId
    String externalOptionId
    String targetType
    String targetKey
    String campaignId
    String campaignIdentity
    String campaignName
    String adGroup
    String adGroupId
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
    String rawSnapshotId
    String sourceImportRunId FK
    Json metaJson
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListing {
    String salesProductId FK
    String id PK
    String organizationId FK
    String channelAccountId FK
    String externalId
    String channelName
    String displayName
    String category
    String brand
    String manufacturer
    String imageUrl
    Json rawJson
    String lastImportRunId
    String lastOperationId
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
    Int trafficVisitors
    Int trafficViews
    Int trafficCartAdds
    Int trafficOrders
    Int trafficSalesQty
    Int trafficRevenue
    DateTime trafficObservedAt
    Int sampleCount
    DateTime firstObservedAt
    DateTime lastObservedAt
    String rawSnapshotId FK
    Json metaJson
    DateTime createdAt
    DateTime updatedAt
  }
  ChannelListingOption {
    String salesProductOptionId FK
    String id PK
    String listingId FK
    String organizationId FK
    String externalOptionId
    String kidItemCode
    String itemName
    Int salePrice
    String sellerSku
    String barcode
    String modelNumber
    String status
    Json attributesJson
    Json rawJson
    String lastImportRunId
    String lastOperationId
    Boolean isActive
    DateTime createdAt
    Int safetyStock
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
    String masterProductId
    Int quantity
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
    String sourceImportRunId
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
    String sourceImportRunId
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
    String contentWorkspaceId FK
    String source
    String thumbnailGenerationId FK
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
  ContentWorkspace {
    String id PK
    String organizationId FK
    String ownerType
    String salesProductId
    String channelListingId
    String normalizedTitle
    String status
    String currentThumbnailAssetId FK
    String currentDetailPageRevisionId FK
    String createdByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
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
  CoupangDirectTransportConsumption {
    String id PK
    String organizationId FK
     /**
    String sourceImportRunId FK
     /**
    String operationId
    String receiptId FK
    String transport FK
    StringArray selectedPurchaseOrderKeys
    DateTime createdAt
  }
  CoupangDirectTransportReceipt {
    String id PK
    String organizationId FK
    String channelAccountId
     /**
    String effectSourceImportRunId FK
     /**
    String effectOperationId
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
  CoupangKeywordRankDailySnapshot {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
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
    String sourceImportRunId FK
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
     /**
    String sourceImportRunId FK
     /**
    String operationId
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
    String sourceImportRunId FK
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
  DetailPage {
    String id PK
    String organizationId FK
    String contentWorkspaceId FK
    String source
    String templateId
    String title
    String status
    Json generationInput
    Json generationResult
    String errorMessage
    String currentRevisionId FK
    String triggeredByUserId FK
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
    String detailPageId FK
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
    String detailPageId FK
    String revisionType
    String html
    Json assetUrlMap
    Json imageUrls
    String source
    String sourceDigest
    String createdByUserId FK
    DateTime createdAt
  }
  ExecutionTask {
    String id PK
    String actionId FK
    String status
    DateTime startedAt
    DateTime finishedAt
    Json beforeJson
    Json afterJson
    String errorMessage
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
  ListingThumbnailEvaluation {
    String id PK
    String organizationId FK
    String channelListingId
    String imageUrl
    String grade
    Int score
    Json details
    String method
    String modelId
    DateTime evaluatedAt
  }
  LiveCommerceBroadcastDailySnapshot {
    String id PK
    String organizationId FK
    String operationId
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
    String operationId
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
  MasterProduct {
    String id PK
    String organizationId FK
    String code UK
    String sourceAccountKey
    String sourceProductCode
    String sourceOptionCode
    String name
    String optionName
    String barcode
    Int currentStock
    Int purchasePrice
    StringArray imageUrls
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcEvaluation {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String abcGrade
    Decimal weightedRevenue
    Decimal weightedOrderTimeSupplyCost
    Decimal weightedAdvertisingSpend
    Decimal weightedOperatingProfit
    Decimal operatingProfitVelocity30
    Decimal operatingMargin
    Decimal lossPersistence
    Decimal profitScore
    Decimal marginScore
    Decimal consistencyScore
    Decimal economicScore
    Int validObservationDays
    Int formulaRevision
    Int publicationRevision
    DateTime gradeBasisCutoffDate
    DateTime saleStartDate
    String sellpiaSourceImportRunId FK
    String sellpiaOperationId
    String advertisingSourceImportRunId FK
    BigInt sellpiaGeneration
    BigInt advertisingGeneration
    BigInt mappingGeneration
    DateTime calculatedAt
  }
  MasterProductAbcFormulaState {
    String organizationId PK,FK
    String activeFormulaVersionId FK
    Int formulaRevision
    Int publicationRevision
    DateTime officialCutoffDate
    String publishedSellpiaSourceImportRunId FK
    String publishedSellpiaOperationId
    String publishedAdvertisingSourceImportRunId FK
    BigInt publishedMappingGeneration
    BigInt mappingGeneration
    DateTime publishedAt
    DateTime createdAt
    DateTime updatedAt
  }
  MasterProductAbcFormulaVersion {
    String id PK
    String organizationId FK
    String formulaKey
    Int version
    Json formulaJson
    String formulaChecksum
    DateTime createdAt
  }
  MasterProductAbcGradeHistory {
    String id PK
    String organizationId FK
    String masterProductId FK
    String formulaVersionId FK
    String oldGrade
    String newGrade
    Decimal economicScore
    Decimal weightedOperatingProfit
    Decimal operatingMargin
    String previousSellpiaSourceImportRunId FK
    String nextSellpiaSourceImportRunId FK
    String previousSellpiaOperationId
    String nextSellpiaOperationId
    String previousAdvertisingSourceImportRunId FK
    String nextAdvertisingSourceImportRunId FK
    Int formulaRevision
    Int publicationRevision
    DateTime sourceCutoffDate
    String reason
    DateTime calculatedAt
  }
  NaverKeywordDailySnapshot {
    String id PK
    String organizationId FK
    String operationId
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
    String operationId
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
  Operation {
    String id PK
    String organizationId
    String kind
    String status
    String token
    DateTime expiresAt
    String idempotencyKey
    String requestHash
    String fileHash
    Json plan
    Json progress
    Json result
    DateTime windowStart
    DateTime windowEnd
    String errorCode
    String errorMessage
    DateTime startedAt
    DateTime finishedAt
    DateTime scheduledFor
    Int attempts
    Int maxAttempts
    DateTime createdAt
    DateTime updatedAt
  }
  OperationChunk {
    String id PK
    String operationId FK
    String organizationId
    String chunkKind
    Int sequence
    String checksum
    Int itemCount
    Json payload
    DateTime createdAt
  }
  OperationLock {
    String id PK
    String organizationId
    String lockKey
    String operationId FK
    DateTime createdAt
  }
  Order {
    String id PK
    String organizationId FK
    String channelAccountId
    String sourceImportRunId FK
     /**
    String operationId
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
     /**
    String sourceImportRunId FK
     /**
    String operationId
    String sourceFileName
    String sourceContentType
    Bytes sourceBytes
    DateTime createdAt
  }
  OrderLineItem {
    String id PK
    String organizationId FK
    String orderId FK
    String listingOptionId
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
  ProductRegistrationExecution {
    String id PK
    String organizationId FK
    String registrationTargetId FK
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
    String reviewPayloadHash
    DateTime approvedAt
    String approvedByUserId
    String requestedByUserId
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
  RegistrationTarget {
    String id PK
    String organizationId FK
    String salesProductId FK
    Int version
    String channelAccountId FK
    DateTime archivedAt
    String selectedThumbnailAssetId
    String selectedDetailPageRevisionId
    Json registrationInput
    String createdByUserId
    DateTime createdAt
    DateTime updatedAt
  }
  RegistrationTargetOption {
    String id PK
    String organizationId FK
    String registrationTargetId FK
    String salesProductOptionId FK
    Int sortOrder
  }
  ReturnTransfer {
    String id PK
    String organizationId FK
    String rtNumber
    String orderId
    String legacySellpiaInventorySkuId
    String masterProductId
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
    String sourceImportRunId FK
    String operationId
    DateTime publishedAt
    String listingId
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
    String channelAccountId
     /**
    String sourceImportRunId FK
     /**
    String operationId
     /**
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
  SalesPlan {
    String id PK
    String organizationId FK
    String period
    Int targetRevenue
    Int targetOrders
    Int targetProfit
    String notes
    DateTime createdAt
    DateTime updatedAt
  }
  SalesProduct {
    String id PK
    String organizationId
    String code
    String ownCode
    String sabangnetGoodsNo
    String name
    String shortName
    String englishName
    String printName
    String modelName
    String modelNo
    String brand
    String manufacturer
    String originCountry
    String originRegion
    StringArray keywords
    String standardCategory
    String description
    String targetAudience
    String ageGroup
    String productSize
    StringArray colorVariantNames
    Int boxSetQuantity
    Json registrationDefaults
    String status
    String taxType
    String deliveryFeeType
    Int deliveryFee
    StringArray optionAxes
    Boolean stockManaged
    StringArray imageUrls
    String noticeCategory
    StringArray noticeValues
    Json certifications
    String kcStatus
    String importDeclarationNo
    String adminMemo
    Json sourceRaw
    String sourceRecordId
    String sourcePlatform
    String sourceUrl
    Int version
    DateTime createdAt
    DateTime updatedAt
  }
  SalesProductOption {
    String id PK
    String organizationId FK
    String salesProductId FK
    String optionCode
    String sabangnetOptionCode
    StringArray values
    String optionKey
    String alias
    String barcode
    Int salePrice
    Int normalPrice
    String supplyStatus
    Int safetyStock
    Int sortOrder
    DateTime createdAt
    DateTime updatedAt
  }
  SalesProductOptionComponent {
    String id PK
    String organizationId FK
    String salesProductOptionId FK
    String masterProductId
    Int quantity
    DateTime createdAt
    DateTime updatedAt
  }
  SalesProductPublicImage {
    String id PK
    String organizationId
    String sourceUrl
    String publicUrl
    String host
    DateTime createdAt
  }
  SellpiaInventoryState {
    String organizationId PK,FK
    String sourceOrigin
    String sourceAccountKey
    DateTime lastVerifiedAt
    String lastCompletedImportRunId FK
    String lastCompletedOperationId
    String refreshReason
    String requestedSyncScope
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
    String masterProductId
    String aliasTitle
    String normalizedAlias
    Int itemCount
    String matchedType
    Int evidenceCount
  }
  SellpiaManualMatchSnapshot {
    String id PK
    String organizationId UK
    Int targetCount
    Int matchedTargetCount
    Int aliasCount
    String snapshotHash
    DateTime capturedAt
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
  SellpiaProductMonthlySales {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String operationId
    String legacySellpiaInventorySkuId
    String masterProductId
    String productCode
    String optionCode
    String yearMonth
    Int orderQty
    Int orderAmount
    Int inAmount
    String costBasis
    Boolean vatIncluded
    DateTime coverageStartDate
    DateTime coverageEndDate
    String productName
    String optionName
    String providerName
    String barcode
    DateTime capturedAt
  }
  SellpiaSalesDailySnapshot {
    String id PK
    String organizationId FK
    String sourceImportRunId FK
    String operationId
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
    String operationId
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
    String rankKeyword
    String channelAccountId
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
    String idempotencyKey
    String requestFingerprint
    DateTime expiresAt
    Json plan
    String parserVersion
    String contentChecksum
    Int contentByteCount
    Boolean providerBackedEmptyProof
    StringArray coveredMonths
    BigInt mappingGeneration
    BigInt publicationSequence
    DateTime coverageStartDate
    DateTime coverageEndDate
    String adSourcePolicyHash
    DateTime createdAt
    DateTime updatedAt
  }
  SourceRecord {
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
    String triggeredByUserId FK
    DateTime createdAt
    DateTime updatedAt
  }
  SourceRecordImage {
    String id PK
    String organizationId FK
    String sourceRecordId FK
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
    DateTime createdAt
    DateTime updatedAt
  }
  Sourcing1688OfferKeywordObservation {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String operationId
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
    Int evidenceFamilyCount
    Int evidencePlatformCount
    Boolean hasCoupangEvidence
    Boolean has1688Evidence
    String nextEvidenceAction
    Decimal heuristicScore
    Decimal decisionConfidence
    StringArray reasonCodes
    StringArray riskCodes
    Json modelOutput
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
    Int staleDiscardedCount
    String targetKey
    String idempotencyKey
    String requestHash
    String collectorKey
    String collectorVersion
    String triggerKind
    String triggeredByUserId FK
    String status
    Json attemptPlan
    String planChecksum
    String contentChecksum
    Boolean isCurrentComplete
    DateTime sourceWindowStartAt
    DateTime sourceWindowEndAt
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
    String operationId
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
    String sourceUrl
    String payloadHash
    String envelopeHash
    Json payload
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
  SourcingKeywordSuggestionSnapshot {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String operationId
    String schemaVersion
    String keywordNormalized
    Json document
    DateTime capturedAt
    DateTime createdAt
  }
  SourcingLaunchCandidate {
    String id PK
    String organizationId FK
    String sourceRecordId FK
    String supplierOfferSkuSnapshotId FK
    String targetChannelAccountId
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
  SourcingMarketShadowFact {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String operationId
    String schemaVersion
    DateTime businessDate
    Json document
    DateTime capturedAt
    DateTime createdAt
  }
  SourcingNaverKeywordAnalysisFact {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String operationId
    String schemaVersion
    String inputHash
    Json document
    DateTime capturedAt
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
  SourcingSourcePublication {
    String id PK
    String organizationId FK
    String sourceKey
    String scopeKey
    String targetKey
    String operationId
    Boolean isCurrent
    String collectorKey
    String collectorVersion
    Json plan
    DateTime windowStartAt
    DateTime windowEndAt
    Int discoveredCount
    Int acceptedCount
    Int duplicateCount
    Int coverageNumerator
    Int coverageDenominator
    String contentChecksum
    Json qualityReport
    DateTime completedAt
    DateTime createdAt
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
  SourcingWingCatalogProductSnapshot {
    String id PK
    String organizationId FK
    String evidenceObservationId FK
    String operationId
    String schemaVersion
    String sourceKeywordNormalized
    String sourceKeyword
    String productId
    String itemId
    String vendorItemId
    String productName
    String itemName
    String brandName
    String manufacture
    String categoryHierarchy
    String imagePath
    Int salePriceKrw
    Decimal ratingAverage
    Int ratingCount
    Int viewsLast28d
    Int salesLast28d
    Decimal estimatedRevenue28d
    Decimal conversionRate28d
    String deliveryInfo
    DateTime capturedAt
    DateTime createdAt
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
    String legacySellpiaInventorySkuId
    String masterProductId
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
  SystemSetting {
    String id PK
    String organizationId FK
    String key
    Json value
    DateTime createdAt
    DateTime updatedAt
  }
  ThumbnailGeneration {
    String id PK
    String organizationId FK
    String contentWorkspaceId FK
    String status
    String prompt
    String method
    Json inputMeta
    String errorMessage
    Int attemptCount
    String triggeredByUserId FK
    Boolean isDeleted
    DateTime deletedAt
    DateTime createdAt
    DateTime updatedAt
  }
  TiktokCreativeTrendDailySnapshot {
    String id PK
    String organizationId FK
    String operationId
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
  TodoItem {
    String id PK
    String organizationId FK
    String owner
    String area
    String title
    String detail
    String status
    Int sortOrder
    DateTime doneAt
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
  AdAction ||--o{ ExecutionTask : "action"
  ChannelAccount ||--o{ ChannelListing : "channelAccount"
  ChannelAccount ||--o{ ChannelScrapeRun : "channelAccount"
  ChannelAccount ||--o{ ProductRegistrationExecution : "channelAccount"
  ChannelAccount ||--o{ RegistrationTarget : "channelAccount"
  ChannelAdTargetDailySnapshot o|--o{ AdAction : "adTargetDaily"
  ChannelListing ||--o{ ChannelListingDailySnapshot : "listing"
  ChannelListing ||--o{ ChannelListingOption : "listing"
  ChannelListing ||--o{ ChannelListingOptionDailySnapshot : "listing"
  ChannelListing o|--o{ ChannelScrapeSnapshot : "listing"
  ChannelListing o|--o{ ProductRegistrationExecution : "channelListing"
  ChannelListingOption ||--o{ ChannelListingOptionDailySnapshot : "listingOption"
  ChannelListingOption ||--o{ ChannelListingOptionInventoryComponent : "channelListingOption"
  ChannelListingOption o|--o{ ChannelScrapeSnapshot : "listingOption"
  ChannelScrapeRun ||--o{ ChannelScrapeChunk : "scrapeRun"
  ChannelScrapeRun o|--o{ ChannelScrapeSnapshot : "scrapeRun"
  ChannelScrapeSnapshot o|--o{ ChannelListingDailySnapshot : "rawSnapshot"
  ChannelScrapeSnapshot o|--o{ ChannelListingOptionDailySnapshot : "rawSnapshot"
  ContentAsset o|--o{ ContentWorkspace : "currentThumbnailAsset"
  ContentWorkspace ||--o{ ContentAsset : "contentWorkspace"
  ContentWorkspace ||--o{ DetailPage : "contentWorkspace"
  ContentWorkspace ||--o{ ThumbnailGeneration : "contentWorkspace"
  CoupangDirectTransportReceipt ||--o{ CoupangDirectTransportConsumption : "receipt"
  CoupangWingTrackedProduct ||--o{ CoupangWingTrackedProductDailySnapshot : "trackedProduct"
  DetailPage ||--o{ DetailPageImageRenderIntent : "detailPage"
  DetailPage ||--o{ DetailPageRevision : "detailPage"
  DetailPageImageArtifact o|--o{ DetailPageImageRenderIntent : "completedArtifact"
  DetailPageRevision o|--o{ ContentWorkspace : "currentDetailPageRevision"
  DetailPageRevision o|--o{ DetailPage : "currentRevision"
  DetailPageRevision ||--o{ DetailPageImageArtifact : "revision"
  DetailPageRevision ||--o{ DetailPageImageRenderIntent : "revision"
  MasterProduct ||--|| MasterProductAbcEvaluation : "masterProduct"
  MasterProduct ||--o{ MasterProductAbcGradeHistory : "masterProduct"
  MasterProductAbcFormulaVersion ||--o{ MasterProductAbcEvaluation : "formulaVersion"
  MasterProductAbcFormulaVersion o|--o| MasterProductAbcFormulaState : "activeFormulaVersion"
  MasterProductAbcFormulaVersion ||--o{ MasterProductAbcGradeHistory : "formulaVersion"
  Operation ||--o{ OperationChunk : "operation"
  Operation ||--o{ OperationLock : "operation"
  Order ||--o{ OrderLineItem : "order"
  Organization ||--o{ AdAction : "organization"
  Organization ||--o{ AiDirectJob : "organization"
  Organization ||--o{ AiUsageRecord : "organization"
  Organization ||--o{ Alert : "organization"
  Organization ||--o{ CapabilityInvocation : "organization"
  Organization ||--o{ CategoryMapping : "organization"
  Organization ||--o{ ChannelAdListingProductMonthlyFact : "organization"
  Organization ||--o{ ChannelAdTargetDailySnapshot : "organization"
  Organization ||--o{ ContentAsset : "organization"
  Organization ||--o{ ContentWorkspace : "organization"
  Organization ||--o{ CoupangDirectPoSnapshot : "organization"
  Organization ||--o{ CoupangDirectTransportConsumption : "organization"
  Organization ||--o{ CoupangDirectTransportReceipt : "organization"
  Organization ||--o{ CoupangKeywordRankDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordSerpDailySnapshot : "organization"
  Organization ||--o{ CoupangKeywordTracker : "organization"
  Organization ||--o{ CoupangRepresentativeKeywordOverride : "organization"
  Organization ||--o{ CoupangShipmentDateSummary : "organization"
  Organization ||--o{ CoupangWingSalesRankDailySnapshot : "organization"
  Organization ||--o{ CoupangWingTrackedProduct : "organization"
  Organization ||--o{ CoupangWingTrackedProductDailySnapshot : "organization"
  Organization ||--o{ DetailPage : "organization"
  Organization ||--o{ DetailPageImageArtifact : "organization"
  Organization ||--o{ DetailPageImageRenderIntent : "organization"
  Organization ||--o{ DetailPageRevision : "organization"
  Organization ||--o{ LegalEntity : "organization"
  Organization ||--o{ ListingThumbnailEvaluation : "organization"
  Organization ||--o{ LiveCommerceBroadcastDailySnapshot : "organization"
  Organization ||--o{ LiveCommerceProductDailySnapshot : "organization"
  Organization ||--o{ MasterProduct : "organization"
  Organization ||--o{ MasterProductAbcEvaluation : "organization"
  Organization ||--o{ MasterProductAbcFormulaState : "organization"
  Organization ||--o{ MasterProductAbcFormulaVersion : "organization"
  Organization ||--o{ MasterProductAbcGradeHistory : "organization"
  Organization ||--o{ NaverKeywordDailySnapshot : "organization"
  Organization ||--o{ NaverPopularKeywordDailySnapshot : "organization"
  Organization ||--o{ Order : "organization"
  Organization ||--o{ OrderCollectionArtifact : "organization"
  Organization ||--o{ OrderLineItem : "organization"
  Organization ||--o{ OrganizationMembership : "organization"
  Organization ||--o{ ProcurementTestIntent : "organization"
  Organization ||--o{ PurchaseOrder : "organization"
  Organization ||--o{ PurchaseOrderItem : "organization"
  Organization ||--o{ PurchaseOrderSubmissionAttempt : "organization"
  Organization ||--o{ ReturnTransfer : "organization"
  Organization ||--o{ Review : "organization"
  Organization ||--o{ RocketPurchaseConfirmation : "organization"
  Organization ||--o{ RocketPurchaseConfirmationAllocation : "organization"
  Organization ||--o{ RocketPurchaseConfirmationLine : "organization"
  Organization ||--o{ RocketPurchaseConfirmationTransmission : "organization"
  Organization ||--o{ SalesPlan : "organization"
  Organization ||--o{ SellpiaInventoryState : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntent : "organization"
  Organization ||--o{ SellpiaOrderTransmissionIntentReconciliation : "organization"
  Organization ||--o{ SellpiaProductMonthlySales : "organization"
  Organization ||--o{ SellpiaSalesDailySnapshot : "organization"
  Organization ||--o{ Settlement : "organization"
  Organization ||--o{ ShortsTrendDailySnapshot : "organization"
  Organization ||--o{ SourceImportRun : "organization"
  Organization ||--o{ SourceRecord : "organization"
  Organization ||--o{ SourceRecordImage : "organization"
  Organization ||--o{ Sourcing1688OfferKeywordObservation : "organization"
  Organization ||--o{ SourcingCollectionSourceControl : "organization"
  Organization ||--o{ SourcingDecisionBatch : "organization"
  Organization ||--o{ SourcingDecisionBatchItem : "organization"
  Organization ||--o{ SourcingDecisionEvidence : "organization"
  Organization ||--o{ SourcingEvidenceIngestionRun : "organization"
  Organization ||--o{ SourcingEvidenceObservation : "organization"
  Organization ||--o{ SourcingInterestTarget : "organization"
  Organization ||--o{ SourcingKeywordPreference : "organization"
  Organization ||--o{ SourcingKeywordSuggestionSnapshot : "organization"
  Organization ||--o{ SourcingLaunchCandidate : "organization"
  Organization ||--o{ SourcingMarketShadowFact : "organization"
  Organization ||--o{ SourcingNaverKeywordAnalysisFact : "organization"
  Organization ||--o{ SourcingOwnerIdempotencyReceipt : "organization"
  Organization ||--o{ SourcingRecommendationItem : "organization"
  Organization ||--o{ SourcingRecommendationItemEvidence : "organization"
  Organization ||--o{ SourcingRecommendationRun : "organization"
  Organization ||--o{ SourcingReviewBatch : "organization"
  Organization ||--o{ SourcingReviewBatchItem : "organization"
  Organization ||--o{ SourcingReviewSelection : "organization"
  Organization ||--o{ SourcingSourcePublication : "organization"
  Organization ||--o{ SourcingValidationCheck : "organization"
  Organization ||--o{ SourcingValidationCheckEvidence : "organization"
  Organization ||--o{ SourcingValidationEpisode : "organization"
  Organization ||--o{ SourcingWingCatalogProductSnapshot : "organization"
  Organization ||--o{ SourcingWorkspaceSnapshot : "organization"
  Organization ||--o{ StockTransfer : "organization"
  Organization ||--o{ Supplier : "organization"
  Organization ||--o{ SupplierOfferPriceTier : "organization"
  Organization ||--o{ SupplierOfferSkuSnapshot : "organization"
  Organization ||--o{ SupplierPayment : "organization"
  Organization ||--o{ SupplierProduct : "organization"
  Organization ||--o{ SystemSetting : "organization"
  Organization ||--o{ ThumbnailGeneration : "organization"
  Organization ||--o{ TiktokCreativeTrendDailySnapshot : "organization"
  Organization ||--o{ TodoItem : "organization"
  Organization ||--o{ TrendSeedKeyword : "organization"
  Organization ||--o{ Warehouse : "organization"
  PurchaseOrder ||--o{ PurchaseOrderItem : "order"
  PurchaseOrder ||--o{ PurchaseOrderSubmissionAttempt : "purchaseOrder"
  PurchaseOrder o|--o{ SupplierPayment : "purchaseOrder"
  RegistrationTarget o|--o{ ProductRegistrationExecution : "preparation"
  RegistrationTarget ||--o{ RegistrationTargetOption : "preparation"
  RocketPoCatalogSnapshot ||--o{ RocketPoCatalogLine : "snapshot"
  RocketPurchaseConfirmation o|--o{ CoupangDirectTransportReceipt : "rocketPurchaseConfirmation"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationLine : "confirmation"
  RocketPurchaseConfirmation ||--o{ RocketPurchaseConfirmationTransmission : "confirmation"
  RocketPurchaseConfirmationLine ||--o{ RocketPurchaseConfirmationAllocation : "confirmationLine"
  SalesProduct o|--o{ ChannelListing : "salesProduct"
  SalesProduct ||--o{ RegistrationTarget : "salesProduct"
  SalesProduct ||--o{ SalesProductOption : "salesProduct"
  SalesProductOption o|--o{ ChannelListingOption : "salesProductOption"
  SalesProductOption ||--o{ RegistrationTargetOption : "option"
  SalesProductOption ||--o{ SalesProductOptionComponent : "salesProductOption"
  SellpiaManualMatchSnapshot ||--o{ SellpiaManualMatchAlias : "snapshot"
  SellpiaOrderTransmissionIntent ||--o{ SellpiaOrderTransmissionIntentReconciliation : "intent"
  SourceImportRun ||--o{ ChannelAdListingProductMonthlyFact : "sourceImportRun"
  SourceImportRun o|--o{ ChannelAdTargetDailySnapshot : "sourceImportRun"
  SourceImportRun o|--o{ CoupangDirectTransportConsumption : "sourceImportRun"
  SourceImportRun o|--o{ CoupangDirectTransportReceipt : "effectSourceImportRun"
  SourceImportRun o|--o{ CoupangKeywordRankDailySnapshot : "sourceImportRun"
  SourceImportRun o|--o{ CoupangKeywordSerpDailySnapshot : "sourceImportRun"
  SourceImportRun o|--o{ CoupangShipmentDateSummary : "sourceImportRun"
  SourceImportRun o|--o{ CoupangWingSalesRankDailySnapshot : "sourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcEvaluation : "advertisingSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcEvaluation : "sellpiaSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcFormulaState : "publishedAdvertisingSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcFormulaState : "publishedSellpiaSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcGradeHistory : "nextAdvertisingSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcGradeHistory : "nextSellpiaSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcGradeHistory : "previousAdvertisingSourceImportRun"
  SourceImportRun o|--o{ MasterProductAbcGradeHistory : "previousSellpiaSourceImportRun"
  SourceImportRun o|--o{ Order : "sourceImportRun"
  SourceImportRun o|--o| OrderCollectionArtifact : "sourceImportRun"
  SourceImportRun o|--o{ Review : "sourceImportRun"
  SourceImportRun o|--o| RocketPoCatalogSnapshot : "sourceImportRun"
  SourceImportRun o|--o{ RocketPurchaseConfirmation : "sourceImportRun"
  SourceImportRun o|--o{ RocketPurchaseConfirmationTransmission : "sourceImportRun"
  SourceImportRun o|--o{ SellpiaInventoryState : "lastCompletedImportRun"
  SourceImportRun o|--o{ SellpiaProductMonthlySales : "sourceImportRun"
  SourceImportRun o|--o{ SellpiaSalesDailySnapshot : "sourceImportRun"
  SourceRecord ||--o{ SourceRecordImage : "sourceRecord"
  SourceRecord o|--o{ SourcingLaunchCandidate : "sourceRecord"
  Sourcing1688OfferKeywordObservation ||--o{ SourcingReviewBatchItem : "offerKeywordObservation"
  SourcingDecisionBatch ||--o{ SourcingDecisionBatchItem : "decisionBatch"
  SourcingDecisionBatchItem ||--o{ ProcurementTestIntent : "decisionBatchItem"
  SourcingDecisionBatchItem ||--o{ SourcingDecisionEvidence : "decisionBatchItem"
  SourcingEvidenceObservation ||--|| Sourcing1688OfferKeywordObservation : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SourcingDecisionEvidence : "evidenceObservation"
  SourcingEvidenceObservation o|--o| SourcingEvidenceObservation : "supersedesObservation"
  SourcingEvidenceObservation ||--|| SourcingKeywordSuggestionSnapshot : "evidenceObservation"
  SourcingEvidenceObservation ||--|| SourcingMarketShadowFact : "evidenceObservation"
  SourcingEvidenceObservation ||--|| SourcingNaverKeywordAnalysisFact : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SourcingRecommendationItemEvidence : "evidenceObservation"
  SourcingEvidenceObservation ||--o{ SourcingValidationCheckEvidence : "evidenceObservation"
  SourcingEvidenceObservation ||--|| SourcingWingCatalogProductSnapshot : "evidenceObservation"
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
  ThumbnailGeneration o|--o{ ContentAsset : "thumbnailGeneration"
  User ||--o{ AuthSession : "user"
  User o|--o{ CapabilityInvocation : "approvalDecidedByUser"
  User ||--o{ CapabilityInvocation : "initiatingUser"
  User o|--o{ ContentAsset : "createdByUser"
  User o|--o{ ContentWorkspace : "createdByUser"
  User o|--o{ DetailPage : "triggeredByUser"
  User o|--o{ DetailPageImageArtifact : "createdBy"
  User o|--o{ DetailPageImageRenderIntent : "claimedBy"
  User o|--o{ DetailPageImageRenderIntent : "requestedBy"
  User o|--o{ DetailPageRevision : "createdByUser"
  User o|--o{ OrganizationMembership : "invitedBy"
  User ||--o{ OrganizationMembership : "user"
  User ||--o{ ProcurementTestIntent : "requestedByUser"
  User o|--o{ ProcurementTestIntent : "reviewedByUser"
  User o|--o{ PurchaseOrderSubmissionAttempt : "reconciler"
  User ||--o{ RocketPurchaseConfirmation : "confirmer"
  User o|--o{ SellpiaInventoryState : "activeSyncOwner"
  User ||--o{ SellpiaOrderTransmissionIntent : "creator"
  User ||--o{ SellpiaOrderTransmissionIntentReconciliation : "reconciler"
  User o|--o{ SourceImportRun : "manualFreshExportConfirmer"
  User o|--o{ SourceRecord : "triggeredByUser"
  User ||--o{ SourcingDecisionBatch : "requestedByUser"
  User o|--o{ SourcingEvidenceIngestionRun : "triggeredByUser"
  User ||--o{ SourcingLaunchCandidate : "createdByUser"
  User ||--o{ SourcingReviewBatch : "requestedBy"
  User o|--o{ ThumbnailGeneration : "triggeredByUser"
  Warehouse ||--o{ StockTransfer : "fromWarehouse"
  Warehouse ||--o{ StockTransfer : "toWarehouse"
```
