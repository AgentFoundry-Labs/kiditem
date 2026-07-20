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
  }): Promise<{ channel: string }> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        status: 'active',
      },
      select: { channel: true },
    });
    if (!account) throw new NotFoundException('Marketplace account not found.');
    return account;
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
        productVariantId: string;
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
          status: { in: ['prepared', 'executing', 'reconciling'] },
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
      select: { id: true, externalOptionId: true, productVariantId: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    if (existing.some((option) =>
      option.productVariantId !== null
      && option.productVariantId !== link.productVariantId)) {
      throw new ConflictException(
        'Marketplace option already has a different confirmed ProductVariant.',
      );
    }
    const target = existing.find((option) => option.externalOptionId === externalOptionId)
      ?? existing[0];
    if (!target) {
      await tx.channelListingOption.create({
        data: {
          organizationId,
          listingId,
          externalOptionId,
          sellerSku: link.providerOptionKey,
          productVariantId: link.productVariantId,
          isActive: true,
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
        OR: [
          { productVariantId: null },
          { productVariantId: link.productVariantId },
        ],
      },
      data: {
        sellerSku: link.providerOptionKey,
        productVariantId: link.productVariantId,
        isActive: true,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Marketplace option changed while confirming its ProductVariant.',
      );
    }
  }
}

async function assertExactProductGraph(
  client: Pick<Prisma.TransactionClient, 'masterProduct' | 'productVariant'>,
  input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: ReadonlyArray<{ productVariantId: string }>;
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
  const variantIds = [...new Set(input.optionLinks.map((link) => link.productVariantId))];
  const variants = await client.productVariant.findMany({
    where: {
      organizationId: input.organizationId,
      masterProductId: input.masterProductId,
      isActive: true,
      id: { in: variantIds },
    },
    select: { id: true },
  });
  if (new Set(variants.map((variant) => variant.id)).size !== variantIds.length) {
    throw new BadRequestException(
      'Every KidItem-first ProductVariant must belong to the linked MasterProduct.',
    );
  }
}
