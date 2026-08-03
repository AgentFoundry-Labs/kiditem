import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MarketplaceRegistrationRepositoryPort } from '../../../application/port/out/repository/channel-listing.repository.port';
import {
  normalizeKidItemFirstRegistrationLinks,
  type KidItemFirstOptionLink,
  type KidItemFirstRegistrationLinks,
} from '../../../domain/kiditem-first-registration-links';
import { lockChannelListingRow } from './channel-listing-row-lock';

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter
  implements MarketplaceRegistrationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: string; vendorId: string | null; externalAccountId: string | null }> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        status: 'active',
      },
      select: { channel: true, vendorId: true, externalAccountId: true },
    });
    if (!account) throw new NotFoundException('Marketplace account not found.');
    return account;
  }

  async findExistingActiveListingBySellerSku(input: {
    organizationId: string;
    channelAccountId: string;
    sellerSku: string;
  }): Promise<{
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null> {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        isActive: true,
        options: {
          some: {
            organizationId: input.organizationId,
            sellerSku: input.sellerSku,
            isActive: true,
          },
        },
      },
      select: { externalId: true, displayName: true, status: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 2,
    });
    if (listings.length > 1) {
      throw new ConflictException(
        `Sellpia SKU '${input.sellerSku}' resolved to multiple active channel listings.`,
      );
    }
    const listing = listings[0];
    return listing
      ? {
        externalListingId: listing.externalId,
        displayName: listing.displayName?.trim() || listing.externalId,
        status: listing.status?.trim() || null,
      }
      : null;
  }

  async preflightExactProductLinks(input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: KidItemFirstOptionLink[];
  }): Promise<void> {
    await assertExactProductGraph(this.prisma, input);
  }

  async resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
    },
  ) {
    const tx = transaction as Prisma.TransactionClient;
    const externalId = input.externalListingId.trim();
    if (!externalId) throw new BadRequestException('Marketplace listing identity is required.');
    let exactLinks: KidItemFirstRegistrationLinks;
    try {
      exactLinks = normalizeKidItemFirstRegistrationLinks({
        masterProductId: input.masterProductId,
        optionLinks: input.optionLinks,
      }, input.submissionKey);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid KidItem-first product links.',
      );
    }
    const [account, candidate] = await Promise.all([
      tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          status: 'active',
        },
        select: { id: true, channel: true },
      }),
      tx.sourcingCandidate.findFirst({
        where: {
          id: input.sourceCandidateId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Marketplace account not found.');
    if (!candidate) throw new NotFoundException('Sourcing candidate not found.');
    await assertExactProductGraph(tx, {
      organizationId: input.organizationId,
      ...exactLinks,
    });
    const optionLinks = exactLinks.optionLinks;

    const existingIdentity = await tx.channelListing.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: account.id,
        externalId,
      },
      select: { id: true },
    });
    if (existingIdentity) {
      const locked = await lockChannelListingRow(tx, {
        organizationId: input.organizationId,
        channelListingId: existingIdentity.id,
        activeOnly: false,
        catalogMatchingEligibleOnly: false,
      });
      if (!locked) {
        throw new ConflictException('Marketplace listing changed concurrently.');
      }
    }
    const existing = existingIdentity
      ? await tx.channelListing.findFirst({
        where: {
          id: existingIdentity.id,
          organizationId: input.organizationId,
          channelAccountId: account.id,
          externalId,
        },
        select: {
          id: true,
          sourceCandidateId: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          externalId: true,
          status: true,
          masterProductId: true,
        },
      })
      : null;
    if (existing) {
      const activeDeletion = await tx.channelListingDeletionOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: account.id,
          channelListingId: existing.id,
          // A completed provider deletion is also a hard fence: registration
          // finalization must never resurrect a listing that WING deleted.
          OR: [
            { status: { in: ['prepared', 'executing', 'reconciling'] } },
            { providerOutcome: 'succeeded' },
          ],
        },
        select: { id: true },
      });
      if (activeDeletion) {
        throw new ConflictException(
          'Marketplace listing has an active deletion operation and cannot be reactivated.',
        );
      }
    }
    if (existing?.sourceCandidateId && existing.sourceCandidateId !== candidate.id) {
      throw new ConflictException('Marketplace listing already belongs to another source candidate.');
    }
    if (
      existing?.masterProductId
      && exactLinks.masterProductId
      && existing.masterProductId !== exactLinks.masterProductId
    ) {
      throw new ConflictException('Marketplace listing is linked to another MasterProduct.');
    }
    if (!existing) {
      const created = await tx.channelListing.create({
        data: {
          organizationId: input.organizationId,
          sourceCandidateId: candidate.id,
          channelAccountId: account.id,
          externalId,
          displayName: input.displayName,
          status: 'active',
          isActive: true,
          masterProductId: exactLinks.masterProductId,
        },
        select: {
          id: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          externalId: true,
          status: true,
        },
      });
      await upsertExactOptionLinks(tx, input.organizationId, created.id, optionLinks);
      return {
        listingId: created.id,
        channelAccountId: created.channelAccountId!,
        channel: created.channelAccount.channel,
        externalId: created.externalId,
        status: created.status,
      };
    }

    const updated = await tx.channelListing.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        OR: [
          { sourceCandidateId: null },
          { sourceCandidateId: candidate.id },
        ],
      },
      data: {
        sourceCandidateId: candidate.id,
        displayName: input.displayName,
        status: 'active',
        isActive: true,
        ...(exactLinks.masterProductId ? { masterProductId: exactLinks.masterProductId } : {}),
      },
    });
    if (updated.count !== 1) throw new ConflictException('Marketplace listing changed concurrently.');
    const listing = await tx.channelListing.findFirst({
      where: { id: existing.id, organizationId: input.organizationId },
      select: {
        id: true,
        channelAccountId: true,
        channelAccount: { select: { channel: true } },
        externalId: true,
        status: true,
      },
    });
    if (!listing?.channelAccountId) throw new ConflictException('Marketplace listing account is missing.');
    await upsertExactOptionLinks(tx, input.organizationId, listing.id, optionLinks);
    return {
      listingId: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      externalId: listing.externalId,
      status: listing.status,
    };
  }

}

async function upsertExactOptionLinks(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listingId: string,
  links: KidItemFirstOptionLink[],
): Promise<void> {
  for (const link of links) {
    const externalOptionId = link.externalOptionId;
    const existing = await tx.channelListingOption.findMany({
      where: {
        organizationId,
        listingId,
        isActive: true,
        OR: [
          { externalOptionId },
          { sellerSku: link.providerOptionKey },
        ],
      },
      select: {
        id: true,
        externalOptionId: true,
        inventoryComponents: {
          select: { sellpiaInventorySkuId: true, quantity: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    if (existing.some((option) =>
      option.inventoryComponents.length > 0
      && (option.inventoryComponents.length !== 1
        || option.inventoryComponents[0]!.sellpiaInventorySkuId
          !== link.sellpiaInventorySkuId
        || option.inventoryComponents[0]!.quantity !== link.quantity))) {
      throw new ConflictException(
        'Marketplace option already has a different inventory recipe.',
      );
    }
    const target = existing.find((option) => option.externalOptionId === externalOptionId)
      ?? existing[0];
    if (!target) {
      const createdOption = await tx.channelListingOption.create({
        data: {
          organizationId,
          listingId,
          externalOptionId,
          sellerSku: link.providerOptionKey,
          isActive: true,
        },
        select: { id: true },
      });
      await tx.channelListingOptionInventoryComponent.create({
        data: {
          organizationId,
          channelListingOptionId: createdOption.id,
          sellpiaInventorySkuId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        },
      });
      continue;
    }
    const updated = await tx.channelListingOption.updateMany({
      where: {
        id: target.id,
        organizationId,
        listingId,
        isActive: true,
      },
      data: {
        sellerSku: link.providerOptionKey,
        isActive: true,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Marketplace option changed while confirming its inventory recipe.',
      );
    }
    if (target.inventoryComponents.length === 0) {
      await tx.channelListingOptionInventoryComponent.create({
        data: {
          organizationId,
          channelListingOptionId: target.id,
          sellpiaInventorySkuId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        },
      });
    }
  }
}

async function assertExactProductGraph(
  client: Pick<Prisma.TransactionClient, 'masterProduct' | 'sellpiaInventorySku'>,
  input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: ReadonlyArray<{
      sellpiaInventorySkuId: string;
      quantity: number;
    }>;
  },
): Promise<void> {
  if (!input.masterProductId) {
    if (input.optionLinks.length > 0) {
      throw new BadRequestException('KidItem-first option links require a MasterProduct identity.');
    }
    return;
  }
  const masterProduct = await client.masterProduct.findFirst({
    where: {
      id: input.masterProductId,
      organizationId: input.organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!masterProduct) {
    throw new BadRequestException(
      'KidItem-first MasterProduct is inactive, missing, or belongs to another organization.',
    );
  }
  if (input.optionLinks.length === 0) return;
  if (input.optionLinks.some((link) => !Number.isSafeInteger(link.quantity) || link.quantity <= 0)) {
    throw new BadRequestException('Every option inventory quantity must be a positive integer.');
  }
  const skuIds = [...new Set(input.optionLinks.map((link) => link.sellpiaInventorySkuId))];
  const skus = await client.sellpiaInventorySku.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      id: { in: skuIds },
    },
    select: { id: true },
  });
  if (new Set(skus.map((sku) => sku.id)).size !== skuIds.length) {
    throw new BadRequestException(
      'Every KidItem-first inventory SKU must be active and belong to the organization.',
    );
  }
}
