import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';
import { ListingAvailabilitySnapshotSchema } from '@kiditem/shared/sales-product';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import { PRODUCT_TRANSACTIONAL_READ_PORT, type ProductTransactionalReadPort } from '../../../../products/application/port/in/product-transactional-read.port';
import type { StockoutCheckPersistencePort, StockoutSubject } from '../../../application/port/out/persistence/stockout-check.persistence.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { readUnresolvedCompositionOptionIds } from '../repository/registration-execution.reader';
import { readLatestListingSaleStatusFacts } from './channel-listing-daily-facts';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';

@Injectable()
export class StockoutCheckPersistenceAdapter implements StockoutCheckPersistencePort {
  constructor(private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT) private readonly products: ProductTransactionalReadPort) {}

  async readSubjects(organizationId: string, listingIds: readonly string[], transaction?: OwnerTransaction): Promise<StockoutSubject[]> {
    if (listingIds.length === 0) return [];
    if (!transaction) return this.prisma.$transaction(
      tx => this.readSubjects(organizationId, listingIds, ownerTransaction(tx)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 },
    );
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, organizationId);
    const productsLock = await this.products.lock({ client: tx }, organizationId);
    const listings = await tx.channelListing.findMany({
      where: { organizationId, id: { in: [...listingIds] }, isActive: true,
        channelAccount: { organizationId, status: 'active' } },
      select: { id: true, externalId: true, channelAccountId: true, status: true, lastImportRunId: true,
        channelAccount: { select: { channel: true } },
        // 품절 송신도 등록 동결과 같은 가격 게이트를 지난다(KID-310).
        salesProduct: { select: { name: true, status: true,
          options: { where: { organizationId }, select: { id: true, supplyStatus: true, salePrice: true } } } },
        options: { where: { organizationId, isActive: true }, orderBy: { id: 'asc' },
          select: { id: true, externalOptionId: true, status: true, rawJson: true, safetyStock: true, lastImportRunId: true,
            inventoryComponents: { where: { organizationId }, select: { masterProductId: true, quantity: true } } } } },
      orderBy: { id: 'asc' },
    });
    const ids = listings.map(listing => listing.id);
    if (ids.length === 0) return [];
    const masterProductIds = [...new Set(listings.flatMap(listing => listing.options.flatMap(option => option.inventoryComponents.map(component => component.masterProductId))))];
    const stock = await this.products.readAvailability({ client: tx }, productsLock, { organizationId, masterProductIds });
    const stocks = new Map(stock.items.map(item => [item.masterProductId, item.currentStock]));
    const uncertainOptions = await readUnresolvedCompositionOptionIds(tx, { organizationId, channelListingIds: ids });
    const executions = await tx.productRegistrationExecution.findMany({
      where: { organizationId, channelListingId: { in: ids }, OR: [
        { status: { in: ['prepared', 'executing', 'reconciling'] } },
        { providerOutcome: 'uncertain' },
        { status: 'succeeded', providerOutcome: 'succeeded', executionKind: { in: ['sold_out', 'resume'] } },
      ] },
      select: { id: true, idempotencyKey: true, channelListingId: true, status: true, providerOutcome: true,
        submissionPayloadJson: true, completedAt: true, updatedAt: true },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    });
    const importIds = [...new Set(listings.flatMap(listing => [listing.lastImportRunId, ...listing.options.map(option => option.lastImportRunId)]).filter((id): id is string => id !== null))];
    const imports = importIds.length === 0 ? [] : await tx.sourceImportRun.findMany({
      where: { organizationId, id: { in: importIds }, status: 'completed' },
      select: { id: true, importedAt: true, updatedAt: true },
    });
    const importedAt = new Map(imports.map(run => [run.id, run.importedAt ?? run.updatedAt]));
    const optionObservations = await tx.channelListingOptionDailySnapshot.findMany({
      where: { organizationId, listingId: { in: ids }, OR: [{ stockQty: { not: null } }, { saleStatus: { not: null } }] },
      select: { listingOptionId: true, stockQty: true, saleStatus: true, lastObservedAt: true },
      orderBy: [{ listingOptionId: 'asc' }, { lastObservedAt: 'desc' }, { id: 'desc' }], distinct: ['listingOptionId'],
    });
    const observationsByOption = new Map(optionObservations.map(row => [row.listingOptionId, row]));
    const listingObservations = new Map((await readLatestListingSaleStatusFacts(tx, { organizationId, listingIds: ids })).map(row => [row.listingId, row]));
    return listings.map(listing => {
      const related = executions.filter(execution => execution.channelListingId === listing.id);
      const confirmed = related.flatMap(execution => {
        if (execution.status !== 'succeeded' || execution.providerOutcome !== 'succeeded') return [];
        const parsed = ListingAvailabilitySnapshotSchema.safeParse(execution.submissionPayloadJson);
        if (!parsed.success || parsed.data.channelListingId !== listing.id || parsed.data.channelAccountId !== listing.channelAccountId) return [];
        return [{ snapshot: parsed.data, observedAt: execution.completedAt ?? execution.updatedAt }];
      });
      let status = listing.status;
      let statusAt = listing.lastImportRunId ? importedAt.get(listing.lastImportRunId) : undefined;
      const observation = listingObservations.get(listing.id);
      if (observation?.saleStatus && (!statusAt || observation.observedAt > statusAt)) {
        status = observation.saleStatus; statusAt = observation.observedAt;
      }
      if (getListingAvailabilityCapability(listing.channelAccount.channel, 'sold_out')?.axis === 'listing') {
        const latest = confirmed[0];
        if (latest && (!statusAt || latest.observedAt > statusAt)) status = latest.snapshot.kind === 'sold_out' ? 'sold_out' : 'active';
      }
      return {
        listingId: listing.id, channelAccountId: listing.channelAccountId, externalListingId: listing.externalId,
        channel: listing.channelAccount.channel, status,
        salesProduct: listing.salesProduct ?? null,
        activeExecutions: related.filter(execution => ['prepared', 'executing', 'reconciling'].includes(execution.status) || execution.providerOutcome === 'uncertain')
          .map(execution => ({ id: execution.id, idempotencyKey: execution.idempotencyKey })),
        options: listing.options.map(option => {
          let optionStatus = option.status;
          let observedAt = option.lastImportRunId ? importedAt.get(option.lastImportRunId) : undefined;
          const observation = observationsByOption.get(option.id);
          if (observation && (!observedAt || observation.lastObservedAt > observedAt)) {
            optionStatus = observation.saleStatus ?? (observation.stockQty === null ? optionStatus : observation.stockQty === 0 ? 'sold_out' : 'active');
            observedAt = observation.lastObservedAt;
          }
          const lastConfirmation = confirmed.find(({ snapshot }) => snapshot.optionCodes.length === 0 || snapshot.optionCodes.includes(option.externalOptionId));
          if (lastConfirmation && (!observedAt || lastConfirmation.observedAt > observedAt)) optionStatus = lastConfirmation.snapshot.kind === 'sold_out' ? 'sold_out' : 'active';
          const raw = jsonRecord(option.rawJson);
          const invalidComposition = option.inventoryComponents.some(component => !Number.isSafeInteger(component.quantity) || component.quantity <= 0);
          return {
            id: option.id, externalOptionId: option.externalOptionId, status: optionStatus,
            registrationType: typeof raw?.registrationType === 'string' ? raw.registrationType : null,
            safetyStock: option.safetyStock,
            compositionUnconfirmed: uncertainOptions.has(option.id) || invalidComposition,
            capacity: invalidComposition ? null : projectChannelOptionCapacity(option.inventoryComponents.map(component => ({ ...component, currentStock: stocks.get(component.masterProductId) ?? null }))).capacity,
          };
        }),
      };
    });
  }
}

function jsonRecord(value: Prisma.JsonValue | null): Prisma.JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
