import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';
import { RegistrationAvailabilityPayloadSchema, type RegistrationAvailabilityListing } from '@kiditem/shared/channels-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import { PRODUCT_TRANSACTIONAL_READ_PORT, type ProductTransactionalReadPort } from '../../../../products/application/port/in/product-transactional-read.port';
import type { StockoutCheckPersistencePort, StockoutSubject } from '../../../application/port/out/persistence/stockout-check.persistence.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { LIVE_OPERATION_STATUSES, isFillOnly, readRegistrationOperations, readUnresolvedCompositionOptionIds, type RegistrationOperationFact } from '../repository/registration-operation-facts';
import { readLatestListingSaleStatusFacts } from './channel-listing-daily-facts';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import { WING_CATALOG_KINDS } from '@kiditem/shared/coupang-catalog-snapshot';
import {
  MALL_ADMIN_LISTINGS_KIND,
  ROCKET_MATCHING_CSV_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
} from '@kiditem/shared/channels-operations';

/** 리스팅·옵션에 `lastOperationId`를 남기는 Channels 카탈로그 kind(KID-354·363). 그 실행이 끝난 시각이 관측 시각이다. */
const CATALOG_OPERATION_KINDS = [
  ...WING_CATALOG_KINDS,
  SABANGNET_MALL_LISTINGS_KIND,
  MALL_ADMIN_LISTINGS_KIND,
  ROCKET_MATCHING_CSV_KIND,
] as const;

/** 카탈로그 관측 시각을 찾을 때 보는 최근 성공 실행 수(동기화 한 번이 목록·상세 둘이다). */
const RECENT_CATALOG_OPERATIONS = 200;

@Injectable()
export class StockoutCheckPersistenceAdapter implements StockoutCheckPersistencePort {
  constructor(private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT) private readonly products: ProductTransactionalReadPort,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

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
      select: { id: true, externalId: true, channelAccountId: true, status: true, lastImportRunId: true, lastOperationId: true,
        channelAccount: { select: { channel: true } },
        // 품절 송신도 등록 동결과 같은 가격 게이트를 지난다(KID-310).
        salesProduct: { select: { name: true, status: true,
          options: { where: { organizationId }, select: { id: true, supplyStatus: true, salePrice: true } } } },
        options: { where: { organizationId, isActive: true }, orderBy: { id: 'asc' },
          select: { id: true, externalOptionId: true, status: true, rawJson: true, safetyStock: true, lastImportRunId: true, lastOperationId: true,
            inventoryComponents: { where: { organizationId }, select: { masterProductId: true, quantity: true } } } } },
      orderBy: { id: 'asc' },
    });
    const ids = listings.map(listing => listing.id);
    if (ids.length === 0) return [];
    const masterProductIds = [...new Set(listings.flatMap(listing => listing.options.flatMap(option => option.inventoryComponents.map(component => component.masterProductId))))];
    const stock = await this.products.readAvailability({ client: tx }, productsLock, { organizationId, masterProductIds });
    const stocks = new Map(stock.items.map(item => [item.masterProductId, item.currentStock]));
    const uncertainOptions = await readUnresolvedCompositionOptionIds(tx, { organizationId, channelListingIds: ids });
    // 등록 실행(`channels.registration`, KID-364): 이 리스팅을 붙잡은 살아 있는 실행과, 확인된 품절 · 재개(계정 묶음)의 몫.
    const executions = await readRegistrationOperations(tx, {
      organizationId,
      planContainsAny: ids.flatMap((channelListingId) => [
        { channelListingId },
        { payload: { listings: [{ channelListingId }] } },
      ]),
    });
    const importIds = [...new Set(listings.flatMap(listing => [listing.lastImportRunId, ...listing.options.map(option => option.lastImportRunId)]).filter((id): id is string => id !== null))];
    const imports = importIds.length === 0 ? [] : await tx.sourceImportRun.findMany({
      where: { organizationId, id: { in: importIds }, status: 'completed' },
      select: { id: true, importedAt: true, updatedAt: true },
    });
    const importedAt = new Map(imports.map(run => [run.id, run.importedAt ?? run.updatedAt]));
    // 실행 계약으로 옮긴 원천(Wing 카탈로그 KID-354, 사방넷·몰 관리자·로켓 매칭 CSV KID-363)이 쓴 행은 그 실행이 끝난 시각이 관측 시각이다. 실행은 실행 계약의
    // reader로만 읽는다(ADR-0025).
    const operationIds = [...new Set(listings.flatMap(listing => [listing.lastOperationId, ...listing.options.map(option => option.lastOperationId)]).filter((id): id is string => id !== null))];
    // 한 번의 reader 조회로 최근 성공한 카탈로그 실행의 끝난 시각을 모은다. 그보다 오래된 실행이 쓴 행은 시각을 모르는
    // 것으로 두어(옛 run이 없던 행과 같다) 더 새 관측이 이긴다.
    const operationFinishedAt = new Map<string, Date>();
    if (operationIds.length > 0) {
      const { operations } = await this.operations.list(organizationId, { kinds: [...CATALOG_OPERATION_KINDS], status: 'succeeded', limit: RECENT_CATALOG_OPERATIONS });
      for (const operation of operations) {
        if (operation.finishedAt) operationFinishedAt.set(operation.id, new Date(operation.finishedAt));
      }
    }
    const catalogObservedAt = (row: { lastImportRunId: string | null; lastOperationId: string | null }) =>
      (row.lastImportRunId ? importedAt.get(row.lastImportRunId) : undefined)
        ?? (row.lastOperationId ? operationFinishedAt.get(row.lastOperationId) : undefined);
    const optionObservations = await tx.channelListingOptionDailySnapshot.findMany({
      where: { organizationId, listingId: { in: ids }, OR: [{ stockQty: { not: null } }, { saleStatus: { not: null } }] },
      select: { listingOptionId: true, stockQty: true, saleStatus: true, lastObservedAt: true },
      orderBy: [{ listingOptionId: 'asc' }, { lastObservedAt: 'desc' }, { id: 'desc' }], distinct: ['listingOptionId'],
    });
    const observationsByOption = new Map(optionObservations.map(row => [row.listingOptionId, row]));
    const listingObservations = new Map((await readLatestListingSaleStatusFacts(tx, { organizationId, listingIds: ids })).map(row => [row.listingId, row]));
    return listings.map(listing => {
      const related = executions.filter(execution => execution.plan.channelListingId === listing.id
        || availabilityListing(execution, listing.id) !== null);
      const confirmed = related.flatMap(execution => {
        const target = availabilityListing(execution, listing.id);
        if (execution.status !== 'succeeded' || isFillOnly(execution) || !target || execution.plan.channelAccountId !== listing.channelAccountId) return [];
        return [{
          kind: execution.plan.executionKind as 'sold_out' | 'resume',
          optionCodes: target.options.map(option => option.externalOptionId),
          observedAt: execution.finishedAt ?? execution.startedAt,
        }];
      });
      let status = listing.status;
      let statusAt = catalogObservedAt(listing);
      const observation = listingObservations.get(listing.id);
      if (observation?.saleStatus && (!statusAt || observation.observedAt > statusAt)) {
        status = observation.saleStatus; statusAt = observation.observedAt;
      }
      if (getListingAvailabilityCapability(listing.channelAccount.channel, 'sold_out')?.axis === 'listing') {
        const latest = confirmed[0];
        if (latest && (!statusAt || latest.observedAt > statusAt)) status = latest.kind === 'sold_out' ? 'sold_out' : 'active';
      }
      return {
        listingId: listing.id, channelAccountId: listing.channelAccountId, externalListingId: listing.externalId,
        channel: listing.channelAccount.channel, status,
        salesProduct: listing.salesProduct ?? null,
        activeExecutions: related.filter(execution => (LIVE_OPERATION_STATUSES as readonly string[]).includes(execution.status))
          .map(execution => ({ id: execution.id })),
        options: listing.options.map(option => {
          let optionStatus = option.status;
          let observedAt = catalogObservedAt(option);
          const observation = observationsByOption.get(option.id);
          if (observation && (!observedAt || observation.lastObservedAt > observedAt)) {
            optionStatus = observation.saleStatus ?? (observation.stockQty === null ? optionStatus : observation.stockQty === 0 ? 'sold_out' : 'active');
            observedAt = observation.lastObservedAt;
          }
          const lastConfirmation = confirmed.find(({ optionCodes }) => optionCodes.length === 0 || optionCodes.includes(option.externalOptionId));
          if (lastConfirmation && (!observedAt || lastConfirmation.observedAt > observedAt)) optionStatus = lastConfirmation.kind === 'sold_out' ? 'sold_out' : 'active';
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

/** 품절 · 재개 묶음 실행이 이 리스팅을 담았으면 그 항목. 다른 kind 나 다른 리스팅이면 null. */
function availabilityListing(execution: RegistrationOperationFact, listingId: string): RegistrationAvailabilityListing | null {
  if (execution.plan.executionKind !== 'sold_out' && execution.plan.executionKind !== 'resume') return null;
  const payload = RegistrationAvailabilityPayloadSchema.safeParse(execution.plan.payload);
  if (!payload.success) return null;
  return payload.data.listings.find(listing => listing.channelListingId === listingId) ?? null;
}

function jsonRecord(value: Prisma.JsonValue | null): Prisma.JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
