import { Prisma } from "@prisma/client";
import {
  freezeProductPreparationPayload,
  type ProductPreparationJson,
} from "@kiditem/shared/product-preparation-payload";
import type { DataMigration } from "../types";

const preparationSelect = Prisma.validator<Prisma.ProductPreparationSelect>()({
  id: true,
  organizationId: true,
  sourceCandidateId: true,
  channelAccountId: true,
  channelListingId: true,
  status: true,
  submissionKey: true,
  submissionPayloadJson: true,
  submissionPayloadHash: true,
  providerOutcome: true,
  providerSubmissionId: true,
  registrationResult: true,
  lastError: true,
  submissionLeaseToken: true,
  submissionLeaseClaimedAt: true,
  approvedByUserId: true,
  updatedAt: true,
  sourceCandidate: {
    select: { id: true, organizationId: true },
  },
  channelAccount: {
    select: { id: true, organizationId: true },
  },
  channelListing: {
    select: {
      id: true,
      organizationId: true,
      channelAccountId: true,
      sourceCandidateId: true,
      externalId: true,
      status: true,
    },
  },
  executions: {
    select: {
      id: true,
      organizationId: true,
      productPreparationId: true,
      channelAccountId: true,
      channelListingId: true,
      executionKind: true,
      expectedProviderAccountId: true,
      idempotencyKey: true,
      requestHash: true,
      submissionPayloadJson: true,
      submissionPayloadHash: true,
      status: true,
      providerOutcome: true,
      providerSubmissionId: true,
      externalListingId: true,
      resultJson: true,
      channelListing: {
        select: {
          id: true,
          organizationId: true,
          channelAccountId: true,
          sourceCandidateId: true,
          externalId: true,
        },
      },
    },
  },
});

type PreparationRow = Prisma.ProductPreparationGetPayload<{
  select: typeof preparationSelect;
}>;

type ExecutionCreateRow = Prisma.ProductRegistrationExecutionCreateManyInput;

type MigrationCounts = {
  scannedPreparationCount: number;
  existingExecutionCount: number;
  registeredSourceCount: number;
  submittingSourceCount: number;
  failedSourceCount: number;
  draftSkippedCount: number;
  cancelledSkippedCount: number;
  createdSucceededCount: number;
  createdReconcilingSucceededCount: number;
  createdFailedNotAttemptedCount: number;
  createdReconcilingUncertainCount: number;
  deletionOperationCreatedCount: 0;
};

export const backfillMarketplaceOperationLedgers: DataMigration = {
  id: "v0.1.25:006_backfill_marketplace_operation_ledgers",
  releaseVersion: "0.1.25",
  name: "Backfill authoritative marketplace registration operation ledgers",
  phase: "post-schema",
  async run(tx) {
    const preparations = await tx.productPreparation.findMany({
      where: {
        isDeleted: false,
        status: {
          in: ["draft", "submitting", "registered", "failed", "cancelled"],
        },
      },
      select: preparationSelect,
      orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    const counts: MigrationCounts = {
      scannedPreparationCount: preparations.length,
      existingExecutionCount: 0,
      registeredSourceCount: 0,
      submittingSourceCount: 0,
      failedSourceCount: 0,
      draftSkippedCount: 0,
      cancelledSkippedCount: 0,
      createdSucceededCount: 0,
      createdReconcilingSucceededCount: 0,
      createdFailedNotAttemptedCount: 0,
      createdReconcilingUncertainCount: 0,
      deletionOperationCreatedCount: 0,
    };
    const creates: ExecutionCreateRow[] = [];

    // Validate the complete candidate set before the first write. The enclosing
    // data-migration transaction then makes any concurrent uniqueness conflict
    // roll the whole migration back instead of partially importing rows.
    for (const preparation of preparations) {
      assertScopedPreparation(preparation);
      if (preparation.executions.length > 1) {
        throw new Error(
          `Preparation ${preparation.id} has multiple registration executions`,
        );
      }
      const existing = preparation.executions[0];
      if (existing) {
        verifyExistingExecution(preparation, existing);
        counts.existingExecutionCount += 1;
        continue;
      }

      if (preparation.status === "draft") {
        counts.draftSkippedCount += 1;
        continue;
      }
      if (preparation.status === "cancelled") {
        counts.cancelledSkippedCount += 1;
        continue;
      }

      const frozen = requireFrozenPayload(preparation);
      if (preparation.status === "registered") {
        counts.registeredSourceCount += 1;
        creates.push(registeredExecution(preparation, frozen));
        counts.createdSucceededCount += 1;
        continue;
      }

      if (preparation.status === "submitting") {
        counts.submittingSourceCount += 1;
      } else if (preparation.status === "failed") {
        counts.failedSourceCount += 1;
      } else {
        throw new Error(
          `Preparation ${preparation.id} has unsupported legacy status ${preparation.status}`,
        );
      }

      const imported = inFlightExecution(preparation, frozen);
      creates.push(imported.row);
      counts[imported.countKey] += 1;
    }

    if (creates.length === 0) {
      return { affectedRows: 0, details: counts };
    }
    const created = await tx.productRegistrationExecution.createMany({
      data: creates,
    });
    if (created.count !== creates.length) {
      throw new Error(
        `Expected to backfill ${creates.length} registration executions, created ${created.count}`,
      );
    }
    return { affectedRows: created.count, details: counts };
  },
};

function assertScopedPreparation(preparation: PreparationRow): void {
  if (
    preparation.sourceCandidate.id !== preparation.sourceCandidateId ||
    preparation.sourceCandidate.organizationId !== preparation.organizationId
  ) {
    throw new Error(
      `Preparation ${preparation.id} source candidate is outside its organization scope`,
    );
  }
  if (
    preparation.channelAccount.id !== preparation.channelAccountId ||
    preparation.channelAccount.organizationId !== preparation.organizationId
  ) {
    throw new Error(
      `Preparation ${preparation.id} channel account is outside its organization scope`,
    );
  }
  if (preparation.channelListing) {
    assertScopedListing(preparation, preparation.channelListing);
  } else if (preparation.channelListingId !== null) {
    throw new Error(
      `Preparation ${preparation.id} is missing its scoped channel listing`,
    );
  }
}

function assertScopedListing(
  preparation: PreparationRow,
  listing: NonNullable<PreparationRow["channelListing"]>,
): void {
  if (
    listing.id !== preparation.channelListingId ||
    listing.organizationId !== preparation.organizationId ||
    listing.channelAccountId !== preparation.channelAccountId ||
    listing.sourceCandidateId !== preparation.sourceCandidateId ||
    !cleanString(listing.externalId)
  ) {
    throw new Error(
      `Preparation ${preparation.id} channel listing identity is outside its candidate/account scope`,
    );
  }
  const resultExternalListingId = legacyExternalListingId(
    preparation.registrationResult,
  );
  if (
    resultExternalListingId &&
    resultExternalListingId !== listing.externalId
  ) {
    throw new Error(
      `Preparation ${preparation.id} external listing identity conflicts with its listing`,
    );
  }
}

function requireFrozenPayload(
  preparation: PreparationRow,
): ReturnType<typeof freezeProductPreparationPayload> {
  if (
    preparation.submissionPayloadJson === null ||
    !cleanString(preparation.submissionPayloadHash)
  ) {
    throw new Error(
      `Preparation ${preparation.id} is missing frozen submission payload evidence`,
    );
  }
  const frozen = freezeProductPreparationPayload(
    preparation.submissionPayloadJson as ProductPreparationJson,
  );
  if (frozen.hash !== preparation.submissionPayloadHash) {
    throw new Error(
      `Preparation ${preparation.id} payload hash does not match its JSON`,
    );
  }
  if (
    !frozen.payload ||
    typeof frozen.payload !== "object" ||
    Array.isArray(frozen.payload) ||
    cleanString(frozen.payload.channelAccountId) !==
      preparation.channelAccountId
  ) {
    throw new Error(
      `Preparation ${preparation.id} frozen payload does not prove its channel account`,
    );
  }
  if (!cleanString(preparation.submissionKey)) {
    throw new Error(
      `Preparation ${preparation.id} is missing its idempotency key`,
    );
  }
  return frozen;
}

function registeredExecution(
  preparation: PreparationRow,
  frozen: ReturnType<typeof freezeProductPreparationPayload>,
): ExecutionCreateRow {
  const listing = preparation.channelListing;
  if (!listing || !preparation.channelListingId) {
    throw new Error(
      `Registered preparation ${preparation.id} is missing its persisted listing identity`,
    );
  }
  assertScopedListing(preparation, listing);
  return {
    organizationId: preparation.organizationId,
    productPreparationId: preparation.id,
    channelAccountId: preparation.channelAccountId,
    channelListingId: listing.id,
    executionKind: "create",
    idempotencyKey: preparation.submissionKey,
    requestHash: frozen.hash,
    submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
    submissionPayloadHash: frozen.hash,
    status: "succeeded",
    providerOutcome: "succeeded",
    providerSubmissionId:
      cleanString(preparation.providerSubmissionId) ?? listing.externalId,
    externalListingId: listing.externalId,
    resultJson:
      preparation.registrationResult === null
        ? Prisma.DbNull
        : (preparation.registrationResult as Prisma.InputJsonValue),
    requestedByUserId: preparation.approvedByUserId,
    completedAt: preparation.updatedAt,
  };
}

function inFlightExecution(
  preparation: PreparationRow,
  frozen: ReturnType<typeof freezeProductPreparationPayload>,
): {
  row: ExecutionCreateRow;
  countKey:
    | "createdReconcilingSucceededCount"
    | "createdFailedNotAttemptedCount"
    | "createdReconcilingUncertainCount";
} {
  const resultExternalListingId = legacyExternalListingId(
    preparation.registrationResult,
  );
  const hasProviderSuccessEvidence =
    preparation.providerOutcome === "succeeded" ||
    cleanString(preparation.providerSubmissionId) !== null ||
    preparation.registrationResult !== null;
  const isDefinitivePreProviderFailure =
    !hasProviderSuccessEvidence &&
    preparation.providerOutcome === "definitive_failure";

  const lifecycle = hasProviderSuccessEvidence
    ? {
        status: "reconciling",
        providerOutcome: "succeeded",
        countKey: "createdReconcilingSucceededCount" as const,
      }
    : isDefinitivePreProviderFailure
      ? {
          status: "failed",
          providerOutcome: "not_attempted",
          countKey: "createdFailedNotAttemptedCount" as const,
        }
      : {
          status: "reconciling",
          providerOutcome: "uncertain",
          countKey: "createdReconcilingUncertainCount" as const,
        };

  return {
    countKey: lifecycle.countKey,
    row: {
      organizationId: preparation.organizationId,
      productPreparationId: preparation.id,
      channelAccountId: preparation.channelAccountId,
      executionKind: "create",
      idempotencyKey: preparation.submissionKey,
      requestHash: frozen.hash,
      submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      status: lifecycle.status,
      providerOutcome: lifecycle.providerOutcome,
      providerSubmissionId: cleanString(preparation.providerSubmissionId),
      externalListingId: resultExternalListingId,
      resultJson:
        preparation.registrationResult === null
          ? Prisma.DbNull
          : (preparation.registrationResult as Prisma.InputJsonValue),
      lastErrorMessage: cleanString(preparation.lastError),
      leaseToken: preparation.submissionLeaseToken,
      leaseClaimedAt: preparation.submissionLeaseClaimedAt,
      requestedByUserId: preparation.approvedByUserId,
      startedAt: preparation.submissionLeaseClaimedAt,
    },
  };
}

function verifyExistingExecution(
  preparation: PreparationRow,
  execution: PreparationRow["executions"][number],
): void {
  if (
    execution.organizationId !== preparation.organizationId ||
    execution.productPreparationId !== preparation.id ||
    execution.channelAccountId !== preparation.channelAccountId
  ) {
    throw new Error(
      `Existing execution ${execution.id} is outside its preparation/account scope`,
    );
  }
  if (!["create", "external_wing"].includes(execution.executionKind)) {
    throw new Error(
      `Existing execution ${execution.id} has an unsupported kind`,
    );
  }
  if (
    execution.executionKind === "external_wing" &&
    !cleanString(execution.expectedProviderAccountId)
  ) {
    throw new Error(
      `Existing external WING execution ${execution.id} is missing its frozen provider account`,
    );
  }
  const expectedIdempotencyKey =
    cleanString(preparation.submissionKey) ??
    `legacy-registered:${preparation.id}`;
  if (execution.idempotencyKey !== expectedIdempotencyKey) {
    throw new Error(
      `Existing execution ${execution.id} idempotency key drifted`,
    );
  }

  const hasPreparationPayload = preparation.submissionPayloadJson !== null;
  const hasPreparationHash = cleanString(preparation.submissionPayloadHash) !== null;
  if (hasPreparationPayload !== hasPreparationHash) {
    throw new Error(
      `Preparation ${preparation.id} has incomplete compatibility payload evidence`,
    );
  }
  const preparationFrozen = hasPreparationPayload
    ? requireFrozenPayload(preparation)
    : null;

  if (execution.submissionPayloadJson !== null) {
    const frozen = freezeProductPreparationPayload(
      execution.submissionPayloadJson as ProductPreparationJson,
    );
    if (
      frozen.hash !== execution.submissionPayloadHash ||
      frozen.hash !== execution.requestHash
    ) {
      throw new Error(
        `Existing execution ${execution.id} payload hash drifted`,
      );
    }
    if (preparationFrozen && frozen.hash !== preparationFrozen.hash) {
      throw new Error(
        `Existing execution ${execution.id} compatibility payload drifted`,
      );
    }
    if (
      !frozen.payload ||
      typeof frozen.payload !== "object" ||
      Array.isArray(frozen.payload) ||
      cleanString(frozen.payload.channelAccountId) !==
        preparation.channelAccountId
    ) {
      throw new Error(
        `Existing execution ${execution.id} payload does not prove its channel account`,
      );
    }
  } else {
    if (preparationFrozen) {
      throw new Error(
        `Existing execution ${execution.id} omitted frozen compatibility payload evidence`,
      );
    }
    const listing = execution.channelListing;
    if (
      preparation.status !== "registered" ||
      execution.status !== "succeeded" ||
      execution.providerOutcome !== "succeeded" ||
      !listing
    ) {
      throw new Error(
        `Existing execution ${execution.id} is missing payload evidence`,
      );
    }
    const legacyRequestHash = freezeProductPreparationPayload({
      kind: "legacy_registered_replay",
      preparationId: preparation.id,
      channelListingId: listing.id,
      channelAccountId: preparation.channelAccountId,
      externalListingId: listing.externalId,
    }).hash;
    if (
      execution.submissionPayloadHash !== null ||
      execution.requestHash !== legacyRequestHash
    ) {
      throw new Error(
        `Existing execution ${execution.id} legacy replay hash drifted`,
      );
    }
  }

  if (execution.channelListingId !== null) {
    const listing = execution.channelListing;
    if (
      !listing ||
      listing.id !== execution.channelListingId ||
      listing.organizationId !== preparation.organizationId ||
      listing.channelAccountId !== preparation.channelAccountId ||
      listing.sourceCandidateId !== preparation.sourceCandidateId ||
      execution.externalListingId !== listing.externalId
    ) {
      throw new Error(
        `Existing execution ${execution.id} listing identity drifted`,
      );
    }
  }
  if (
    execution.status === "succeeded" &&
    (execution.providerOutcome !== "succeeded" ||
      execution.channelListingId === null)
  ) {
    throw new Error(
      `Existing execution ${execution.id} has an invalid terminal success state`,
    );
  }
}

function legacyExternalListingId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return cleanString((value as Record<string, unknown>).externalListingId);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
