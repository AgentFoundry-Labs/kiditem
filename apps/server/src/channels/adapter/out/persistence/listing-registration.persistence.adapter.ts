import { KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { ListingRegistrationPersistencePort } from "../../../application/port/out/persistence/listing-registration.persistence.port";

@Injectable()
export class ListingRegistrationPersistenceAdapter implements ListingRegistrationPersistencePort {
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{
    channel: string;
    vendorId: string | null;
    externalAccountId: string | null;
  }> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        status: "active",
      },
      select: { channel: true, vendorId: true, externalAccountId: true },
    });
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
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
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 2,
    });
    if (listings.length > 1) {
      throw new KiditemPreconditionError('CHANNELS_PREFLIGHT_FAILED', { details: { reason: 'SELLPIA_SKU_AMBIGUOUS' } });
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
}
