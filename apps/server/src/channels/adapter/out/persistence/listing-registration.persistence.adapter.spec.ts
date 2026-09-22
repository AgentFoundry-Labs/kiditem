import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ListingRegistrationPersistenceAdapter } from "./listing-registration.persistence.adapter";
import { ownerTransaction } from "../../../../prisma/owner-transaction";
import { ChannelsProductMappingGenerationAdapter } from "../products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

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
    } as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

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
    } as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

    await expect(
      repository.findExistingActiveListingBySellerSku({
        organizationId: "org-1",
        channelAccountId: "account-1",
        sellerSku: "10451-1",
      }),
    ).rejects.toThrow("multiple active channel listings");
  });

  it("preflights tenant-owned active product and inventory SKU identities", async () => {
    const validateRecipeTargets = vi.fn().mockRejectedValue(
      new BadRequestException(
        "One or more SellpiaInventorySku components do not belong to this organization",
      ),
    );
    const recipeMutations = {
      validateRecipeTargets,
    };
    const repository = new ListingRegistrationPersistenceAdapter(
      {} as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      recipeMutations as never,
    );

    await expect(
      repository.preflightExactProductLinks({
        organizationId: "00000000-0000-4000-8000-000000000010",
        masterProductId: "00000000-0000-4000-8000-000000000001",
        optionLinks: [
          {
            externalOptionId: "BLUE",
            sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000002",
            quantity: 1,
            providerOptionKey: "submission-key",
          },
        ],
      }),
    ).rejects.toThrow(
      "One or more SellpiaInventorySku components do not belong to this organization",
    );
    expect(validateRecipeTargets).toHaveBeenCalledWith({
      organizationId: "00000000-0000-4000-8000-000000000010",
      expectedMasterProductId: "00000000-0000-4000-8000-000000000001",
      components: [{
        masterProductId: "00000000-0000-4000-8000-000000000002",
        quantity: 1,
      }],
    });
  });

  it("reactivates the account identity and attaches the selling product without a Master", async () => {
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      masterProductAbcFormulaState: {
        upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListingDeletionOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      salesProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: "draft-1" }),
      },
      channelListing: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "listing-1",
            salesProductId: null,
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "inactive",
            isActive: false,
          })
          .mockResolvedValueOnce({
            id: "listing-1",
            salesProductId: null,
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "inactive",
            isActive: false,
            masterProductId: null,
          })
          .mockResolvedValueOnce({
            id: "listing-1",
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "active",
          }),
        findMany: vi.fn().mockResolvedValue([{ id: "listing-1", options: [] }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ListingRegistrationPersistenceAdapter(
      {} as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

    await expect(
      repository.resolveProductRegistration(ownerTransaction(tx as never), {
        organizationId: "org-1",
        salesProductId: "draft-1",
        channelAccountId: "account-1",
        submissionKey: "submission-key-1",
        externalListingId: "427011919",
        displayName: "Kids rain boots",
      }),
    ).resolves.toEqual({
      listingId: "listing-1",
      channel: "coupang",
      channelAccountId: "account-1",
      externalId: "427011919",
      status: "active",
    });
    expect(tx.channelListing.updateMany).toHaveBeenCalledWith({
      where: {
        id: "listing-1",
        organizationId: "org-1",
        OR: [{ salesProductId: null }, { salesProductId: "draft-1" }],
      },
      data: {
        salesProductId: "draft-1",
        displayName: "Kids rain boots",
        status: "active",
        isActive: true,
      },
    });
  });

  it("rejects reassignment of a listing already owned by another selling product", async () => {
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      salesProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: "draft-1" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListingDeletionOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: "listing-1",
          salesProductId: "other-draft",
        }),
        findMany: vi.fn().mockResolvedValue([{ id: "listing-1", options: [] }]),
        updateMany: vi.fn(),
      },
    };
    const repository = new ListingRegistrationPersistenceAdapter(
      {} as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

    await expect(
      repository.resolveProductRegistration(ownerTransaction(tx as never), {
        organizationId: "org-1",
        salesProductId: "draft-1",
        channelAccountId: "account-1",
        submissionKey: "submission-key-1",
        externalListingId: "427011919",
        displayName: "Kids rain boots",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.channelListing.updateMany).not.toHaveBeenCalled();
  });

  it("does not reactivate a listing while its deletion operation is active", async () => {
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      salesProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: "draft-1" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListing: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "listing-1" })
          .mockResolvedValueOnce({
            id: "listing-1",
            salesProductId: null,
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "inactive",
            masterProductId: null,
          }),
        updateMany: vi.fn(),
      },
      channelListingDeletionOperation: {
        findFirst: vi.fn().mockResolvedValue({ id: "deletion-1" }),
      },
    };
    const repository = new ListingRegistrationPersistenceAdapter(
      {} as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

    await expect(
      repository.resolveProductRegistration(ownerTransaction(tx as never), {
        organizationId: "org-1",
        salesProductId: "draft-1",
        channelAccountId: "account-1",
        submissionKey: "submission-key-1",
        externalListingId: "427011919",
        displayName: "Kids rain boots",
      }),
    ).rejects.toThrow("active deletion operation");
    expect(tx.channelListing.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes exact option identities before enforcing uniqueness", async () => {
    const findSkus = vi.fn().mockResolvedValue([]);
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      salesProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: "draft-1" }),
      },
      masterProduct: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }),
      },
      sellpiaInventorySku: { findMany: findSkus },
    };
    const repository = new ListingRegistrationPersistenceAdapter(
      {} as never,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );

    await expect(
      repository.resolveProductRegistration(ownerTransaction(tx as never), {
        organizationId: "org-1",
        salesProductId: "draft-1",
        channelAccountId: "account-1",
        submissionKey: "submission-key-1",
        externalListingId: "427011919",
        displayName: "Kids rain boots",
        masterProductId: "00000000-0000-4000-8000-000000000001",
        optionLinks: [
          {
            externalOptionId: "OPTION-1",
            sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000002",
            quantity: 1,
          },
          {
            externalOptionId: "ＯＰＴＩＯＮ－１",
            sellpiaInventorySkuId: "00000000-0000-4000-8000-000000000002",
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findSkus).not.toHaveBeenCalled();
  });
});
