import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
} from "../../test-helpers/real-prisma";
import { ChannelListingRepositoryAdapter } from "../adapter/out/repository/channel-listing.repository.adapter";
import { MarketplaceRegistrationRepositoryAdapter } from "../adapter/out/repository/marketplace-registration.repository.adapter";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

describe("ChannelListingDeletionOperation (PG integration)", () => {
  let prisma: PrismaClient;
  let repository: ChannelListingRepositoryAdapter;
  let listingId: string;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelListingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });
  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT,
        organizationId: TEST_ORGANIZATION_ID,
        channel: "coupang",
        name: "Wing",
        status: "active",
        vendorId: "A00012345",
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://example.test/${randomUUID()}`,
        sourcePlatform: "ALIBABA_1688",
        rawData: {},
        name: "Test product",
        status: "sourced",
      },
    });
    candidateId = candidate.id;
    listingId = (
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT,
          sourceCandidateId: candidate.id,
          externalId: "16311428128",
          displayName: "Test product",
          status: "active",
          isActive: true,
        },
      })
    ).id;
  });

  it("serializes concurrent same-key authorization into one executing/uncertain operation", async () => {
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
    };
    const [left, right] = await Promise.all([
      repository.authorizeDeletion(input),
      repository.authorizeDeletion(input),
    ]);

    expect(left.operationId).toBe(right.operationId);
    expect(left).toMatchObject({
      status: "executing",
      providerOutcome: "uncertain",
      expectedVendorId: "A00012345",
    });
    await expect(
      prisma.channelListingDeletionOperation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(1);
  });

  it("fences Coupang provider creation with the Channels-owned execution receipt", async () => {
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: "sourcing_candidate",
        sourceCandidateId: candidateId,
        displayName: "Provider receipt workspace",
        normalizedTitle: `providerreceipt${randomUUID().replaceAll("-", "")}`,
      },
    });
    const preparation = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT,
        sourceContentWorkspaceId: workspace.id,
        displayName: "Provider receipt product",
        submissionKey: randomUUID(),
        registrationInput: {},
      },
    });
    const execution = await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: preparation.id,
        channelAccountId: ACCOUNT,
        idempotencyKey: preparation.submissionKey,
        requestHash: "a".repeat(64),
        status: "prepared",
        providerOutcome: "not_attempted",
      },
    });
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      preparationId: preparation.id,
      channelAccountId: ACCOUNT,
      sourceCandidateId: candidateId,
      idempotencyKey: preparation.submissionKey,
      requestHash: "a".repeat(64),
      ownerIdempotencyKey: "1".repeat(64),
    };

    const claims = await Promise.all([
      registration.claimProviderWrite(input),
      registration.claimProviderWrite(input),
    ]);

    expect(claims.map((claim) => claim.mode).sort()).toEqual([
      "create",
      "reconcile",
    ]);
    const create = claims.find((claim) => claim.mode === "create");
    if (!create || create.mode !== "create")
      throw new Error("missing provider creator");
    await registration.finalizeProviderWrite({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: execution.id,
      leaseToken: create.leaseToken,
      providerSubmissionId: "provider-submission",
      externalListingId: "provider-listing",
      result: { externalListingId: "provider-listing" },
    });

    await expect(registration.claimProviderWrite(input)).resolves.toMatchObject(
      {
        mode: "replay",
        providerSubmissionId: "provider-submission",
        externalListingId: "provider-listing",
      },
    );
    await expect(
      registration.claimProviderWrite({
        ...input,
        ownerIdempotencyKey: "2".repeat(64),
      }),
    ).rejects.toThrow("owner idempotency key conflicted");
  });

  it("atomically records a Channels owner receipt with listing resolution, replays it, and rejects drift", async () => {
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const ownerIdempotencyKey = "3".repeat(64);
    const externalListingId = "16311428128";
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      channelAccountId: ACCOUNT,
      submissionKey: randomUUID(),
      externalListingId,
      displayName: "Receipt-resolved listing",
      ownerCapabilityKey: "channels.register_confirmed_listing" as const,
      ownerIdempotencyKey,
      ownerRequestHash: "a".repeat(64),
    };

    const [left, right] = await Promise.all([
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, input),
      ),
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, input),
      ),
    ]);

    expect(right).toEqual(left);
    await expect(
      prisma.channelListing.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT,
          externalId: externalListingId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.channelRegistrationOwnerIdempotencyReceipt.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          capabilityKey: input.ownerCapabilityKey,
          ownerIdempotencyKey,
        },
      }),
    ).resolves.toBe(1);
    const receipt = await prisma.channelRegistrationOwnerIdempotencyReceipt.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: input.ownerCapabilityKey,
        ownerIdempotencyKey,
      },
      select: { requestHash: true, resultJson: true },
    });
    expect(receipt).toEqual({
      requestHash: input.ownerRequestHash,
      resultJson: left,
    });
    expect(Object.keys(receipt.resultJson as Record<string, unknown>).sort()).toEqual([
      'channel',
      'channelAccountId',
      'externalId',
      'listingId',
      'status',
    ]);
    await expect(
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, input),
      ),
    ).resolves.toEqual(left);
    await expect(
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, {
          ...input,
          externalListingId: `changed-${randomUUID()}`,
          ownerRequestHash: "b".repeat(64),
        }),
      ),
    ).rejects.toThrow("owner idempotency key conflicted");
    await expect(
      prisma.channelListing.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT,
        },
      }),
    ).resolves.toBe(1);
  });

  it("scopes an identical Channels owner key and hash to its organization receipt", async () => {
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const ownerIdempotencyKey = "4".repeat(64);
    const ownerRequestHash = "a".repeat(64);
    const ours = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      channelAccountId: ACCOUNT,
      submissionKey: randomUUID(),
      externalListingId: "16311428128",
      displayName: "Scoped receipt listing",
      ownerCapabilityKey: "channels.register_confirmed_listing" as const,
      ownerIdempotencyKey,
      ownerRequestHash,
    };
    const otherAccount = "22222222-2222-4222-8222-222222222222";
    await prisma.channelAccount.create({
      data: {
        id: otherAccount,
        organizationId: OTHER_ORGANIZATION_ID,
        channel: "coupang",
        name: "Other Wing",
        status: "active",
        vendorId: "A00099999",
      },
    });
    const otherCandidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sourceUrl: `https://example.test/${randomUUID()}`,
        sourcePlatform: "ALIBABA_1688",
        rawData: {},
        name: "Other product",
        status: "sourced",
      },
    });
    const other = {
      ...ours,
      organizationId: OTHER_ORGANIZATION_ID,
      sourceCandidateId: otherCandidate.id,
      channelAccountId: otherAccount,
      externalListingId: `other-${randomUUID()}`,
    };

    const oursResult = await prisma.$transaction((tx) =>
      registration.resolveProductRegistrationWithOwnerReceipt(tx, ours),
    );
    const otherResult = await prisma.$transaction((tx) =>
      registration.resolveProductRegistrationWithOwnerReceipt(tx, other),
    );

    expect(otherResult.listingId).not.toBe(oursResult.listingId);
    await expect(
      prisma.channelRegistrationOwnerIdempotencyReceipt.count({
        where: { ownerIdempotencyKey, requestHash: ownerRequestHash },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.channelRegistrationOwnerIdempotencyReceipt.count({
        where: { organizationId: TEST_ORGANIZATION_ID, ownerIdempotencyKey },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.channelRegistrationOwnerIdempotencyReceipt.count({
        where: { organizationId: OTHER_ORGANIZATION_ID, ownerIdempotencyKey },
      }),
    ).resolves.toBe(1);
  });

  it("requires canonical SHA-256 owner receipt identifiers before listing resolution", async () => {
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      channelAccountId: ACCOUNT,
      submissionKey: randomUUID(),
      externalListingId: "16311428128",
      displayName: "Canonical receipt listing",
      ownerCapabilityKey: "channels.register_confirmed_listing" as const,
      ownerIdempotencyKey: "5".repeat(64),
      ownerRequestHash: "a".repeat(64),
    };

    await expect(
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, {
          ...input,
          ownerIdempotencyKey: "not-a-canonical-sha256-key",
        }),
      ),
    ).rejects.toThrow("Channels registration owner receipt is invalid");
    await expect(
      prisma.$transaction((tx) =>
        registration.resolveProductRegistrationWithOwnerReceipt(tx, {
          ...input,
          ownerRequestHash: "A".repeat(64),
        }),
      ),
    ).rejects.toThrow("Channels registration owner receipt is invalid");
    await expect(
      prisma.channelRegistrationOwnerIdempotencyReceipt.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.channelListing.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rejects idempotency hash drift and another actor before any extension claim", async () => {
    const idempotencyKey = randomUUID();
    const operation = await repository.authorizeDeletion({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      idempotencyKey,
      requestHash: "a".repeat(64),
    });
    await expect(
      repository.authorizeDeletion({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId,
        idempotencyKey,
        requestHash: "b".repeat(64),
      }),
    ).rejects.toThrow("different request");
    await expect(
      repository.claimDeletionExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: OTHER_USER_ID,
        listingId,
        operationId: operation.operationId,
      }),
    ).rejects.toThrow("another actor");
  });

  it("issues a one-time expiring pre-mutation claim without treating it as provider proof", async () => {
    const operation = await startOperation();
    const claim = await repository.claimDeletionExecution({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.operationId,
    });
    expect(claim).toMatchObject({
      operationId: operation.operationId,
      externalId: "16311428128",
      expectedVendorId: "A00012345",
    });
    await expect(
      repository.claimDeletionExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId,
        operationId: operation.operationId,
      }),
    ).rejects.toThrow("unavailable or expired");
    await expect(
      prisma.channelListing.findUniqueOrThrow({ where: { id: listingId } }),
    ).resolves.toMatchObject({ isActive: true });
  });

  it("blocks deletion start while an active registration owns the same locked listing", async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: "sourcing_candidate",
        sourceCandidateId: candidateId,
        displayName: "Test workspace",
        normalizedTitle: `test-${randomUUID()}`,
      },
    });
    const preparation = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT,
        sourceContentWorkspaceId: workspace.id,
        channelListingId: listingId,
        displayName: "Test product",
        submissionKey: randomUUID(),
        registrationInput: {},
      },
    });
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: preparation.id,
        channelAccountId: ACCOUNT,
        channelListingId: listingId,
        idempotencyKey: randomUUID(),
        requestHash: "c".repeat(64),
        status: "executing",
        providerOutcome: "uncertain",
        requestedByUserId: TEST_USER_ID,
      },
    });

    await expect(startOperation()).rejects.toThrow(
      "Marketplace registration is active",
    );
    await expect(
      prisma.channelListingDeletionOperation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(0);
  });

  it("serializes registration finalization versus deletion start on the same listing lock", async () => {
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const deletionStart = startOperation();
    const registrationFinalize = prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT,
        submissionKey: randomUUID(),
        externalListingId: "16311428128",
        displayName: "Attempted reactivation",
      }),
    );

    const outcomes = await Promise.allSettled([
      deletionStart,
      registrationFinalize,
    ]);
    expect(outcomes[0].status).toBe("fulfilled");
    // Either registration wins then deletion starts, or deletion wins and
    // registration rejects its active-operation fence. Neither path deactivates.
    await expect(
      prisma.channelListing.findUniqueOrThrow({ where: { id: listingId } }),
    ).resolves.toMatchObject({ isActive: true });
    await expect(
      prisma.channelListingDeletionOperation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(1);
  });

  it("scopes claims to exact organization, listing, and account identities", async () => {
    const operation = await startOperation();
    const otherAccount = "22222222-2222-4222-8222-222222222222";
    await prisma.channelAccount.create({
      data: {
        id: otherAccount,
        organizationId: TEST_ORGANIZATION_ID,
        channel: "coupang",
        name: "Other Wing",
        status: "active",
        vendorId: "A00099999",
      },
    });
    const otherListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: otherAccount,
        sourceCandidateId: candidateId,
        externalId: "16311428129",
        isActive: true,
      },
    });
    await expect(
      repository.claimDeletionExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId: otherListing.id,
        operationId: operation.operationId,
      }),
    ).rejects.toThrow("Deletion operation not found");
    await expect(
      repository.claimDeletionExecution({
        organizationId: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
        userId: OTHER_USER_ID,
        listingId,
        operationId: operation.operationId,
      }),
    ).rejects.toThrow("등록 상품을 찾을 수 없습니다");
  });

  it("refuses an actually expired claim before any browser action can be authorized", async () => {
    const operation = await startOperation();
    await prisma.channelListingDeletionOperation.update({
      where: { id: operation.operationId },
      data: { authorizationExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      repository.claimDeletionExecution({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId,
        operationId: operation.operationId,
      }),
    ).rejects.toThrow("unavailable or expired");
  });

  it("marks an unknown browser result reconciling while preserving the active listing", async () => {
    const operation = await startOperation();
    await expect(
      repository.markDeletionUnresolved({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId,
        operationId: operation.operationId,
        reason: "extension_timeout",
      }),
    ).resolves.toMatchObject({
      status: "reconciling",
      providerOutcome: "uncertain",
    });
    await expect(
      prisma.channelListing.findUniqueOrThrow({ where: { id: listingId } }),
    ).resolves.toMatchObject({ isActive: true });
  });

  it("atomically completes the operation and deactivates the listing after provider verification", async () => {
    const operation = await startOperation();
    await repository.markDeletionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.operationId,
      reason: "provider_observed",
    });

    await expect(
      repository.completeDeletion({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        listingId,
        operationId: operation.operationId,
        verifiedProviderAccountId: "A00012345",
        verifiedExternalListingId: "16311428128",
      }),
    ).resolves.toEqual({
      operationId: operation.operationId,
      status: "succeeded",
      providerOutcome: "succeeded",
    });
    await expect(
      prisma.channelListing.findUniqueOrThrow({ where: { id: listingId } }),
    ).resolves.toMatchObject({ isActive: false, status: "deleted" });
    await expect(
      prisma.channelListingDeletionOperation.findUniqueOrThrow({
        where: { id: operation.operationId },
      }),
    ).resolves.toMatchObject({
      status: "succeeded",
      providerOutcome: "succeeded",
    });
  });

  it("resumes an active reconciliation after the browser dialog is reopened with a new key", async () => {
    const operation = await startOperation();
    await repository.claimDeletionExecution({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.operationId,
    });
    await repository.markDeletionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.operationId,
      reason: "provider_observed",
    });

    const resumed = await repository.authorizeDeletion({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      idempotencyKey: randomUUID(),
      requestHash: "b".repeat(64),
    });

    expect(resumed).toMatchObject({
      operationId: operation.operationId,
      status: "reconciling",
      providerOutcome: "uncertain",
      extensionClaimed: true,
    });
  });

  async function startOperation() {
    return repository.authorizeDeletion({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      idempotencyKey: randomUUID(),
      requestHash: "b".repeat(64),
    });
  }
});
