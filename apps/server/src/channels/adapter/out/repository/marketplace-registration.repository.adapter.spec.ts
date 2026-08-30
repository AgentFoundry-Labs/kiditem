import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceRegistrationRepositoryAdapter } from "./marketplace-registration.repository.adapter";

describe("MarketplaceRegistrationRepositoryAdapter preparation registration", () => {
  it("rejects a non-invocation owner key before claiming a provider write", async () => {
    const $transaction = vi.fn().mockResolvedValue(undefined);
    const repository = new MarketplaceRegistrationRepositoryAdapter({
      $transaction,
    } as never);

    await expect(
      repository.claimProviderWrite({
        organizationId: "org-1",
        executionId: "execution-1",
        preparationId: "preparation-1",
        channelAccountId: "account-1",
        sourceCandidateId: "candidate-1",
        idempotencyKey: "submission-1",
        requestHash: "a".repeat(64),
        ownerIdempotencyKey: "not-a-canonical-sha256-key",
      }),
    ).rejects.toThrow(
      "Provider write requires an invocation owner idempotency key.",
    );
    expect($transaction).not.toHaveBeenCalled();
  });

  it("accepts the opaque CapabilityInvocation owner key before claiming a provider write", async () => {
    const $transaction = vi.fn().mockResolvedValue({ mode: "created" });
    const repository = new MarketplaceRegistrationRepositoryAdapter({
      $transaction,
    } as never);

    await expect(
      repository.claimProviderWrite({
        organizationId: "org-1",
        executionId: "execution-1",
        preparationId: "preparation-1",
        channelAccountId: "account-1",
        sourceCandidateId: "candidate-1",
        idempotencyKey: "submission-1",
        requestHash: "a".repeat(64),
        ownerIdempotencyKey:
          "capability-invocation:00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toEqual({ mode: "created" });
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("finds an active account-scoped listing by its synced seller SKU", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        externalId: "427011919",
        displayName: "꿀사과슬랑이",
        status: "APPROVED",
      },
    ]);
    const repository = new MarketplaceRegistrationRepositoryAdapter({
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
    const repository = new MarketplaceRegistrationRepositoryAdapter({
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
    ).rejects.toThrow("multiple active channel listings");
  });

  it("preflights tenant-owned active product and inventory SKU identities", async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }),
      },
      sellpiaInventorySku: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(
      prisma as never,
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
      "Every KidItem-first inventory SKU must be active and belong to the organization.",
    );
    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000010",
        isActive: true,
      },
      select: { id: true },
    });
  });

  it("reactivates the account identity and attaches an immutable source candidate without a Master", async () => {
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListingDeletionOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: "candidate-1" }),
      },
      channelListing: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "listing-1",
            sourceCandidateId: null,
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "inactive",
          })
          .mockResolvedValueOnce({
            id: "listing-1",
            sourceCandidateId: null,
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "inactive",
            masterProductId: null,
          })
          .mockResolvedValueOnce({
            id: "listing-1",
            channelAccountId: "account-1",
            channelAccount: { channel: "coupang" },
            externalId: "427011919",
            status: "active",
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(
      {} as never,
    );

    await expect(
      repository.resolveProductRegistration(tx, {
        organizationId: "org-1",
        sourceCandidateId: "candidate-1",
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
        OR: [{ sourceCandidateId: null }, { sourceCandidateId: "candidate-1" }],
      },
      data: {
        sourceCandidateId: "candidate-1",
        displayName: "Kids rain boots",
        status: "active",
        isActive: true,
      },
    });
  });

  it("rejects reassignment of a listing already sourced from another candidate", async () => {
    const tx = {
      channelAccount: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "account-1", channel: "coupang" }),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: "candidate-1" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListingDeletionOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: "listing-1",
          sourceCandidateId: "other-candidate",
        }),
        updateMany: vi.fn(),
      },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(
      {} as never,
    );

    await expect(
      repository.resolveProductRegistration(tx, {
        organizationId: "org-1",
        sourceCandidateId: "candidate-1",
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
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: "candidate-1" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "listing-1" }]),
      channelListing: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "listing-1" })
          .mockResolvedValueOnce({
            id: "listing-1",
            sourceCandidateId: null,
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
    const repository = new MarketplaceRegistrationRepositoryAdapter(
      {} as never,
    );

    await expect(
      repository.resolveProductRegistration(tx, {
        organizationId: "org-1",
        sourceCandidateId: "candidate-1",
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
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: "candidate-1" }),
      },
      masterProduct: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }),
      },
      sellpiaInventorySku: { findMany: findSkus },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(
      {} as never,
    );

    await expect(
      repository.resolveProductRegistration(tx, {
        organizationId: "org-1",
        sourceCandidateId: "candidate-1",
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
