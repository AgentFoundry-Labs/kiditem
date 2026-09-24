import { describe, expect, it, vi } from "vitest";
import { ListingRegistrationPersistenceAdapter } from "./listing-registration.persistence.adapter";

describe("ListingRegistrationPersistenceAdapter browser registration", () => {
  it("finds an active account-scoped listing by its synced seller SKU", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        externalId: "427011919",
        displayName: "꿀사과슬랑이",
        status: "APPROVED",
      },
    ]);
    const repository = new ListingRegistrationPersistenceAdapter({
      channelListing: { findMany },
    } as never);

    await expect(
      repository.findExistingActiveListingBySellerSku({
        organizationId: "org-1",
        channelAccountId: "account-1",
        sellerSku: "10451-1",
      }),
    ).resolves.toEqual({
      externalListingId: "427011919",
      displayName: "꿀사과슬랑이",
      status: "APPROVED",
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        channelAccountId: "account-1",
        isActive: true,
        options: {
          some: {
            organizationId: "org-1",
            sellerSku: "10451-1",
            isActive: true,
          },
        },
      },
      select: { externalId: true, displayName: true, status: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 2,
    });
  });

  it("rejects an ambiguous synced seller SKU instead of guessing a listing", async () => {
    const repository = new ListingRegistrationPersistenceAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            externalId: "427011919",
            displayName: "상품 A",
            status: "APPROVED",
          },
          {
            externalId: "427011920",
            displayName: "상품 B",
            status: "APPROVED",
          },
        ]),
      },
    } as never);

    await expect(
      repository.findExistingActiveListingBySellerSku({
        organizationId: "org-1",
        channelAccountId: "account-1",
        sellerSku: "10451-1",
      }),
    ).rejects.toMatchObject({ code: 'CHANNELS_PREFLIGHT_FAILED', details: { reason: 'SELLPIA_SKU_AMBIGUOUS' } });
  });
});
