import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MarketplaceRegistrationRepositoryPort } from '../../../application/port/out/repository/channel-listing.repository.port';

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

  async resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
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
    const [account, candidate, masterProduct] = await Promise.all([
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
      input.masterProductId
        ? tx.masterProduct.findFirst({
          where: {
            id: input.masterProductId,
            organizationId: input.organizationId,
            isActive: true,
          },
          select: { id: true },
        })
        : Promise.resolve(null),
    ]);
    if (!account) throw new NotFoundException('Marketplace account not found.');
    if (!candidate) throw new NotFoundException('Sourcing candidate not found.');
    if (input.masterProductId && !masterProduct) {
      throw new BadRequestException(
        'KidItem-first MasterProduct is inactive, missing, or belongs to another organization.',
      );
    }
    const optionLinks = (input.optionLinks ?? []).map((link) => ({
      externalOptionId: link.externalOptionId.trim(),
      productVariantId: link.productVariantId,
    }));
    if (optionLinks.length > 0 && !input.masterProductId) {
      throw new BadRequestException('KidItem-first option links require a MasterProduct identity.');
    }
    if (optionLinks.some((link) => !link.externalOptionId)) {
      throw new BadRequestException('KidItem-first channel option identity is required.');
    }
    if (new Set(optionLinks.map((link) => link.externalOptionId)).size !== optionLinks.length) {
      throw new BadRequestException('KidItem-first option identities must be unique.');
    }
    if (optionLinks.length > 0) {
      const variants = await tx.productVariant.findMany({
        where: {
          organizationId: input.organizationId,
          masterProductId: input.masterProductId,
          isActive: true,
          id: { in: optionLinks.map((link) => link.productVariantId) },
        },
        select: { id: true },
      });
      if (new Set(variants.map((variant) => variant.id)).size
        !== new Set(optionLinks.map((link) => link.productVariantId)).size) {
        throw new BadRequestException(
          'Every KidItem-first ProductVariant must belong to the linked MasterProduct.',
        );
      }
    }

    const existing = await tx.channelListing.findFirst({
      where: {
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
    });
    if (existing?.sourceCandidateId && existing.sourceCandidateId !== candidate.id) {
      throw new ConflictException('Marketplace listing already belongs to another source candidate.');
    }
    if (
      existing?.masterProductId
      && input.masterProductId
      && existing.masterProductId !== input.masterProductId
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
          masterProductId: input.masterProductId,
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
        ...(input.masterProductId ? { masterProductId: input.masterProductId } : {}),
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
  links: Array<{ externalOptionId: string; productVariantId: string }>,
): Promise<void> {
  for (const link of links) {
    const externalOptionId = link.externalOptionId;
    await tx.channelListingOption.upsert({
      where: {
        listingId_externalOptionId: { listingId, externalOptionId },
      },
      create: {
        organizationId,
        listingId,
        externalOptionId,
        productVariantId: link.productVariantId,
        isActive: true,
      },
      update: {
        productVariantId: link.productVariantId,
        isActive: true,
      },
    });
  }
}
