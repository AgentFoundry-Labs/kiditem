# Knip Export Risk Map

Date: 2026-04-29
Baseline: `origin/main` at `485a81c` (PR #95, unused-files baseline removed)
Command: `DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run knip:report`

## Scope Guard

This is a classification PR, not a code deletion PR. It intentionally does not edit `apps/server/**` or `apps/web/**` because A owns server cleanup and B owns web cleanup.

No schema, dependency, dev-data, or `init.sql.gz` changes are part of this lane. The root Knip report also shows `package.json: react` as an unused devDependency, but dependency changes are explicitly out of scope here.

## Buckets

Counts are symbol-level, not Knip line-level. Knip reported 37 unused-export lines and 47 unused-exported-type lines, containing 173 symbols total.

| Bucket | Count | Meaning |
| --- | ---: | --- |
| `safe-internalize` | 75 | Keep the symbol, remove only the `export` in the owner lane. `rg` found same-file implementation use, usually helper types/constants. |
| `safe-delete` | 41 | Remove the dead symbol or dead compatibility re-export in the owner lane after local verification. `rg` found no live code consumer. |
| `defer-contract` | 57 | Treat as DTO/schema/API response/dynamic registry/documented future contract. Requires owner-domain decision before changing. |

## Symbol Map

| Path | Symbol(s) | Recommendation | `rg` basis summary | Next PR lane |
| --- | --- | --- | --- | --- |
| `apps/server/src/advertising/dto/register-campaign.dto.ts` | `RegisterCampaignListingDto`, `RegisterCampaignKeywordDto` | `defer-contract` | Nested DTO classes; `rg` only finds same file plus B2B advertising plan/spec references, so deletion needs advertising controller DTO review. | A/server-advertising |
| `apps/server/src/agent-registry/adapters/registry.ts` | `listAdapters` | `defer-contract` | Adapter registry helper; `rg` finds only definition, but it is part of dynamic adapter registry surface. | A/server-agent-registry |
| `apps/server/src/agent-registry/events/agent-events.ts` | `AgentPermissionDeniedEvent`, `AgentDelegationEvent` | `safe-delete` | `rg` finds only class declarations; `AGENT_EVENTS` constants are used, but these payload classes are not emitted/listened. | A/server-agent-registry |
| `apps/server/src/agent-registry/schemas/agent-output-schemas.ts` | `AdStrategyOutputSchema`, `RulesEvaluationOutputSchema`, `RulesSuggestOutputSchema`, `ThumbnailAnalystOutputSchema`, `ManagerOutputSchema` | `defer-contract` | Zod output schemas feed `AGENT_OUTPUT_SCHEMAS` in the same file; schema contracts should move only with agent-output validation review. | A/server-agent-registry |
| `apps/server/src/ai/services/thumbnail-editor-ai.service.ts` | `MAX_FETCH_BYTES`, `ALLOWED_MIME_TO_EXT` | `defer-contract` | Compatibility re-export explicitly says existing callers may import from this service; `rg` finds canonical constants in thumbnail-image-fetcher plus tests/docs. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-image-fetcher.service.ts` | `FETCH_TIMEOUT_MS` | `safe-internalize` | `rg` finds same-file fetch timeout use only; remove export, keep constant. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-layout-presets.ts` | `LAYOUT_KINDS`, `isKnownLayout` | `safe-delete` | `rg` finds no external imports; `LAYOUT_KINDS` only backs unused `isKnownLayout`. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-prompt-scenarios.ts` | `GENERATE_SCENARIO_BLOCKS`, `CREATIVE_SCENARIO_BLOCKS` | `safe-internalize` | `rg` finds same-file `buildGenerateScenarioBlock`/`buildCreativeScenarioBlock` use only; remove export, keep constants. | A/server-ai |
| `apps/server/src/auth/decorators/skip-auth.decorator.ts` | `SkipAuth` | `defer-contract` | Scoped auth docs describe `@SkipAuth` as the public decorator even though only `SKIP_AUTH_KEY` is currently imported by guard/tests. | A/server-auth |
| `apps/server/src/channels/adapters/coupang/orders.ts` | `getReturnRequests`, `getExchangeRequests` | `safe-delete` | `rg` finds only function declarations; no channel service/test imports. | A/server-channels |
| `apps/server/src/channels/adapters/coupang/products.ts` | `updateProductPrice`, `stopSellingProduct`, `resumeSellingProduct` | `safe-delete` | `rg` finds only function declarations; current channel sync imports `getSellerProduct(s)` only. | A/server-channels |
| `apps/server/src/channels/services/channel-sync.service.ts` | `normalizeCoupangProductStatus` | `safe-internalize` | `rg` finds same-file sync use plus scoped docs; remove export only if docs keep function as internal owner. | A/server-channels |
| `apps/server/src/finance/dto/index.ts` | `SalesAnalysisQueryDto` | `defer-contract` | DTO barrel export; controller imports canonical DTO file directly, but public `dto/index` surface needs finance lane decision. | A/server-finance |
| `apps/server/src/orders/dto/list-reviews.dto.ts` | `REVIEW_FILTERS` | `safe-internalize` | `rg` finds same-file `ReviewFilter`/`ListReviewsQueryDto` use only. | A/server-orders |
| `apps/server/src/orders/services/reviews.service.ts` | `NEEDS_ATTENTION_RATING_THRESHOLD`, `NEEDS_ATTENTION_MIN_REVIEWS` | `safe-internalize` | `rg` finds same-file summary logic use only. | A/server-orders |
| `apps/server/src/procurement/dto/index.ts` | `PurchaseOrderItemDto` | `defer-contract` | DTO barrel export overlapping purchase-order-action DTO; remove only with procurement DTO barrel review. | A/server-procurement |
| `apps/server/src/procurement/dto/purchase-order-action.dto.ts` | `PurchaseOrderItemDto` | `defer-contract` | Nested request DTO used by `PurchaseOrderActionBodyDto`; public DTO/schema change needs procurement lane. | A/server-procurement |
| `apps/server/src/products/dto/master-image-item.dto.ts` | `MASTER_IMAGE_ROLES` | `safe-internalize` | `rg` finds same-file DTO decorator/type use only. | A/server-products |
| `apps/server/src/products/services/product-image-normalizer.ts` | `withNormalizedMasterImages` | `safe-delete` | `rg` finds only definition plus old product contract plan references; `normalizeMasterImages` is the used API. | A/server-products |
| `apps/server/src/workflows/executors/index.ts` | `getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions` | `defer-contract` | Workflow executor registry accessors; `rg` finds definitions only but this is dynamic registry/future catalog surface. | A/server-workflows |
| `apps/web/src/app/ad-ops/hooks/useAdOpsData.ts` | `campaignTotals` | `safe-internalize` | `rg` finds same-file `toCampaignsResponse` use only. | B/web-ad-ops |
| `apps/web/src/app/ad-ops/hooks/useAdOpsData.ts` | `useAdOpsSelectedCampaign` | `safe-delete` | `rg` finds only hook declaration; no page/component imports. | B/web-ad-ops |
| `apps/web/src/app/ad-ops/lib/status-colors.ts` | `ROAS_STATUS_COLOR` | `safe-internalize` | `rg` finds same-file `roasColor` use only. | B/web-ad-ops |
| `apps/web/src/app/ad-ops/lib/status-colors.ts` | `AD_RATE_STATUS_STYLE`, `AD_RATE_STATUS_TEXT_COLOR` | `safe-delete` | `rg` finds only declarations; no current UI imports. | B/web-ad-ops |
| `apps/web/src/app/ad-ops/lib/types.ts` | `BENCH_STATUS` | `safe-delete` | `rg` finds only declaration; current page imports `TABS`/`TabKey`. | B/web-ad-ops |
| `apps/web/src/app/agents/activity/lib/activity-utils.ts` | `AGENT_COLORS` | `safe-internalize` | `rg` finds same-file `agentColor` use only. | B/web-agents |
| `apps/web/src/app/agents/tasks/lib/trace-utils.ts` | `RUNNING_STATUSES` | `safe-internalize` | `rg` finds same-file `isRunningStatus` use plus scoped doc mention. | B/web-agents |
| `apps/web/src/app/cs-management/components/CreateCSModal.tsx` | `CS_TYPES` | `safe-internalize` | `rg` finds same-component option rendering use only. | B/web-cs-management |
| `apps/web/src/app/inventory/hooks/useInventory.ts` | `useInventoryDetail` | `safe-delete` | `rg` finds only hook declaration plus old inventory UI plan references. | B/web-inventory |
| `apps/web/src/app/inventory/lib/inventory-api.ts` | `fetchTransactions` | `safe-internalize` | `rg` finds same-file `fetchAllTransactionsInWindow` use; remove export if B keeps helper internal. | B/web-inventory |
| `apps/web/src/app/inventory/lib/inventory-api.ts` | `fetchTransactionSummary` | `safe-delete` | `rg` finds only function declaration plus old inventory UI plan references. | B/web-inventory |
| `apps/web/src/app/order-status-hub/lib/orders-api.ts` | `orderListKeyParams`, `fetchOrderList` | `safe-internalize` | `rg` finds same-file `allOrderStatusesKeyParams`/`fetchOrderListAcrossStatuses` use only. | B/web-order-status-hub |
| `apps/web/src/app/orders/lib/order-pipeline.ts` | `SYNC_HOURS` | `safe-internalize` | `rg` finds same-file `getCurrentSyncWindow` use plus tests/docs mentioning behavior, not imports. | B/web-orders |
| `apps/web/src/app/products/options/lib/product-options-api.ts` | `ProductOptionListResponseSchema` | `defer-contract` | Zod response schema; API response contract should move with product-options lane. | B/web-products-options |
| `apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx` | `UseCaseSelection` | `defer-contract` | Component implementation is no longer rendered, but scoped docs and old plans still describe it; needs B thumbnail-editor flow decision. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnail-editor/edit/lib/slots.ts` | `makeSlot`, `selectPackagingValue`, `selectColorValues`, `selectReferenceValue`, `selectBundleImages`, `selectBundleLabels`, `selectBundleOwnerProductId`, `setSlotValueById` | `safe-internalize` | `rg` finds same-file `buildInitialSlots`/`slotsToDto`/`clearSlotValueById` use only. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnail-editor/edit/lib/slots.ts` | `replaceSlotsByKind`, `setSlotFromOtherProduct`, `addToGroup` | `safe-delete` | `rg` finds only declarations or no live external imports; newer pick helpers appear to cover active path. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnails/hooks/useThumbnailAnalysis.ts` | `useAnalysisSummary`, `useAnalyzeBatch`, `useCheckImageSpec`, `usePreInspect`, `useCancelBatch` | `safe-delete` | `rg` finds only hook declarations; active thumbnail page currently uses other hooks/shared types. | B/web-thumbnails |
| `apps/web/src/app/thumbnails/lib/grade-constants.ts` | `QUALITY_GRADE_COLORS`, `QUALITY_GRADE_TEXT`, `QUALITY_GRADE_LABELS`, `COMPLIANCE_GRADE_TEXT` | `safe-delete` | `rg` finds only declarations; active cards/modal import `QUALITY_GRADE_BG`, `COMPLIANCE_GRADE_BG/COLORS/LABELS`, `VIOLATION_LABELS`. | B/web-thumbnails |
| `apps/web/src/app/thumbnails/lib/thumbnail-classification.ts` | `isWeakBackgroundOnlyReason` | `safe-delete` | `rg` finds only declaration; other classification helpers are used. | B/web-thumbnails |
| `apps/web/src/app/workflows/hooks/useWorkflows.ts` | `useWorkflow`, `useWorkflowRuns`, `useWorkflowRunDetail`, `useTriggerWorkflow` | `defer-contract` | Scoped workflow docs list these hooks as route API contracts even though current page imports list/toggle/delete only. | B/web-workflows |
| `apps/server/src/action-task/action-task.service.ts` | `RelatedProduct` | `safe-delete` | Service-level re-export alias; canonical type lives in action-task/types and shared schemas. | A/server-action-task |
| `apps/server/src/advertising/services/ad-action.service.ts` | `AdActionQuery` | `safe-internalize` | `rg` finds same-service method parameter use only; controller uses `AdActionQueryDto`. | A/server-advertising |
| `apps/server/src/advertising/services/ad-campaigns.service.ts` | `CampaignsPeriod` | `safe-internalize` | `rg` finds same-service period helper/method use only. | A/server-advertising |
| `apps/server/src/advertising/services/ad-config.service.ts` | `AdsConfig` | `safe-delete` | Service-level re-export alias; canonical `AdsConfig` remains in `advertising/services/types.ts` and has live imports. | A/server-advertising |
| `apps/server/src/advertising/services/ad-sync.service.ts` | `ListingMatch` | `safe-internalize` | `rg` finds same-service match helper use plus scoped doc mention. | A/server-advertising |
| `apps/server/src/advertising/services/channel-scrape-persistence.service.ts` | `NamespacedMetaJson`, `MetaJsonInput`, `ScrapeRunInput`, `ScrapeSnapshotInput`, `ScrapeRunFinalize`, `ListingDailyAdMetrics`, `ListingDailyMetrics`, `ListingDailyUpsertInput`, `ListingOptionDailyUpsertInput`, `AdTargetType`, `UpsertAdTargetDailyInput`, `UpsertAccountKpiInput` | `safe-internalize` | `rg` finds same-service persistence method/internal interface use only; same-name `AdTargetType` elsewhere is a different util type. | A/server-advertising |
| `apps/server/src/advertising/services/types.ts` | `BenchmarkComparison`, `NormalizedCampaignKpi` | `safe-delete` | `rg` finds only declarations plus old strategy split docs; no service imports. | A/server-advertising |
| `apps/server/src/advertising/services/types.ts` | `ScoreInput` | `safe-internalize` | `rg` finds service/test imports of score inputs via other used types; remove export only after checking type barrel consumers. | A/server-advertising |
| `apps/server/src/advertising/util/ad-target-key.ts` | `BuildAdTargetKeyInput` | `safe-internalize` | `rg` finds same-file `buildAdTargetKey` parameter use only. | A/server-advertising |
| `apps/server/src/agent-registry/adapters/types.ts` | `UsageSummary` | `defer-contract` | Adapter `ExecutionResult` payload contract; `rg` same file only, but it is nested in exported adapter result shape. | A/server-agent-registry |
| `apps/server/src/agent-registry/agent-registry.service.ts` | `OrgNode` | `safe-delete` | Service-level re-export alias; canonical `OrgNode` remains in `agent-registry/types.ts` and web has its own local type. | A/server-agent-registry |
| `apps/server/src/agent-registry/business-safety/safety-pipeline.service.ts` | `SafetyResult` | `safe-internalize` | `rg` finds same-service return type use only. | A/server-agent-registry |
| `apps/server/src/agent-registry/lifecycle/transcript.service.ts` | `TranscriptData` | `safe-internalize` | `rg` finds same-service transcript payload use only. | A/server-agent-registry |
| `apps/server/src/agent-registry/schemas/validate-output.ts` | `ValidationResult` | `safe-internalize` | `rg` finds same-file `validateAgentOutput` return use only. | A/server-agent-registry |
| `apps/server/src/ai/services/thumbnail-editor-ai.service.ts` | `ThumbnailEditorPurpose`, `ThumbnailEditorMode`, `ThumbnailEditorLayout` | `safe-internalize` | `rg` finds same-service option typing use only; keep types, remove export. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-image-fetcher.service.ts` | `FetchedThumbnailImage` | `safe-internalize` | `rg` finds same-service return type use only plus old schema-import plan references. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-layout-presets.ts` | `LayoutKind` | `safe-internalize` | `rg` finds same-file preset/`buildLayoutBlock` use only; web has separate `LayoutKindLite`. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-prompt-scenarios.ts` | `CategoryBucket`, `EditCase` | `safe-internalize` | `rg` finds same-file classify/infer/build scenario use only. | A/server-ai |
| `apps/server/src/ai/services/thumbnail-vision-ai.service.ts` | `ThumbnailGrade`, `ComplianceGrade`, `AiAnalysisIssue`, `AiAnalysisResult` | `defer-contract` | AI analysis result/grade shapes are response contracts mirrored in shared/web surfaces; do not touch outside thumbnail AI contract lane. | A/server-ai |
| `apps/server/src/channels/services/channel-sync.service.ts` | `SyncResult`, `HealthResult` | `defer-contract` | Service re-exports response shapes from services/types; settings/orders UI consume equivalent contracts, so remove only with channel API contract review. | A/server-channels |
| `apps/server/src/common/option-pricing-resolver.ts` | `ResolvePricingInput`, `ResolvedPricing` | `safe-internalize` | `rg` finds same-file `resolvePricing` signature use only; helper API can keep function export with local types. | A/server-common |
| `apps/server/src/common/pagination.ts` | `PaginatedResponse` | `safe-delete` | Server common re-export alias from `@kiditem/shared`; canonical shared type remains. | A/server-common |
| `apps/server/src/dashboard/services/context.ts` | `DateRangeContext` | `safe-internalize` | `rg` finds same-file `DashboardContext`/`buildDashboardContext` use plus scoped doc mention. | A/server-dashboard |
| `apps/server/src/products/util/cursor.ts` | `CursorPayload` | `safe-internalize` | `rg` finds same-file encode/decode use only. | A/server-products |
| `apps/server/src/rules/services/rules.service.ts` | `EvaluationResult` | `safe-delete` | Service-level re-export alias; canonical `rules/services/types.ts` remains. | A/server-rules |
| `apps/server/src/traffic/traffic.service.ts` | `DayRevenue` | `defer-contract` | Traffic summary day shape is a controller/API response contract; web has matching local interface. | A/server-traffic |
| `apps/server/src/workflows/executors/index.ts` | `NodeExecutorFn` | `defer-contract` | Executor registry function signature; dynamic workflow contract. | A/server-workflows |
| `apps/server/src/workflows/executors/types.ts` | `StandardOrder`, `StandardProduct`, `StandardInventory`, `StandardAd`, `StandardProfitLoss`, `StandardReview`, `StandardThumbnail`, `ConfigFieldType`, `ConfigField`, `OutputField` | `defer-contract` | Workflow standard data/config/output contract documented in scoped workflow guide. | A/server-workflows |
| `apps/server/src/workflows/services/dag.ts` | `WorkflowNodeDef`, `WorkflowEdgeDef`, `ExecuteData` | `safe-internalize` | `rg` finds same-file DAG implementation use only. | A/server-workflows |
| `apps/web/src/app/ad-ops/hooks/useAdOpsData.ts` | `CampaignsResponse`, `ExtensionStatusResponse`, `TrafficSummaryResponse`, `RecommendResponse` | `defer-contract` | API response types around ad-ops queries; `rg` finds same hook use and some UI/docs references. | B/web-ad-ops |
| `apps/web/src/app/agents/lib/agent-types.ts` | `CostAnalytics` | `safe-delete` | Local re-export alias from `@kiditem/shared`; active consumers import shared-derived agent API types, not this alias. | B/web-agents |
| `apps/web/src/app/inventory/lib/barcode-print.ts` | `BarcodePrintResult` | `defer-contract` | Function return contract for `printBarcodeWindow`; internal today but public helper behavior should be owned by inventory lane. | B/web-inventory |
| `apps/web/src/app/inventory/lib/inventory-api.ts` | `TransactionListParams` | `defer-contract` | API query param type; used same file and documented in old inventory plan. | B/web-inventory |
| `apps/web/src/app/marketplace/lib/marketplace-types.ts` | `MarketplaceTab` | `safe-delete` | `rg` finds only alias declaration; current marketplace page keeps tab state inline. | B/web-marketplace |
| `apps/web/src/app/order-status-hub/lib/order-projection.ts` | `OrderDailyAggregate`, `OrderRangeSummary` | `safe-internalize` | `rg` finds same-file aggregate/summarize return typing only. | B/web-order-status-hub |
| `apps/web/src/app/order-status-hub/lib/orders-api.ts` | `OrderListParams` | `defer-contract` | API query param type used by exported fetchers; B should decide with order-status hub API. | B/web-order-status-hub |
| `apps/web/src/app/orders/lib/order-pipeline.ts` | `OrderPipelineResult` | `safe-internalize` | `rg` finds same-file `EMPTY_PIPELINE_RESULT`/`buildPipeline` return typing only. | B/web-orders |
| `apps/web/src/app/products/options/lib/product-options-api.ts` | `ProductOptionListResponse` | `defer-contract` | Zod-inferred API response type paired with `ProductOptionListResponseSchema`. | B/web-products-options |
| `apps/web/src/app/sourcing/[id]/lib/types.ts` | `ProductInfoItem` | `safe-internalize` | `rg` finds same-file `ProductEditState`/`mapProcessedData` use only. | B/web-sourcing |
| `apps/web/src/app/sourcing/[id]/lib/types.ts` | `FeatureItem` | `defer-contract` | Same-name detail-template/agent model concept exists across `packages/templates` and `agents`; sourcing editor should own contract decision. | B/web-sourcing |
| `apps/web/src/app/sourcing/lib/sourcing-api.ts` | `ProductDetailResponse` | `defer-contract` | API response type; `rg` shows equivalent channel sync/test shapes across server channel domain. | B/web-sourcing |
| `apps/web/src/app/thumbnail-editor/components/FeatureSelectionModal.tsx` | `CreativeScene` | `safe-internalize` | `rg` finds same-component `FeatureSelection` union use only. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnail-editor/components/UseCaseSelection.tsx` | `WorkflowTrack` | `defer-contract` | Track type belongs to currently dormant `UseCaseSelection` flow; decide with component fate. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnail-editor/edit/lib/slots.ts` | `MakeSlotOpts`, `EditorModeLite`, `EditCaseLite`, `BuildInitialSlotsCtx`, `SlotsDtoExtras`, `GenerateDto` | `safe-internalize` | `rg` finds same-file `buildInitialSlots`/`slotsToDto` signatures only; remove exports if B keeps helpers internal. | B/web-thumbnail-editor |
| `apps/web/src/app/thumbnails/hooks/useThumbnailAnalysis.ts` | `AnalysisListResponse`, `ImageSpec` | `defer-contract` | Shared thumbnail API/image-spec contracts are mirrored in `@kiditem/shared` and server AI services. | B/web-thumbnails |
| `apps/web/src/app/thumbnails/hooks/useThumbnailTracking.ts` | `ThumbnailTrackingListResponse` | `defer-contract` | Re-export of shared tracking list response contract; remove only with shared/web thumbnail API review. | B/web-thumbnails |
| `apps/web/src/app/thumbnails/lib/thumbnail-classification.ts` | `ViolationEvidence` | `safe-internalize` | `rg` finds same-file return type and thumbnail-classification tests only. | B/web-thumbnails |
| `apps/web/src/app/workflows/lib/workflow-types.ts` | `WorkflowStepRun` | `defer-contract` | Re-export of shared workflow step-run contract; remove only with workflow shared/web contract review. | B/web-workflows |
| `apps/web/src/types/index.ts` | `ModuleCategory`, `WorkflowNode`, `WorkflowEdge`, `ModuleStatus` | `safe-internalize` | `rg` finds same-file composition into exported `Workflow`/`ModuleStatus` shapes; remove exports, keep local types after workflow UI check. | B/web-types |
| `apps/web/src/types/index.ts` | `DashboardStats`, `ExecutionLog`, `ApiConnection` | `safe-delete` | `rg` finds only declarations or unrelated Prisma/docs name collisions; no web imports. | B/web-types |

## Next Cleanup Shape

1. A/server can take `safe-internalize` and `safe-delete` rows by owner domain, with `npm run dev:server` after touching server code.
2. B/web can take `safe-internalize` and `safe-delete` rows by route/domain, with `npm run build --workspace=apps/web` after touching web code.
3. `defer-contract` rows should not be mixed into broad deletion PRs. They need a DTO/schema/API/registry owner decision first, and shared-contract rows should also check `packages/shared` before removal.
4. Dependency cleanup for root `react` is intentionally separate because this branch forbids dependency changes.
