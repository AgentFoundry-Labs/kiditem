import { describe, expect, it, beforeEach } from 'vitest';
import { ChannelReconciliationMatcherService } from '../channel-reconciliation-matcher.service';
import { ChannelReconciliationQueryService } from '../channel-reconciliation-query.service';
import { ChannelReconciliationResolutionService } from '../channel-reconciliation-resolution.service';
import { ChannelReconciliationScanService } from '../channel-reconciliation-scan.service';
import { ChannelReconciliationService } from '../channel-reconciliation.service';
import type { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Focused unit tests for the matching rules on `scanFromRows`.
 *
 * The fake Prisma client only implements the methods this service touches.
 * It uses simple in-memory arrays so the tests can assert on side-effects
 * (auto-created `ChannelListing`, upserted reconciliation items, etc.) and
 * cover all six rules from issue #199:
 *   1. existing ChannelListing → linked / existing_external_id
 *   2. legacyCode exact 1 match → auto-create listing, linked / auto_legacy_code
 *   3. existing listing master vs legacyCode candidate disagree → conflict
 *   4. no match → needs_review
 *   5. multiple legacyCode matches → conflict
 *   6. ignored items stay ignored on re-scan
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

interface ListingRow {
  id: string;
  organizationId: string;
  channel: string;
  externalId: string;
  masterId: string;
  isDeleted: boolean;
  status: string | null;
  channelName?: string | null;
  masterName?: string;
  masterLegacyCode?: string | null;
  coupangWingImageUrl?: string | null;
}

interface ListingOptionRow {
  id: string;
  organizationId: string;
  listingId: string;
  externalOptionId: string;
  itemName?: string | null;
  optionId: string | null;
  isActive: boolean;
}

interface ProductOptionRow {
  id: string;
  organizationId: string;
  masterId: string;
  legacyCode: string | null;
  isActive: boolean;
  isDeleted: boolean;
  masterIsDeleted: boolean;
  optionName: string | null;
  sku: string;
  hasInventory?: boolean;
}

interface MasterProductRow {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
}

interface ReconciliationRunRow {
  id: string;
  organizationId: string;
  channel: string;
  source: string;
  status: string;
  totalCount: number;
  alreadyLinkedCount: number;
  autoLinkedCount: number;
  needsReviewCount: number;
  conflictCount: number;
  ignoredCount: number;
  errorCount: number;
  startedAt: Date;
  finishedAt: Date | null;
}

interface ReconciliationItemRow {
  id: string;
  organizationId: string;
  channel: string;
  source: string;
  itemType: string;
  itemKey: string;
  status: string;
  externalId: string | null;
  externalOptionId: string | null;
  legacyCode: string | null;
  channelProductName: string | null;
  channelOptionName: string | null;
  channelImageUrl: string | null;
  channelUrl: string | null;
  channelStatus: string | null;
  matchReason: string | null;
  resolutionSource: string | null;
  confidence: number | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string | null;
  linkedProductOptionId: string | null;
  ignoredReason: string | null;
  resolvedAt: Date | null;
  firstObservedAt: Date;
  lastObservedAt: Date;
  updatedAt: Date;
  rawJson: unknown;
  conflictJson: unknown;
  lastSeenRunId: string | null;
}

function makeFakePrisma(seed: {
  listings?: ListingRow[];
  listingOptions?: ListingOptionRow[];
  productOptions?: ProductOptionRow[];
  masterProducts?: MasterProductRow[];
  reconciliationItems?: Partial<ReconciliationItemRow>[];
}) {
  let idCounter = 0;
  const newId = (prefix: string) => `${prefix}-${++idCounter}`;

  const listings: ListingRow[] = [...(seed.listings ?? [])];
  const listingOptions: ListingOptionRow[] = [...(seed.listingOptions ?? [])];
  const productOptions: ProductOptionRow[] = [...(seed.productOptions ?? [])];
  const masterProducts: MasterProductRow[] = [...(seed.masterProducts ?? [])];
  const runs: ReconciliationRunRow[] = [];
  const items: ReconciliationItemRow[] = (seed.reconciliationItems ?? []).map((data) => ({
    id: data.id ?? newId('item'),
    organizationId: data.organizationId ?? ORG,
    channel: data.channel ?? 'coupang',
    source: data.source ?? 'wing_inventory',
    itemType: data.itemType ?? 'channel_listing',
    itemKey: data.itemKey ?? '',
    status: data.status ?? 'needs_review',
    externalId: data.externalId ?? null,
    externalOptionId: data.externalOptionId ?? null,
    legacyCode: data.legacyCode ?? null,
    channelProductName: data.channelProductName ?? null,
    channelOptionName: data.channelOptionName ?? null,
    channelImageUrl: data.channelImageUrl ?? null,
    channelUrl: data.channelUrl ?? null,
    channelStatus: data.channelStatus ?? null,
    matchReason: data.matchReason ?? null,
    resolutionSource: data.resolutionSource ?? null,
    confidence: data.confidence ?? null,
    linkedListingId: data.linkedListingId ?? null,
    linkedListingOptionId: data.linkedListingOptionId ?? null,
    linkedMasterProductId: data.linkedMasterProductId ?? null,
    linkedProductOptionId: data.linkedProductOptionId ?? null,
    ignoredReason: data.ignoredReason ?? null,
    resolvedAt: data.resolvedAt ?? null,
    firstObservedAt: data.firstObservedAt ?? new Date(),
    lastObservedAt: data.lastObservedAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
    rawJson: data.rawJson ?? null,
    conflictJson: data.conflictJson ?? null,
    lastSeenRunId: data.lastSeenRunId ?? null,
  }));

  const channelReconciliationRun = {
    create: async ({ data }: { data: Partial<ReconciliationRunRow> }) => {
      const row: ReconciliationRunRow = {
        id: newId('run'),
        organizationId: data.organizationId ?? '',
        channel: data.channel ?? 'coupang',
        source: data.source ?? 'wing_inventory',
        status: data.status ?? 'running',
        totalCount: 0,
        alreadyLinkedCount: 0,
        autoLinkedCount: 0,
        needsReviewCount: 0,
        conflictCount: 0,
        ignoredCount: 0,
        errorCount: 0,
        startedAt: new Date(),
        finishedAt: null,
      };
      runs.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ReconciliationRunRow>;
    }) => {
      const idx = runs.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('run not found');
      runs[idx] = { ...runs[idx], ...data };
      return runs[idx];
    },
    findFirst: async ({
      where,
      orderBy: _orderBy,
      select: _select,
    }: {
      where: { organizationId: string; channel: string };
      orderBy?: unknown;
      select?: unknown;
    }) => {
      const matching = runs.filter(
        (r) => r.organizationId === where.organizationId && r.channel === where.channel,
      );
      matching.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return matching[0] ?? null;
    },
  };

  const channelReconciliationItem = {
    findFirst: async ({
      where,
      select: _select,
    }: {
      where: {
        id?: string;
        organizationId: string;
        channel: string;
        source?: string;
        itemKey?: string;
      };
      select?: unknown;
    }) => {
      return (
        items.find(
          (i) =>
            (where.id === undefined || i.id === where.id) &&
            i.organizationId === where.organizationId &&
            i.channel === where.channel &&
            (where.source === undefined || i.source === where.source) &&
            (where.itemKey === undefined || i.itemKey === where.itemKey),
        ) ?? null
      );
    },
    findMany: async ({ where, orderBy: _orderBy, skip, take }: {
      where: {
        organizationId: string;
        channel: string;
        status?: string;
        resolutionSource?: string;
      };
      orderBy?: unknown;
      skip?: number;
      take?: number;
    }) => {
      const matching = items.filter(
        (i) =>
          i.organizationId === where.organizationId &&
          i.channel === where.channel &&
          (where.status === undefined || i.status === where.status) &&
          (where.resolutionSource === undefined ||
            i.resolutionSource === where.resolutionSource),
      );
      return matching.slice(skip ?? 0, (skip ?? 0) + (take ?? matching.length));
    },
    count: async ({
      where,
    }: {
      where: {
        organizationId: string;
        channel: string;
        status?: string;
        resolutionSource?: string;
      };
    }) => {
      return items.filter(
        (i) =>
          i.organizationId === where.organizationId &&
          i.channel === where.channel &&
          (where.status === undefined || i.status === where.status) &&
          (where.resolutionSource === undefined ||
            i.resolutionSource === where.resolutionSource),
      ).length;
    },
    create: async ({ data }: { data: Partial<ReconciliationItemRow> }) => {
      const row: ReconciliationItemRow = {
        id: newId('item'),
        organizationId: data.organizationId ?? '',
        channel: data.channel ?? 'coupang',
        source: data.source ?? 'wing_inventory',
        itemType: data.itemType ?? 'channel_listing',
        itemKey: data.itemKey ?? '',
        status: data.status ?? 'needs_review',
        externalId: data.externalId ?? null,
        externalOptionId: data.externalOptionId ?? null,
        legacyCode: data.legacyCode ?? null,
        channelProductName: data.channelProductName ?? null,
        channelOptionName: data.channelOptionName ?? null,
        channelImageUrl: data.channelImageUrl ?? null,
        channelUrl: data.channelUrl ?? null,
        channelStatus: data.channelStatus ?? null,
        matchReason: data.matchReason ?? null,
        resolutionSource: data.resolutionSource ?? null,
        confidence: data.confidence ?? null,
        linkedListingId: data.linkedListingId ?? null,
        linkedListingOptionId: data.linkedListingOptionId ?? null,
        linkedMasterProductId: data.linkedMasterProductId ?? null,
        linkedProductOptionId: data.linkedProductOptionId ?? null,
        ignoredReason: data.ignoredReason ?? null,
        resolvedAt: data.resolvedAt ?? null,
        firstObservedAt: data.firstObservedAt ?? new Date(),
        lastObservedAt: data.lastObservedAt ?? new Date(),
        updatedAt: new Date(),
        rawJson: data.rawJson ?? null,
        conflictJson: data.conflictJson ?? null,
        lastSeenRunId: data.lastSeenRunId ?? null,
      };
      items.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where:
        | { id: string }
        | {
            organizationId_channel_source_itemKey: {
              organizationId: string;
              channel: string;
              source: string;
              itemKey: string;
            };
          };
      data: Partial<ReconciliationItemRow>;
    }) => {
      const idx =
        'id' in where
          ? items.findIndex((i) => i.id === where.id)
          : items.findIndex(
              (i) =>
                i.organizationId === where.organizationId_channel_source_itemKey.organizationId &&
                i.channel === where.organizationId_channel_source_itemKey.channel &&
                i.source === where.organizationId_channel_source_itemKey.source &&
                i.itemKey === where.organizationId_channel_source_itemKey.itemKey,
            );
      if (idx === -1) throw new Error('item not found');
      items[idx] = { ...items[idx], ...data, updatedAt: new Date() };
      return items[idx];
    },
  };

  const channelListing = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      return (
        listings.find(
          (l) =>
            l.organizationId === where.organizationId &&
            l.channel === where.channel &&
            l.externalId === where.externalId &&
            (where.isDeleted === undefined || l.isDeleted === (where.isDeleted as boolean)) &&
            (where.id === undefined || l.id === where.id),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<ListingRow> }) => {
      const row: ListingRow = {
        id: newId('listing'),
        organizationId: data.organizationId ?? '',
        channel: data.channel ?? 'coupang',
        externalId: data.externalId ?? '',
        masterId: data.masterId ?? '',
        isDeleted: false,
        status: data.status ?? null,
        channelName: data.channelName ?? null,
      };
      listings.push(row);
      return row;
    },
    findMany: async ({
      where,
      orderBy: _orderBy,
      select: _select,
    }: {
      where: {
        organizationId: string;
        channel: string;
        isDeleted: boolean;
        master?: {
          isDeleted?: boolean;
          images?: { some?: { organizationId: string; isDeleted: boolean; source: string } };
        };
      };
      orderBy?: unknown;
      select?: unknown;
    }) => {
      return listings
        .filter(
          (l) =>
            l.organizationId === where.organizationId &&
            l.channel === where.channel &&
            l.isDeleted === where.isDeleted &&
            (!where.master?.images?.some || !!l.coupangWingImageUrl),
        )
        .map((l) => ({
          id: l.id,
          masterId: l.masterId,
          externalId: l.externalId,
          channelName: l.channelName ?? null,
          status: l.status,
          master: {
            name: l.masterName ?? l.channelName ?? l.externalId,
            legacyCode: l.masterLegacyCode ?? null,
            images: l.coupangWingImageUrl ? [{ url: l.coupangWingImageUrl }] : [],
          },
        }));
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<ListingRow>;
    }) => {
      let count = 0;
      for (let idx = 0; idx < listings.length; idx++) {
        const row = listings[idx];
        if (
          row.organizationId === where.organizationId &&
          (where.id === undefined || row.id === where.id) &&
          (where.channel === undefined || row.channel === where.channel) &&
          (where.externalId === undefined || row.externalId === where.externalId) &&
          (where.isDeleted === undefined || row.isDeleted === where.isDeleted)
        ) {
          listings[idx] = { ...row, ...data };
          count += 1;
        }
      }
      return { count };
    },
  };

  const channelListingOption = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      const listingId = where.listingId as { in?: string[] } | string | undefined;
      const listingIds = typeof listingId === 'object' ? listingId.in ?? [] : null;
      return listingOptions.filter(
        (o) =>
          o.organizationId === where.organizationId &&
          (listingIds === null ||
            listingIds.length === 0 ||
            listingIds.includes(o.listingId)) &&
          (where.optionId === undefined || o.optionId === where.optionId) &&
          (where.isActive === undefined || o.isActive === where.isActive),
      );
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      return (
        listingOptions.find(
          (o) =>
            o.organizationId === where.organizationId &&
            (where.listingId === undefined || o.listingId === where.listingId) &&
            (where.externalOptionId === undefined ||
              o.externalOptionId === where.externalOptionId),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<ListingOptionRow> }) => {
      const row: ListingOptionRow = {
        id: newId('opt'),
        organizationId: data.organizationId ?? '',
        listingId: data.listingId ?? '',
        externalOptionId: data.externalOptionId ?? '',
        itemName: data.itemName ?? null,
        optionId: data.optionId ?? null,
        isActive: data.isActive ?? true,
      };
      listingOptions.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ListingOptionRow>;
    }) => {
      const idx = listingOptions.findIndex((o) => o.id === where.id);
      if (idx === -1) throw new Error('listing option not found');
      listingOptions[idx] = { ...listingOptions[idx], ...data };
      return listingOptions[idx];
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<ListingOptionRow>;
    }) => {
      let count = 0;
      for (let idx = 0; idx < listingOptions.length; idx++) {
        const row = listingOptions[idx];
        if (
          row.organizationId === where.organizationId &&
          (where.id === undefined || row.id === where.id) &&
          (where.listingId === undefined || row.listingId === where.listingId) &&
          (where.externalOptionId === undefined ||
            row.externalOptionId === where.externalOptionId)
        ) {
          listingOptions[idx] = { ...row, ...data };
          count += 1;
        }
      }
      return { count };
    },
  };

  const productOption = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      const masterId = where.masterId as { in?: string[] } | string | undefined;
      const masterIds = typeof masterId === 'object' ? masterId.in ?? [] : null;
      return productOptions.filter(
        (p) =>
          p.organizationId === where.organizationId &&
          (where.legacyCode === undefined || p.legacyCode === where.legacyCode) &&
          (masterIds === null || masterIds.length === 0 || masterIds.includes(p.masterId)) &&
          (where.isActive === undefined || p.isActive === where.isActive) &&
          (where.isDeleted === undefined || p.isDeleted === where.isDeleted) &&
          (where.inventory === undefined || p.hasInventory === true) &&
          (where.master === undefined || !p.masterIsDeleted),
      );
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      return (
        productOptions.find(
          (p) =>
            (where.id === undefined || p.id === where.id) &&
            p.organizationId === where.organizationId &&
            (where.isActive === undefined || p.isActive === where.isActive) &&
            (where.isDeleted === undefined || p.isDeleted === where.isDeleted) &&
            (where.master === undefined || !p.masterIsDeleted),
        ) ?? null
      );
    },
  };

  const masterProduct = {
    findMany: async ({ where }: { where: { organizationId: string; id: { in: string[] } } }) => {
      return masterProducts.filter(
        (m) => m.organizationId === where.organizationId && where.id.in.includes(m.id),
      );
    },
  };

  const fakePrisma = {
    channelReconciliationRun,
    channelReconciliationItem,
    channelListing,
    channelListingOption,
    productOption,
    masterProduct,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma),
  };

  return {
    fakePrisma: fakePrisma as unknown as PrismaService,
    state: { listings, listingOptions, productOptions, runs, items },
  };
}

function makeService(fakePrisma: PrismaService): ChannelReconciliationService {
  const matcher = new ChannelReconciliationMatcherService();
  const query = new ChannelReconciliationQueryService(fakePrisma);
  const resolution = new ChannelReconciliationResolutionService(fakePrisma, query);
  const scan = new ChannelReconciliationScanService(fakePrisma, matcher);
  return new ChannelReconciliationService(scan, query, resolution);
}

describe('ChannelReconciliationService — matching rules', () => {
  it('Rule 1: existing active ChannelListing for externalId → linked / existing_external_id', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'M1',
          isDeleted: false,
          status: 'active',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', legacyCode: 'LEG-1' },
    ]);

    expect(result.alreadyLinkedCount).toBe(1);
    expect(result.autoLinkedCount).toBe(0);
    expect(result.needsReviewCount).toBe(0);
    expect(result.conflictCount).toBe(0);

    expect(state.items).toHaveLength(1);
    expect(state.items[0].status).toBe('linked');
    expect(state.items[0].matchReason).toBe('external_id');
    expect(state.items[0].resolutionSource).toBe('existing_external_id');
    expect(state.items[0].linkedListingId).toBe('L1');
    expect(state.items[0].linkedMasterProductId).toBe('M1');
    // Crucial: no MasterProduct auto-creation — listings table unchanged.
    expect(state.listings).toHaveLength(1);
  });

  it('rebuilds only Coupang image-sync listings into the active queue source', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'M1',
          isDeleted: false,
          status: 'active',
          channelName: 'Coupang image product',
          masterName: 'KidItem product',
          masterLegacyCode: 'LEG-1',
          coupangWingImageUrl: 'https://cdn.example.com/coupang.jpg',
        },
        {
          id: 'L2',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E2',
          masterId: 'M2',
          isDeleted: false,
          status: 'active',
          channelName: 'No image product',
          masterName: 'No image master',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.syncFromImageSyncedListings(ORG);

    expect(result.totalCount).toBe(1);
    expect(result.alreadyLinkedCount).toBe(1);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      source: 'coupang_image_sync',
      externalId: 'E1',
      channelProductName: 'Coupang image product',
      channelImageUrl: 'https://cdn.example.com/coupang.jpg',
      linkedListingId: 'L1',
      linkedMasterProductId: 'M1',
      status: 'linked',
    });
  });

  it('backfills listing option links from the listing master single inventory option', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'M1',
          isDeleted: false,
          status: 'active',
          channelName: 'Coupang image product',
          masterName: 'KidItem product',
          coupangWingImageUrl: 'https://cdn.example.com/coupang.jpg',
        },
      ],
      listingOptions: [
        {
          id: 'CLO1',
          organizationId: ORG,
          listingId: 'L1',
          externalOptionId: 'V1',
          itemName: 'Coupang unresolved option',
          optionId: null,
          isActive: true,
        },
      ],
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-1',
          hasInventory: true,
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.syncFromImageSyncedListings(ORG);

    expect(state.listingOptions[0].optionId).toBe('PO1');
    expect(result.optionLinkedCount).toBe(1);
    expect(result.optionLinkAmbiguousCount).toBe(0);
    expect(result.optionLinkNoCandidateCount).toBe(0);
  });

  it('does not guess listing option links when the listing master has multiple inventory options', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'M1',
          isDeleted: false,
          status: 'active',
          coupangWingImageUrl: 'https://cdn.example.com/coupang.jpg',
        },
      ],
      listingOptions: [
        {
          id: 'CLO1',
          organizationId: ORG,
          listingId: 'L1',
          externalOptionId: 'V1',
          itemName: 'Coupang unresolved option',
          optionId: null,
          isActive: true,
        },
      ],
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Blue',
          sku: 'SKU-1',
          hasInventory: true,
        },
        {
          id: 'PO2',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-2',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Red',
          sku: 'SKU-2',
          hasInventory: true,
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.syncFromImageSyncedListings(ORG);

    expect(state.listingOptions[0].optionId).toBeNull();
    expect(result.totalCount).toBe(2);
    expect(result.needsReviewCount).toBe(1);
    expect(result.optionLinkedCount).toBe(0);
    expect(result.optionLinkAmbiguousCount).toBe(1);
    expect(result.optionLinkNoCandidateCount).toBe(0);

    const optionItem = state.items.find((item) => item.itemKey === 'option:E1:V1');
    expect(optionItem).toMatchObject({
      source: 'coupang_image_sync',
      itemType: 'channel_option',
      status: 'needs_review',
      externalId: 'E1',
      externalOptionId: 'V1',
      channelOptionName: 'Coupang unresolved option',
      linkedListingId: 'L1',
      linkedListingOptionId: 'CLO1',
      linkedMasterProductId: 'M1',
      linkedProductOptionId: null,
    });
  });

  it('Rule 2: no listing + exactly one active ProductOption by legacyCode → auto-create listing', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-1',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', externalOptionId: 'V1', legacyCode: 'LEG-1' },
    ]);

    expect(result.autoLinkedCount).toBe(1);
    expect(result.alreadyLinkedCount).toBe(0);
    expect(result.needsReviewCount).toBe(0);

    expect(state.items[0].status).toBe('linked');
    expect(state.items[0].matchReason).toBe('legacy_code_exact');
    expect(state.items[0].resolutionSource).toBe('auto_legacy_code');
    expect(state.items[0].linkedProductOptionId).toBe('PO1');
    expect(state.items[0].linkedMasterProductId).toBe('M1');

    // ChannelListing was auto-created with the matched option's masterId.
    expect(state.listings).toHaveLength(1);
    expect(state.listings[0].masterId).toBe('M1');
    expect(state.listings[0].externalId).toBe('E1');
    // ChannelListingOption auto-created and bound to the internal optionId.
    expect(state.listingOptions).toHaveLength(1);
    expect(state.listingOptions[0].optionId).toBe('PO1');
    expect(state.listingOptions[0].externalOptionId).toBe('V1');
  });

  it('Rule 2b: existing listing + missing external option creates ChannelListingOption by legacyCode', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'M1',
          isDeleted: false,
          status: 'active',
        },
      ],
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-1',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', externalOptionId: 'V1', legacyCode: 'LEG-1' },
    ]);

    expect(result.alreadyLinkedCount).toBe(1);
    expect(state.listingOptions).toHaveLength(1);
    expect(state.listingOptions[0]).toMatchObject({
      organizationId: ORG,
      listingId: 'L1',
      externalOptionId: 'V1',
      optionId: 'PO1',
      isActive: true,
    });
    expect(state.items[0].linkedListingOptionId).toBe(state.listingOptions[0].id);
    expect(state.items[0].linkedProductOptionId).toBe('PO1');
  });

  it('Rule 3: existing listing master vs legacyCode candidate disagree → conflict (no auto-fix)', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'MASTER-A',
          isDeleted: false,
          status: 'active',
        },
      ],
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'MASTER-B', // different master
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-1',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', legacyCode: 'LEG-1' },
    ]);

    expect(result.conflictCount).toBe(1);
    expect(result.alreadyLinkedCount).toBe(0);
    expect(state.items[0].status).toBe('conflict');
    expect(state.items[0].matchReason).toBe('conflict');
    expect(state.items[0].resolutionSource).toBeNull();
    // Important: the existing listing was NOT silently retargeted.
    expect(state.listings).toHaveLength(1);
    expect(state.listings[0].masterId).toBe('MASTER-A');
  });

  it('Rule 4: no externalId match and no legacyCode → needs_review (no MasterProduct created)', async () => {
    const { fakePrisma, state } = makeFakePrisma({});
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E-NEW', channelProductName: 'Brand new toy' },
    ]);

    expect(result.needsReviewCount).toBe(1);
    expect(state.items[0].status).toBe('needs_review');
    expect(state.items[0].matchReason).toBe('none');
    expect(state.items[0].linkedMasterProductId).toBeNull();
    expect(state.items[0].linkedProductOptionId).toBeNull();
    // Acceptance: no MasterProduct/ChannelListing created from a Coupang-only row.
    expect(state.listings).toHaveLength(0);
  });

  it('Rule 5: legacyCode resolves to multiple active options → conflict (ambiguous)', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'A',
          sku: 'SKU-A',
        },
        {
          id: 'PO2',
          organizationId: ORG,
          masterId: 'M2',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'B',
          sku: 'SKU-B',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', legacyCode: 'LEG-1' },
    ]);

    expect(result.conflictCount).toBe(1);
    expect(state.items[0].status).toBe('conflict');
    expect(state.items[0].matchReason).toBe('conflict');
    // No listing auto-created when legacyCode is ambiguous.
    expect(state.listings).toHaveLength(0);
  });

  it('Rule 6: ignored items remain ignored on re-scan (refresh observation only)', async () => {
    const { fakePrisma, state } = makeFakePrisma({});
    const service = makeService(fakePrisma);

    // Initial scan — needs_review.
    await service.scanFromRows(ORG, [{ externalId: 'E1' }]);
    expect(state.items[0].status).toBe('needs_review');
    const itemId = state.items[0].id;

    // User ignores it.
    await service.ignoreItem(itemId, ORG, { reason: 'not selling on Coupang anymore' });
    expect(state.items[0].status).toBe('ignored');
    expect(state.items[0].ignoredReason).toBe('not selling on Coupang anymore');

    // Re-scan — must remain ignored regardless of fresh row data.
    const result = await service.scanFromRows(ORG, [{ externalId: 'E1' }]);
    expect(result.needsReviewCount).toBe(0);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].status).toBe('ignored');
  });

  it('cross-organization isolation: legacyCode in another org does NOT auto-link', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      productOptions: [
        {
          id: 'PO-OTHER',
          organizationId: OTHER_ORG, // different tenant
          masterId: 'M-OTHER',
          legacyCode: 'LEG-1',
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-OTHER',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.scanFromRows(ORG, [
      { externalId: 'E1', legacyCode: 'LEG-1' },
    ]);

    expect(result.autoLinkedCount).toBe(0);
    expect(result.needsReviewCount).toBe(1);
    expect(state.listings).toHaveLength(0);
  });

  it('manual link: status becomes linked / manual, listing + option auto-created', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'M1',
          legacyCode: null,
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Default',
          sku: 'SKU-1',
        },
      ],
    });
    const service = makeService(fakePrisma);

    await service.scanFromRows(ORG, [
      { externalId: 'E1', externalOptionId: 'V1', channelProductName: 'X' },
    ]);
    const itemId = state.items[0].id;
    expect(state.items[0].status).toBe('needs_review');

    const updated = await service.linkItem(itemId, ORG, { productOptionId: 'PO1' });

    expect(updated.status).toBe('linked');
    expect(updated.matchReason).toBe('manual');
    expect(updated.resolutionSource).toBe('manual');
    expect(updated.linked.productOptionId).toBe('PO1');
    // Manual link creates the listing and option link.
    expect(state.listings).toHaveLength(1);
    expect(state.listingOptions).toHaveLength(1);
    expect(state.listingOptions[0].optionId).toBe('PO1');
  });

  it('manual relink: existing listing masterId follows the selected option master', async () => {
    const { fakePrisma, state } = makeFakePrisma({
      listings: [
        {
          id: 'L1',
          organizationId: ORG,
          channel: 'coupang',
          externalId: 'E1',
          masterId: 'OLD-MASTER',
          isDeleted: false,
          status: 'active',
        },
      ],
      productOptions: [
        {
          id: 'PO1',
          organizationId: ORG,
          masterId: 'NEW-MASTER',
          legacyCode: null,
          isActive: true,
          isDeleted: false,
          masterIsDeleted: false,
          optionName: 'Correct option',
          sku: 'SKU-1',
        },
      ],
    });
    const service = makeService(fakePrisma);

    await service.scanFromRows(ORG, [{ externalId: 'E1' }]);
    const itemId = state.items[0].id;

    const updated = await service.linkItem(itemId, ORG, { productOptionId: 'PO1' });

    expect(updated.linked.masterProductId).toBe('NEW-MASTER');
    expect(state.listings[0].masterId).toBe('NEW-MASTER');
  });

  it('listItems can filter linked rows by resolutionSource before pagination', async () => {
    const { fakePrisma } = makeFakePrisma({
      reconciliationItems: [
        {
          id: 'manual-1',
          itemKey: 'listing:E-manual',
          status: 'linked',
          resolutionSource: 'manual',
        },
        {
          id: 'auto-1',
          itemKey: 'listing:E-auto',
          status: 'linked',
          resolutionSource: 'auto_legacy_code',
        },
      ],
    });
    const service = makeService(fakePrisma);

    const result = await service.listItems(ORG, {
      page: 1,
      limit: 1,
      status: 'linked',
      resolutionSource: 'auto_legacy_code',
    });

    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(['auto-1']);
  });
});
