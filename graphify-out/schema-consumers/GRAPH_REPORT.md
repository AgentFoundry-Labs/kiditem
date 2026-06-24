# Graph Report - schema-consumers  (2026-06-03)

## Corpus Check
- 256 files · ~111,010 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2532 nodes · 12437 edges · 104 communities (97 shown, 7 thin omitted)
- Extraction: 40% EXTRACTED · 60% INFERRED · 0% AMBIGUOUS · INFERRED: 7403 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_prisma field AdAction.targetType|prisma field: AdAction.targetType]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_prisma field Order.platform|prisma field: Order.platform]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file orders.ts|code file: orders.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_prisma field ActionTask.activityLog|prisma field: ActionTask.activityLog]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field Marketplace.adapterType|prisma field: Marketplace.adapterType]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field ChannelAccount.createdAt|prisma field: ChannelAccount.createdAt]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_prisma field FeatureGate.allowedOrganizations|prisma field: FeatureGate.allowedOrganizations]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 99|Community 99]]

## God Nodes (most connected - your core abstractions)
1. `Organization` - 236 edges
2. `Database ERD` - 234 edges
3. `prisma — Shared Schema` - 115 edges
4. `ContentGeneration` - 113 edges
5. `Order` - 112 edges
6. `ThumbnailGeneration` - 105 edges
7. `MasterProduct` - 104 edges
8. `ChannelListingDailySnapshot` - 103 edges
9. `ChannelListingOption` - 96 edges
10. `ChannelScrapeSnapshot` - 94 edges
11. `User` - 92 edges
12. `ChannelAdTargetDailySnapshot` - 89 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.organization`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.organization`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ExecutionLog`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ExecutionWorker`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ExecutionWorker.organization`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (104 total, 7 thin omitted)

### Community 0 - "AI schema"
Cohesion: 0.07
Nodes (222): ConfirmedListingRegistrationInput, CoupangListingSubmissionInput, NonEmptyRecordSchema, normalizeForHash(), stableHash(), ChannelsMarketplaceRegistrationCapabilityPort, CHANNELS_OPERATION_ALERT_PORT, OperationAlertSeverity (+214 more)

### Community 1 - "Orders schema"
Cohesion: 0.03
Nodes (77): channels — Marketplace Sync + Reconciliation, formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), ChannelListing.channelAccount, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt (+69 more)

### Community 2 - "Orders schema"
Cohesion: 0.14
Nodes (53): ChannelsCapabilityKey, externalOptionId canonical option identity, vendorItemId provider term, Database ERD, AdAction.externalId, AdAction.listing, CandidateImage.isDeleted, CategoryMapping.isActive (+45 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (54): bool, int, Path, collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR (+46 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (62): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args, BundleManifest (+54 more)

### Community 5 - "Supply schema"
Cohesion: 0.04
Nodes (61): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType (+53 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (51): AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactStatusSchema, AgentConversationSummarySchema, AgentCostEventSummary, AgentCostEventSummarySchema, AgentDefinitionDelegationRole (+43 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (50): commandStatus(), apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload (+42 more)

### Community 9 - "System schema"
Cohesion: 0.08
Nodes (23): DATA_MIGRATION_RELEASES, DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash (+15 more)

### Community 10 - "prisma field: AdAction.targetType"
Cohesion: 0.07
Nodes (45): AdAction.targetType, ActionTask, ActionTaskExecuteResponse, ActionTaskRelatedProduct, ActionTaskSchema, ActionTaskSourceAlert, ActionTaskSourceAlertSchema, AdMetricsDetail (+37 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (43): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+35 more)

### Community 12 - "prisma field: MasterProduct.barcode"
Cohesion: 0.07
Nodes (37): MasterProduct.barcode, ProductOption.barcode, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup(), planKiditemImport() (+29 more)

### Community 13 - "Advertising schema"
Cohesion: 0.05
Nodes (47): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+39 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (13): ChannelListingHandle, ChannelListingOptionHandle, MatchOutcome, OptionLinkBackfillResult, PrismaLike, ProductOptionCandidate, ReconciliationRowInput, Tx (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (47): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+39 more)

### Community 16 - "AI schema"
Cohesion: 0.05
Nodes (44): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+36 more)

### Community 17 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 18 - "AI schema"
Cohesion: 0.07
Nodes (39): ContentGeneration.contentWorkspace, ContentGeneration.detailPageArtifact, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.displayName, ContentWorkspace.normalizedTitle (+31 more)

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (33): ProductLifecycleState, BundleComponent, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema (+25 more)

### Community 20 - "Channels schema"
Cohesion: 0.06
Nodes (36): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+28 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 22 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 23 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+21 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (30): MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command, COMMANDS, commandStatus() (+22 more)

### Community 25 - "prisma field: Order.platform"
Cohesion: 0.08
Nodes (29): Order.platform, Order.status, DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem (+21 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (29): AdjustStockInput, AdjustStockInputSchema, Inventory, InventoryAssetItem, InventoryAssetItemSchema, InventoryAssetReport, InventoryAssetReportSchema, InventoryListItem (+21 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride (+21 more)

### Community 28 - "Finance schema"
Cohesion: 0.08
Nodes (28): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+20 more)

### Community 29 - "Inventory schema"
Cohesion: 0.08
Nodes (27): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+19 more)

### Community 30 - "AI schema"
Cohesion: 0.08
Nodes (23): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+15 more)

### Community 31 - "prisma field: ActionTask.targetId"
Cohesion: 0.11
Nodes (19): ActionTask.targetId, Alert.actionTask, Alert.targetId, Alert.targetType, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem (+11 more)

### Community 32 - "AI schema"
Cohesion: 0.09
Nodes (20): packages/shared — @kiditem/shared, AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize (+12 more)

### Community 33 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.delegatedByRun, AgentRunRequest.dependencyKeys, AgentRunRequest.displayName, AgentRunRequest.finishedAt (+15 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (10): CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, SyncResult, syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleCoupangReturn() (+2 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.11
Nodes (21): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey (+13 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentConversation.createdAt, AgentConversation.createdByUserId, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.rootRequest, AgentConversation.status, AgentConversation.title, AgentConversation.updatedAt (+13 more)

### Community 38 - "Orders schema"
Cohesion: 0.11
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 39 - "Orders schema"
Cohesion: 0.12
Nodes (17): Review.content, Review.createdAt, Review.id, Review.platform, Review.rating, Review.reviewedAt, Review.reviewerName, Review (+9 more)

### Community 40 - "code file: orders.ts"
Cohesion: 0.22
Nodes (12): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), createSellerProduct() (+4 more)

### Community 41 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult, ContentGeneration.retryCount (+10 more)

### Community 42 - "prisma field: ActionTask.activityLog"
Cohesion: 0.13
Nodes (16): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+8 more)

### Community 43 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 44 - "Core schema"
Cohesion: 0.12
Nodes (17): ContentGeneration.triggeredByUser, DetailPageRevision.createdByUser, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser, User.avatarUrl, User.createdAt, User.email, User.id (+9 more)

### Community 45 - "prisma field: Marketplace.adapterType"
Cohesion: 0.12
Nodes (16): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+8 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentOS, AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+8 more)

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (10): CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey(), toRecord(), readCredentialsConfig(), toJsonRecord(), toRecord() (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (11): RegisterConfirmedMarketplaceListingCapabilityInput, RegisterConfirmedMarketplaceListingCapabilityResult, RegisterConfirmedListingInput, RegisteredMarketplaceListingResult, extractNestedSellerProductId(), firstSalePrice(), numberField(), RegisterConfirmedMarketplaceListingInput (+3 more)

### Community 49 - "System schema"
Cohesion: 0.13
Nodes (15): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt (+7 more)

### Community 50 - "Community 50"
Cohesion: 0.17
Nodes (7): CoupangReconciliationIgnoreDto, CoupangReconciliationRowDto, CoupangReconciliationScanDto, SyncOrdersBodyDto, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, UpdateCoupangAccountSettingsSchema

### Community 51 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (12): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, PaginatedResponseSchema(), SyncInfo, SyncInfoSchema, zIsoDate, AgentCatalogItem (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.13
Nodes (13): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationPreserved, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus, CancelOperationStatusSchema, CancelOperationTarget (+5 more)

### Community 54 - "Community 54"
Cohesion: 0.21
Nodes (10): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), main(), missingBodyFields(), parseArgs() (+2 more)

### Community 55 - "Community 55"
Cohesion: 0.27
Nodes (13): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), ghPrBody(), git(), hasReleaseDecision(), isSemver(), main() (+5 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 57 - "Finance schema"
Cohesion: 0.17
Nodes (13): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.period, SalesPlan.targetOrders, SalesPlan.targetProfit (+5 more)

### Community 58 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 59 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 61 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.targetDomain, AgentArtifact.targetId, AgentArtifact.targetModel, AgentArtifact.title (+3 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 64 - "Orders schema"
Cohesion: 0.20
Nodes (11): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+3 more)

### Community 65 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 66 - "AI schema"
Cohesion: 0.20
Nodes (11): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.27
Nodes (9): appendValues(), parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS (+1 more)

### Community 68 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.36
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 71 - "Community 71"
Cohesion: 0.47
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 72 - "Core schema"
Cohesion: 0.25
Nodes (9): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, MasterCodeCounter.updatedAt, MasterCodeCounter.value, CategoryMapping, MasterCodeCounter (+1 more)

### Community 73 - "prisma field: ChannelAccount.createdAt"
Cohesion: 0.25
Nodes (8): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount unique(organizationId, channel, externalAccountId)

### Community 74 - "Community 74"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (7): analyzeSchemaArtifactSync(), changedFilesFromGit(), GENERATED_ARTIFACT_PATHS, git(), main(), parseArgs(), SCHEMA_PATHS

### Community 77 - "prisma field: FeatureGate.allowedOrganizations"
Cohesion: 0.25
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 78 - "Finance schema"
Cohesion: 0.25
Nodes (8): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost, ProcessingCost.vendor, ProcessingCost

### Community 79 - "Community 79"
Cohesion: 0.43
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 80 - "Community 80"
Cohesion: 0.43
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 81 - "Community 81"
Cohesion: 0.29
Nodes (4): CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 82 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson, AgentToolDefinition.riskLevel, AgentToolDefinition.updatedAt, AgentToolDefinition

### Community 83 - "Finance schema"
Cohesion: 0.29
Nodes (7): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger

### Community 84 - "Community 84"
Cohesion: 0.48
Nodes (4): fileSize(), readJson(), readTextIfExists(), writeJson()

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (4): SubmitCoupangMarketplaceListingCapabilityInput, SubmitCoupangMarketplaceListingCapabilityResult, CoupangSellerProductPayload, SubmitCoupangMarketplaceListingInput

### Community 87 - "Core schema"
Cohesion: 0.47
Nodes (6): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, BundleComponent, BundleComponent unique(bundleOptionId, componentOptionId)

### Community 88 - "Community 88"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 89 - "Community 89"
Cohesion: 0.33
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 91 - "Community 91"
Cohesion: 0.80
Nodes (4): coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField()

### Community 99 - "Community 99"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **999 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+994 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `AI schema` to `Orders schema`, `Orders schema`, `Community 4`, `Supply schema`, `Community 6`, `Community 7`, `Community 8`, `System schema`, `prisma field: AdAction.targetType`, `prisma field: MasterProduct.barcode`, `Advertising schema`, `Community 14`, `Community 15`, `AI schema`, `Inventory schema`, `AI schema`, `Community 19`, `Channels schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `prisma field: Order.platform`, `Community 26`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `AI schema`, `prisma field: ActionTask.targetId`, `AI schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `AI schema`, `prisma field: ActionTask.activityLog`, `System schema`, `AgentOS schema`, `System schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `AI schema`, `Inventory schema`, `Core schema`, `prisma field: ChannelAccount.createdAt`, `prisma field: FeatureGate.allowedOrganizations`, `Finance schema`, `Finance schema`, `Core schema`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `AI schema`, `Orders schema`, `Supply schema`, `System schema`, `prisma field: AdAction.targetType`, `prisma field: MasterProduct.barcode`, `Advertising schema`, `AI schema`, `Inventory schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `AI schema`, `prisma field: ActionTask.targetId`, `AI schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `AI schema`, `prisma field: ActionTask.activityLog`, `System schema`, `Core schema`, `prisma field: Marketplace.adapterType`, `AgentOS schema`, `System schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `AI schema`, `Inventory schema`, `Core schema`, `prisma field: ChannelAccount.createdAt`, `prisma field: FeatureGate.allowedOrganizations`, `Finance schema`, `AgentOS schema`, `Finance schema`, `Core schema`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `AI schema`, `Orders schema`, `Supply schema`, `Community 6`, `Community 7`, `Community 8`, `System schema`, `prisma field: AdAction.targetType`, `Community 11`, `prisma field: MasterProduct.barcode`, `Community 14`, `AI schema`, `Inventory schema`, `Community 19`, `prisma field: Order.platform`, `Community 26`, `Finance schema`, `AI schema`, `Community 35`, `Orders schema`, `Orders schema`, `code file: orders.ts`, `Community 50`, `Orders schema`, `Community 60`, `Orders schema`, `Community 69`, `Community 75`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 86 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `operation-alert.adapter.ts`) actually correct?**
  _`Organization` has 86 INFERRED edges - model-reasoned connections that need verification._
- **Are the 76 inferred relationships involving `ContentGeneration` (e.g. with `channel-registration-capability.adapter.ts` and `operation-alert.adapter.ts`) actually correct?**
  _`ContentGeneration` has 76 INFERRED edges - model-reasoned connections that need verification._
- **Are the 71 inferred relationships involving `Order` (e.g. with `orders.ts` and `orders.ts`) actually correct?**
  _`Order` has 71 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _999 weakly-connected nodes found - possible documentation gaps or missing edges._