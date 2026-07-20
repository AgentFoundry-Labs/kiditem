import { describe, expect, it, vi } from "vitest";
import { hashProductPreparationPayload } from "@kiditem/shared/product-preparation-payload";
import { backfillMarketplaceOperationLedgers } from "../data-migrations/v0.1.25/006_backfill_marketplace_operation_ledgers";

const ORGANIZATION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

function legacyPreparation(
  status: "draft" | "submitting" | "registered" | "failed",
  overrides: Record<string, unknown> = {},
) {
  const id = `${status}-preparation`;
  const sourceCandidateId = `${status}-candidate`;
  const channelListingId = status === "registered" ? `${status}-listing` : null;
  const payload = {
    channelAccountId: ACCOUNT_ID,
    displayName: `${status} product`,
    registrationInput: { salePrice: 21900 },
  };
  const payloadHash = hashProductPreparationPayload(payload);
  return {
    id,
    organizationId: ORGANIZATION_ID,
    sourceCandidateId,
    channelAccountId: ACCOUNT_ID,
    channelListingId,
    status,
    submissionKey: `${status}-submission-key`,
    submissionPayloadJson: payload,
    submissionPayloadHash: payloadHash,
    providerOutcome: null,
    providerSubmissionId: null,
    registrationResult: null,
    lastError: null,
    submissionLeaseToken: null,
    submissionLeaseClaimedAt: null,
    approvedByUserId: null,
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    sourceCandidate: {
      id: sourceCandidateId,
      organizationId: ORGANIZATION_ID,
    },
    channelAccount: {
      id: ACCOUNT_ID,
      organizationId: ORGANIZATION_ID,
    },
    channelListing: channelListingId
      ? {
          id: channelListingId,
          organizationId: ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          sourceCandidateId,
          externalId: `${status}-external-id`,
          status: "active",
        }
      : null,
    executions: [],
    ...overrides,
  };
}

function migrationTx(
  preparations: Array<ReturnType<typeof legacyPreparation>>,
) {
  const executions: Array<Record<string, unknown>> = [];
  const findMany = vi.fn().mockImplementation(async () =>
    preparations.map((preparation) => ({
      ...preparation,
      executions: executions
        .filter(
          (execution) => execution.productPreparationId === preparation.id,
        )
        .map((execution) => ({
          ...execution,
          channelListing:
            execution.channelListingId === preparation.channelListing?.id
              ? preparation.channelListing
              : null,
        })),
    })),
  );
  const createMany = vi.fn().mockImplementation(async ({ data }) => {
    executions.push(
      ...data.map((row: Record<string, unknown>, index: number) => ({
        id: `execution-${executions.length + index + 1}`,
        ...row,
      })),
    );
    return { count: data.length };
  });
  return {
    state: { executions },
    tx: {
      productPreparation: { findMany },
      productRegistrationExecution: { createMany },
    },
  };
}

describe("marketplace operation ledger backfill", () => {
  it("uses the immutable v0.1.25 migration identity", () => {
    expect(backfillMarketplaceOperationLedgers).toMatchObject({
      id: "v0.1.25:006_backfill_marketplace_operation_ledgers",
      releaseVersion: "0.1.25",
      phase: "post-schema",
    });
  });

  it("maps a registered preparation to one terminal succeeded execution", async () => {
    const { tx, state } = migrationTx([legacyPreparation("registered")]);

    const result = await backfillMarketplaceOperationLedgers.run(tx as never);

    expect(state.executions).toEqual([
      expect.objectContaining({
        productPreparationId: "registered-preparation",
        channelListingId: "registered-listing",
        externalListingId: "registered-external-id",
        status: "succeeded",
        providerOutcome: "succeeded",
      }),
    ]);
    expect(result).toMatchObject({
      affectedRows: 1,
      details: { registeredSourceCount: 1, createdSucceededCount: 1 },
    });
  });

  it("maps legacy provider evidence without restoring create eligibility", async () => {
    const providerSucceeded = legacyPreparation("submitting", {
      providerOutcome: "succeeded",
      providerSubmissionId: "provider-submission-1",
      registrationResult: { externalListingId: "provider-external-1" },
    });
    const definitiveFailure = legacyPreparation("failed", {
      id: "definitive-failure-preparation",
      sourceCandidateId: "definitive-failure-candidate",
      providerOutcome: "definitive_failure",
      sourceCandidate: {
        id: "definitive-failure-candidate",
        organizationId: ORGANIZATION_ID,
      },
    });
    const ambiguousFailure = legacyPreparation("failed", {
      id: "ambiguous-failure-preparation",
      sourceCandidateId: "ambiguous-failure-candidate",
      sourceCandidate: {
        id: "ambiguous-failure-candidate",
        organizationId: ORGANIZATION_ID,
      },
    });
    const draft = legacyPreparation("draft");
    const { tx, state } = migrationTx([
      providerSucceeded,
      definitiveFailure,
      ambiguousFailure,
      draft,
    ]);

    const result = await backfillMarketplaceOperationLedgers.run(tx as never);

    expect(state.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productPreparationId: "submitting-preparation",
          status: "reconciling",
          providerOutcome: "succeeded",
        }),
        expect.objectContaining({
          productPreparationId: "definitive-failure-preparation",
          status: "failed",
          providerOutcome: "not_attempted",
        }),
        expect.objectContaining({
          productPreparationId: "ambiguous-failure-preparation",
          status: "reconciling",
          providerOutcome: "uncertain",
        }),
      ]),
    );
    expect(state.executions).toHaveLength(3);
    expect(result.details).toMatchObject({
      draftSkippedCount: 1,
      createdReconcilingSucceededCount: 1,
      createdFailedNotAttemptedCount: 1,
      createdReconcilingUncertainCount: 1,
      deletionOperationCreatedCount: 0,
    });
  });

  it("fails closed before mutation when frozen payload evidence drifts", async () => {
    const drifted = legacyPreparation("registered", {
      submissionPayloadHash: "drifted-hash",
    });
    const { tx, state } = migrationTx([
      legacyPreparation("registered"),
      drifted,
    ]);

    await expect(
      backfillMarketplaceOperationLedgers.run(tx as never),
    ).rejects.toThrow(/payload hash/i);
    expect(state.executions).toEqual([]);
    expect(tx.productRegistrationExecution.createMany).not.toHaveBeenCalled();
  });

  it("preserves verified existing executions and is idempotent on a second run", async () => {
    const registered = legacyPreparation("registered");
    const { tx, state } = migrationTx([registered]);

    await backfillMarketplaceOperationLedgers.run(tx as never);
    const existing = { ...state.executions[0] };
    await expect(
      backfillMarketplaceOperationLedgers.run(tx as never),
    ).resolves.toMatchObject({ affectedRows: 0 });

    expect(state.executions).toEqual([existing]);
  });

  it("rejects an existing execution when compatibility payload evidence drifted", async () => {
    const registered = legacyPreparation("registered");
    const { tx, state } = migrationTx([registered]);
    const driftedPayload = {
      channelAccountId: ACCOUNT_ID,
      displayName: "different frozen request",
      registrationInput: { salePrice: 99900 },
    };
    const driftedHash = hashProductPreparationPayload(driftedPayload);
    state.executions.push({
      id: "existing-drifted-execution",
      organizationId: ORGANIZATION_ID,
      productPreparationId: registered.id,
      channelAccountId: ACCOUNT_ID,
      channelListingId: registered.channelListingId,
      executionKind: "create",
      expectedProviderAccountId: null,
      idempotencyKey: registered.submissionKey,
      requestHash: driftedHash,
      submissionPayloadJson: driftedPayload,
      submissionPayloadHash: driftedHash,
      status: "succeeded",
      providerOutcome: "succeeded",
      providerSubmissionId: "provider-existing",
      externalListingId: registered.channelListing?.externalId,
      resultJson: null,
    });

    await expect(
      backfillMarketplaceOperationLedgers.run(tx as never),
    ).rejects.toThrow(/compatibility payload/i);
  });
});
