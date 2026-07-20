import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { freezeProductPreparationPayload } from "@kiditem/shared/product-preparation-payload";
import { backfillMarketplaceOperationLedgers } from "../../../../../scripts/data-migrations/v0.1.25/006_backfill_marketplace_operation_ledgers";
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from "../../test-helpers/real-prisma";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

describe("marketplace operation ledger migration (PG integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: "coupang",
        externalAccountId: "wing-account",
        vendorId: "A01234567",
        name: "WING test account",
        status: "active",
      },
    });
  });

  it("backfills terminal and reconciliation states without creating deletion operations", async () => {
    const registered = await seedLegacyPreparation("registered", "registered", {
      listingIsActive: false,
      providerSubmissionId: "provider-registered",
      registrationResult: { externalListingId: "external-registered" },
    });
    const submitting = await seedLegacyPreparation("submitting", "submitting", {
      providerSubmissionId: "provider-submitting",
      providerOutcome: "succeeded",
      registrationResult: { externalListingId: "external-submitting" },
    });
    const definitiveFailure = await seedLegacyPreparation(
      "failed",
      "definitive",
      {
        providerOutcome: "definitive_failure",
      },
    );
    const ambiguousFailure = await seedLegacyPreparation("failed", "ambiguous");
    await seedLegacyPreparation("draft", "draft");

    const result = await prisma.$transaction((tx) =>
      backfillMarketplaceOperationLedgers.run(tx),
    );

    expect(result).toMatchObject({
      affectedRows: 4,
      details: {
        registeredSourceCount: 1,
        submittingSourceCount: 1,
        failedSourceCount: 2,
        draftSkippedCount: 1,
        createdSucceededCount: 1,
        createdReconcilingSucceededCount: 1,
        createdFailedNotAttemptedCount: 1,
        createdReconcilingUncertainCount: 1,
        deletionOperationCreatedCount: 0,
      },
    });
    await expect(
      prisma.productRegistrationExecution.findMany({
        orderBy: { productPreparationId: "asc" },
        select: {
          productPreparationId: true,
          channelListingId: true,
          externalListingId: true,
          status: true,
          providerOutcome: true,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          productPreparationId: registered.preparationId,
          channelListingId: registered.listingId,
          externalListingId: "external-registered",
          status: "succeeded",
          providerOutcome: "succeeded",
        },
        {
          productPreparationId: submitting.preparationId,
          channelListingId: null,
          externalListingId: "external-submitting",
          status: "reconciling",
          providerOutcome: "succeeded",
        },
        expect.objectContaining({
          productPreparationId: definitiveFailure.preparationId,
          status: "failed",
          providerOutcome: "not_attempted",
        }),
        expect.objectContaining({
          productPreparationId: ambiguousFailure.preparationId,
          status: "reconciling",
          providerOutcome: "uncertain",
        }),
      ]),
    );
    expect(await prisma.channelListingDeletionOperation.count()).toBe(0);
  });

  it("preserves a verified execution and affects zero rows on a second run", async () => {
    const existingPreparation = await seedLegacyPreparation(
      "submitting",
      "existing",
    );
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: existingPreparation.preparationId,
        channelAccountId: ACCOUNT_ID,
        idempotencyKey: existingPreparation.submissionKey,
        requestHash: existingPreparation.payloadHash,
        submissionPayloadJson: existingPreparation.payload,
        submissionPayloadHash: existingPreparation.payloadHash,
        status: "reconciling",
        providerOutcome: "uncertain",
        requestedByUserId: TEST_USER_ID,
      },
    });
    await seedLegacyPreparation("registered", "new");

    await prisma.$transaction((tx) =>
      backfillMarketplaceOperationLedgers.run(tx),
    );
    const snapshot = await prisma.productRegistrationExecution.findMany({
      orderBy: { productPreparationId: "asc" },
    });
    const second = await prisma.$transaction((tx) =>
      backfillMarketplaceOperationLedgers.run(tx),
    );

    expect(second).toMatchObject({
      affectedRows: 0,
      details: { existingExecutionCount: 2 },
    });
    expect(
      await prisma.productRegistrationExecution.findMany({
        orderBy: { productPreparationId: "asc" },
      }),
    ).toEqual(snapshot);
  });

  it("aborts atomically when a registered listing belongs to another candidate", async () => {
    await seedLegacyPreparation("registered", "safe");
    const unsafe = await seedLegacyPreparation("registered", "unsafe");
    const other = await seedCandidateWorkspace("other-listing-owner");
    const otherListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceCandidateId: other.candidateId,
        externalId: "external-other-owner",
        displayName: "Other listing owner",
        status: "active",
      },
    });
    await prisma.productPreparation.update({
      where: { id: unsafe.preparationId },
      data: { channelListingId: otherListing.id },
    });

    await expect(
      prisma.$transaction((tx) => backfillMarketplaceOperationLedgers.run(tx)),
    ).rejects.toThrow(/candidate\/account scope/i);
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  it("aborts atomically when a frozen payload hash has drifted", async () => {
    await seedLegacyPreparation("registered", "safe");
    const drifted = await seedLegacyPreparation("failed", "drifted");
    await prisma.productPreparation.update({
      where: { id: drifted.preparationId },
      data: { submissionPayloadHash: "not-the-canonical-hash" },
    });

    await expect(
      prisma.$transaction((tx) => backfillMarketplaceOperationLedgers.run(tx)),
    ).rejects.toThrow(/payload hash/i);
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  async function seedLegacyPreparation(
    status: "draft" | "submitting" | "registered" | "failed",
    suffix: string,
    options: {
      providerOutcome?: string | null;
      providerSubmissionId?: string | null;
      registrationResult?: Prisma.InputJsonValue | null;
      listingIsActive?: boolean;
    } = {},
  ) {
    const { candidateId, workspaceId } = await seedCandidateWorkspace(suffix);
    const payload = freezeProductPreparationPayload({
      channelAccountId: ACCOUNT_ID,
      displayName: `Product ${suffix}`,
      registrationInput: { salePrice: 21900, suffix },
    });
    const listing =
      status === "registered"
        ? await prisma.channelListing.create({
            data: {
              organizationId: TEST_ORGANIZATION_ID,
              channelAccountId: ACCOUNT_ID,
              sourceCandidateId: candidateId,
              externalId: `external-${suffix}`,
              displayName: `Product ${suffix}`,
              status: "active",
              isActive: options.listingIsActive ?? true,
            },
          })
        : null;
    const preparation = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: workspaceId,
        channelListingId: listing?.id ?? null,
        displayName: `Product ${suffix}`,
        status,
        registrationInput: { salePrice: 21900, suffix },
        submissionKey: `submission-${suffix}`,
        submissionPayloadJson: payload.payload,
        submissionPayloadHash: payload.hash,
        providerOutcome: options.providerOutcome ?? null,
        providerSubmissionId: options.providerSubmissionId ?? null,
        registrationResult: options.registrationResult ?? undefined,
        approvedAt: new Date("2026-07-20T00:00:00.000Z"),
        approvedByUserId: TEST_USER_ID,
        createdByUserId: TEST_USER_ID,
      },
    });
    return {
      preparationId: preparation.id,
      listingId: listing?.id ?? null,
      submissionKey: preparation.submissionKey,
      payload: payload.payload as Prisma.InputJsonValue,
      payloadHash: payload.hash,
    };
  }

  async function seedCandidateWorkspace(suffix: string) {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${suffix}`,
        sourcePlatform: "ALIBABA_1688",
        rawData: {},
        name: `Product ${suffix}`,
        status: "sourced",
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: "sourcing_candidate",
        sourceCandidateId: candidate.id,
        displayName: `Product ${suffix}`,
        normalizedTitle: `product ${suffix}`,
        createdByUserId: TEST_USER_ID,
      },
    });
    return { candidateId: candidate.id, workspaceId: workspace.id };
  }
});
