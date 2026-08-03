import type { DataMigration } from '../types';
import { planCanonicalInventoryLinks } from '../helpers/canonical-master-inventory-identity';

export const canonicalMasterInventoryIdentity: DataMigration = {
  id: 'v0.1.30:004_canonical_master_inventory_identity',
  releaseVersion: '0.1.30',
  name: 'Replace channel-derived product matching with canonical inventory MasterProducts',
  phase: 'post-schema',
  async run(tx) {
    const [skus, listings] = await Promise.all([
      tx.sellpiaInventorySku.findMany({
        select: {
          id: true,
          organizationId: true,
          name: true,
          currentStock: true,
          isActive: true,
        },
        orderBy: { id: 'asc' },
      }),
      tx.channelListing.findMany({
        select: {
          id: true,
          organizationId: true,
          options: {
            orderBy: { id: 'asc' },
            select: {
              inventoryComponents: {
                select: { sellpiaInventorySkuId: true },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    const plan = planCanonicalInventoryLinks({
      skuIds: skus.map((sku) => sku.id),
      listings: listings.map((listing) => ({
        listingId: listing.id,
        optionSkuIds: listing.options.map((option) =>
          option.inventoryComponents.map((component) => component.sellpiaInventorySkuId)),
      })),
    });

    // Channel-derived CP products are not inventory identities. Clear their summary
    // links before rebuilding them exclusively from confirmed option recipes.
    const clearedListings = await tx.channelListing.updateMany({
      where: { masterProductId: { not: null } },
      data: { masterProductId: null },
    });

    let affectedRows = clearedListings.count;
    const canonicalProductIdBySkuId = new Map<string, string>();
    for (const sku of skus) {
      const canonicalProduct = await tx.masterProduct.upsert({
        where: {
          organizationId_code: {
            organizationId: sku.organizationId,
            code: `INV-SELLPIA-${sku.id}`,
          },
        },
        create: {
          organizationId: sku.organizationId,
          originChannelListingId: null,
          code: `INV-SELLPIA-${sku.id}`,
          name: sku.name,
          isActive: sku.isActive && sku.currentStock > 0,
        },
        update: {
          name: sku.name,
          isActive: sku.isActive && sku.currentStock > 0,
        },
        select: { id: true },
      });
      canonicalProductIdBySkuId.set(sku.id, canonicalProduct.id);
      await tx.sellpiaInventorySku.update({
        where: { id: sku.id },
        data: { masterProductId: canonicalProduct.id },
      });
      affectedRows += 1;
    }

    const organizationIdByListingId = new Map(
      listings.map((listing) => [listing.id, listing.organizationId]),
    );
    let linkedListingCount = 0;
    for (const owner of plan.listingOwners) {
      const canonicalProductId = canonicalProductIdBySkuId.get(owner.skuId);
      const organizationId = organizationIdByListingId.get(owner.listingId);
      if (!canonicalProductId || !organizationId) {
        throw new Error(`Canonical product destination is missing for listing ${owner.listingId}.`);
      }
      const linked = await tx.channelListing.updateMany({
        where: { id: owner.listingId, organizationId },
        data: { masterProductId: canonicalProductId },
      });
      if (linked.count !== 1) {
        throw new Error(`Canonical product destination crossed organization ownership: ${owner.listingId}`);
      }
      affectedRows += linked.count;
      linkedListingCount += linked.count;
    }

    const deactivated = await tx.masterProduct.updateMany({
      where: {
        originChannelListingId: { not: null },
        inventorySkus: { none: {} },
        channelListings: { none: {} },
      },
      data: { isActive: false, abcGrade: null },
    });
    affectedRows += deactivated.count;

    return {
      affectedRows,
      details: {
        canonicalProductCount: plan.canonicalSkuIds.length,
        clearedListingCount: clearedListings.count,
        linkedListingCount,
        unresolvedListingCount: plan.unresolvedListingIds.length,
        deactivatedProductCount: deactivated.count,
      },
    };
  },
};
