# Graph Report - schema  (2026-05-07)

## Corpus Check
- 12 files · ~17,201 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 947 nodes · 1643 edges · 47 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 200 edges
2. `prisma — Shared Schema` - 148 edges
3. `Organization` - 124 edges
4. `MasterProduct` - 52 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 49 edges
7. `AgentInstance` - 41 edges
8. `Order` - 40 edges
9. `ChannelListing` - 39 edges
10. `User` - 35 edges
11. `AgentRunRequest` - 34 edges
12. `Alert` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ThumbnailRegistrationAttempt.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/ai.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `User.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `CategoryMapping.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma

## Communities (47 total, 0 thin omitted)

### Community 0 - "System schema"
Cohesion: 0.05
Nodes (50): prisma — Shared Schema, Finance, System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source (+42 more)

### Community 1 - "Core schema"
Cohesion: 0.04
Nodes (48): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+40 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.04
Nodes (47): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+39 more)

### Community 3 - "Supply schema"
Cohesion: 0.05
Nodes (47): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType (+39 more)

### Community 4 - "Advertising schema"
Cohesion: 0.05
Nodes (44): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+36 more)

### Community 5 - "Core schema"
Cohesion: 0.06
Nodes (43): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt (+35 more)

### Community 6 - "Core schema"
Cohesion: 0.06
Nodes (42): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+34 more)

### Community 7 - "Inventory schema"
Cohesion: 0.06
Nodes (42): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+34 more)

### Community 8 - "AgentOS schema"
Cohesion: 0.06
Nodes (36): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+28 more)

### Community 9 - "Orders schema"
Cohesion: 0.07
Nodes (34): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+26 more)

### Community 10 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 11 - "System schema"
Cohesion: 0.09
Nodes (25): Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message, Alert.metadata (+17 more)

### Community 12 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 13 - "System schema"
Cohesion: 0.12
Nodes (20): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+12 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode (+11 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 16 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+10 more)

### Community 18 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 19 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 20 - "System schema"
Cohesion: 0.12
Nodes (18): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+10 more)

### Community 21 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 22 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 23 - "Core schema"
Cohesion: 0.13
Nodes (16): Alert.actorUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 24 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 25 - "Orders schema"
Cohesion: 0.13
Nodes (15): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.order (+7 more)

### Community 26 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 27 - "Advertising schema"
Cohesion: 0.19
Nodes (13): Database ERD, Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization (+5 more)

### Community 28 - "Finance schema"
Cohesion: 0.18
Nodes (13): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+5 more)

### Community 29 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 30 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 32 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 33 - "AI schema"
Cohesion: 0.2
Nodes (11): AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser (+3 more)

### Community 34 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 35 - "AI schema"
Cohesion: 0.18
Nodes (11): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount (+3 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 37 - "AI schema"
Cohesion: 0.2
Nodes (10): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+2 more)

### Community 38 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 39 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 40 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 41 - "Core schema"
Cohesion: 0.25
Nodes (8): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption, ChannelListingOption unique(listingId, externalOptionId)

### Community 42 - "Channels schema"
Cohesion: 0.29
Nodes (8): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 43 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 44 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 45 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy, AgentInstanceToolPolicy unique(organizationId, agentInstanceId, toolId)

### Community 46 - "AI schema"
Cohesion: 0.5
Nodes (4): ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.screenshotUrl, ThumbnailRegistrationAttempt

## Knowledge Gaps
- **650 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+645 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `System schema`, `Core schema`, `AgentOS schema`, `Supply schema`, `Advertising schema`, `Core schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `System schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Core schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`?**
  _High betweenness centrality (0.426) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `System schema` to `Core schema`, `AgentOS schema`, `Supply schema`, `Advertising schema`, `Core schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `System schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Advertising schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Core schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `System schema`, `Core schema`, `AgentOS schema`, `Supply schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `System schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Advertising schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Core schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _650 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._