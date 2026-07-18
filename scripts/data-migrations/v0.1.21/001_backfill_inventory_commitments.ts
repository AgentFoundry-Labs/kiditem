import { randomUUID } from "node:crypto";
import type { DataMigration } from "../types";

const ROCKET_REQUEST_KIND = "rocket_request";

type LegacyLine = {
  id: string;
  organizationId: string;
  confirmationId: string;
  poNumber: string;
  productNo: string;
  confirmedQuantity: number;
  confirmation: {
    channelAccountId: string;
    freshnessGeneration: bigint | null;
    status: string;
    confirmedBy: string;
    confirmedAt: Date;
    releasedBy: string | null;
    releasedAt: Date | null;
    releaseReason: string | null;
  };
  allocations: Array<{
    sellpiaInventorySkuId: string;
    unitsPerVariant: number;
    quantity: number;
  }>;
};

type CommitmentCandidate = {
  id: string;
  organizationId: string;
  kind: typeof ROCKET_REQUEST_KIND;
  sourceId: string;
  businessKey: string;
  unitQuantity: number;
  status: "active" | "released";
  inventoryGeneration: bigint | null;
  predecessorCommitmentId: null;
  createdBy: string;
  releasedBy: string | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  settledBy: null;
  settledAt: null;
  settlementReason: null;
  createdAt: Date;
};

type PersistedCommitment = Omit<CommitmentCandidate, "id"> & { id: string };

type AllocationCandidate = {
  organizationId: string;
  commitmentId: string;
  sellpiaInventorySkuId: string;
  unitsPerItem: number;
  quantity: number;
};

function canonicalRocketBusinessKey(line: LegacyLine): string {
  return [
    "coupang-rocket",
    line.confirmation.channelAccountId,
    line.poNumber.trim(),
    line.productNo.trim(),
  ].join(":");
}

function commitmentSourceKey(
  value: Pick<CommitmentCandidate, "organizationId" | "kind" | "sourceId">,
): string {
  return `${value.organizationId}\u0000${value.kind}\u0000${value.sourceId}`;
}

function activeBusinessKey(
  value: Pick<CommitmentCandidate, "organizationId" | "businessKey">,
): string {
  return `${value.organizationId}\u0000${value.businessKey}`;
}

function allocationKey(
  value: Pick<AllocationCandidate, "commitmentId" | "sellpiaInventorySkuId">,
): string {
  return `${value.commitmentId}\u0000${value.sellpiaInventorySkuId}`;
}

function nullableValueEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function assertCommitmentMatches(
  existing: PersistedCommitment,
  expected: CommitmentCandidate,
): void {
  const fields = [
    "businessKey",
    "unitQuantity",
    "status",
    "inventoryGeneration",
    "predecessorCommitmentId",
    "createdBy",
    "releasedBy",
    "releasedAt",
    "releaseReason",
    "settledBy",
    "settledAt",
    "settlementReason",
  ] as const;

  for (const field of fields) {
    if (!nullableValueEqual(existing[field], expected[field])) {
      throw new Error(
        `Existing inventory commitment differs for source ${expected.sourceId}: ${field}`,
      );
    }
  }
}

function assertAllocationMatches(
  existing: AllocationCandidate,
  expected: AllocationCandidate,
): void {
  for (const field of ["organizationId", "unitsPerItem", "quantity"] as const) {
    if (existing[field] !== expected[field]) {
      throw new Error(
        `Existing inventory commitment allocation differs for ${allocationKey(expected)}: ${field}`,
      );
    }
  }
}

export const backfillInventoryCommitments: DataMigration = {
  id: "v0.1.21:001_backfill_inventory_commitments",
  releaseVersion: "0.1.21",
  name: "Backfill Rocket confirmation lines into inventory commitments",
  async run(tx) {
    const rawLines = await tx.rocketPurchaseConfirmationLine.findMany({
      where: { confirmedQuantity: { gt: 0 } },
      orderBy: [{ organizationId: "asc" }, { confirmationId: "asc" }, { id: "asc" }],
      select: {
        id: true,
        organizationId: true,
        confirmationId: true,
        poNumber: true,
        productNo: true,
        confirmedQuantity: true,
        confirmation: {
          select: {
            channelAccountId: true,
            freshnessGeneration: true,
            status: true,
            confirmedBy: true,
            confirmedAt: true,
            releasedBy: true,
            releasedAt: true,
            releaseReason: true,
          },
        },
        allocations: {
          select: {
            sellpiaInventorySkuId: true,
            unitsPerVariant: true,
            quantity: true,
          },
        },
      },
    }) as LegacyLine[];
    const lines = rawLines.filter((line) => line.confirmedQuantity > 0);

    const candidates = lines.map((line): CommitmentCandidate => {
      if (line.confirmation.status !== "active" && line.confirmation.status !== "released") {
        throw new Error(
          `Unsupported Rocket confirmation status for ${line.id}: ${line.confirmation.status}`,
        );
      }
      return {
        id: randomUUID(),
        organizationId: line.organizationId,
        kind: ROCKET_REQUEST_KIND,
        sourceId: line.id,
        businessKey: canonicalRocketBusinessKey(line),
        unitQuantity: line.confirmedQuantity,
        status: line.confirmation.status,
        inventoryGeneration: line.confirmation.freshnessGeneration,
        predecessorCommitmentId: null,
        createdBy: line.confirmation.confirmedBy,
        releasedBy: line.confirmation.releasedBy,
        releasedAt: line.confirmation.releasedAt,
        releaseReason: line.confirmation.releaseReason,
        settledBy: null,
        settledAt: null,
        settlementReason: null,
        createdAt: line.confirmation.confirmedAt,
      };
    });

    const activeCandidateByBusinessKey = new Map<string, CommitmentCandidate>();
    for (const candidate of candidates) {
      if (candidate.status !== "active") continue;
      const key = activeBusinessKey(candidate);
      const conflict = activeCandidateByBusinessKey.get(key);
      if (conflict && conflict.sourceId !== candidate.sourceId) {
        throw new Error(
          `Conflicting active business key ${candidate.businessKey}: ${conflict.sourceId}, ${candidate.sourceId}`,
        );
      }
      activeCandidateByBusinessKey.set(key, candidate);
    }

    const candidateBySource = new Map(
      candidates.map((candidate) => [commitmentSourceKey(candidate), candidate]),
    );
    const existingBefore = await tx.inventoryCommitment.findMany({
      where: {
        OR: [
          ...candidates.map((candidate) => ({
            organizationId: candidate.organizationId,
            kind: candidate.kind,
            sourceId: candidate.sourceId,
          })),
          ...candidates
            .filter((candidate) => candidate.status === "active")
            .map((candidate) => ({
              organizationId: candidate.organizationId,
              businessKey: candidate.businessKey,
              status: "active",
            })),
        ],
      },
      select: {
        id: true,
        organizationId: true,
        kind: true,
        sourceId: true,
        businessKey: true,
        unitQuantity: true,
        status: true,
        inventoryGeneration: true,
        predecessorCommitmentId: true,
        createdBy: true,
        releasedBy: true,
        releasedAt: true,
        releaseReason: true,
        settledBy: true,
        settledAt: true,
        settlementReason: true,
        createdAt: true,
      },
    }) as PersistedCommitment[];

    for (const existing of existingBefore) {
      if (existing.status === "active") {
        const candidate = activeCandidateByBusinessKey.get(activeBusinessKey(existing));
        if (candidate && candidate.sourceId !== existing.sourceId) {
          throw new Error(
            `Conflicting active business key ${existing.businessKey}: ${existing.sourceId}, ${candidate.sourceId}`,
          );
        }
      }
      const expected = candidateBySource.get(commitmentSourceKey(existing));
      if (expected) assertCommitmentMatches(existing, expected);
    }

    const existingSourceKeys = new Set(
      existingBefore.map((existing) => commitmentSourceKey(existing)),
    );
    const missingCommitments = candidates.filter(
      (candidate) => !existingSourceKeys.has(commitmentSourceKey(candidate)),
    );
    const createdCommitments = missingCommitments.length === 0
      ? { count: 0 }
      : await tx.inventoryCommitment.createMany({
          data: missingCommitments,
          skipDuplicates: true,
        });

    const persistedCommitments = await tx.inventoryCommitment.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          organizationId: candidate.organizationId,
          kind: candidate.kind,
          sourceId: candidate.sourceId,
        })),
      },
      select: {
        id: true,
        organizationId: true,
        kind: true,
        sourceId: true,
        businessKey: true,
        unitQuantity: true,
        status: true,
        inventoryGeneration: true,
        predecessorCommitmentId: true,
        createdBy: true,
        releasedBy: true,
        releasedAt: true,
        releaseReason: true,
        settledBy: true,
        settledAt: true,
        settlementReason: true,
        createdAt: true,
      },
    }) as PersistedCommitment[];
    const persistedBySource = new Map(
      persistedCommitments.map((commitment) => [commitmentSourceKey(commitment), commitment]),
    );
    for (const candidate of candidates) {
      const persisted = persistedBySource.get(commitmentSourceKey(candidate));
      if (!persisted) {
        throw new Error(`Inventory commitment was not created for source ${candidate.sourceId}`);
      }
      assertCommitmentMatches(persisted, candidate);
    }

    const allocationCandidates = lines.flatMap((line) => {
      const candidate = candidateBySource.get(
        commitmentSourceKey({
          organizationId: line.organizationId,
          kind: ROCKET_REQUEST_KIND,
          sourceId: line.id,
        }),
      );
      const commitment = candidate
        ? persistedBySource.get(commitmentSourceKey(candidate))
        : undefined;
      if (!commitment) {
        throw new Error(`Inventory commitment allocation has no commitment for ${line.id}`);
      }
      return line.allocations.map((allocation): AllocationCandidate => ({
        organizationId: line.organizationId,
        commitmentId: commitment.id,
        sellpiaInventorySkuId: allocation.sellpiaInventorySkuId,
        unitsPerItem: allocation.unitsPerVariant,
        quantity: allocation.quantity,
      }));
    });

    const existingAllocations = await tx.inventoryCommitmentAllocation.findMany({
      where: { commitmentId: { in: persistedCommitments.map(({ id }) => id) } },
      select: {
        organizationId: true,
        commitmentId: true,
        sellpiaInventorySkuId: true,
        unitsPerItem: true,
        quantity: true,
      },
    }) as AllocationCandidate[];
    const allocationCandidateByKey = new Map(
      allocationCandidates.map((allocation) => [allocationKey(allocation), allocation]),
    );
    for (const existing of existingAllocations) {
      const expected = allocationCandidateByKey.get(allocationKey(existing));
      if (expected) assertAllocationMatches(existing, expected);
    }

    const existingAllocationKeys = new Set(existingAllocations.map(allocationKey));
    const missingAllocations = allocationCandidates.filter(
      (allocation) => !existingAllocationKeys.has(allocationKey(allocation)),
    );
    const createdAllocations = missingAllocations.length === 0
      ? { count: 0 }
      : await tx.inventoryCommitmentAllocation.createMany({
          data: missingAllocations,
          skipDuplicates: true,
        });

    return {
      affectedRows: createdCommitments.count + createdAllocations.count,
      details: {
        confirmationCount: new Set(lines.map((line) => line.confirmationId)).size,
        lineCount: candidates.length,
        allocationCount: allocationCandidates.length,
        createdCommitmentCount: createdCommitments.count,
        createdAllocationCount: createdAllocations.count,
        conflictCount: 0,
      },
    };
  },
};
