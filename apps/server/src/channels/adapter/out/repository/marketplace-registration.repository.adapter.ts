import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { MarketplaceRegistrationRepositoryPort } from "../../../application/port/out/repository/channel-listing.repository.port";
import {
  normalizeKidItemFirstRegistrationLinks,
  type KidItemFirstOptionLink,
  type KidItemFirstRegistrationLinks,
} from "../../../domain/kiditem-first-registration-links";
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from "../../../../common/product-mapping-generation";
import { lockChannelListingRow } from "./channel-listing-row-lock";

const PROVIDER_RECONCILIATION_LEASE_MS = 5 * 60 * 1_000;

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter implements MarketplaceRegistrationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async claimProviderWrite(input: {
    organizationId: string;
    executionId: string;
    preparationId: string;
    channelAccountId: string;
    sourceCandidateId: string;
    idempotencyKey: string;
    requestHash: string;
    ownerIdempotencyKey: string;
  }) {
    if (!isInvocationOwnerKey(input.ownerIdempotencyKey)) {
      throw new ConflictException(
        "Provider write requires an invocation owner idempotency key.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM product_registration_executions
        WHERE id = ${input.executionId}::uuid
          AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE`;
      if (rows.length !== 1)
        throw new NotFoundException(
          "Product registration execution not found.",
        );
      const execution = await tx.productRegistrationExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
        include: {
          productPreparation: { select: { sourceCandidateId: true } },
        },
      });
      if (
        !execution ||
        execution.productPreparationId !== input.preparationId ||
        execution.channelAccountId !== input.channelAccountId ||
        execution.productPreparation.sourceCandidateId !==
          input.sourceCandidateId ||
        execution.idempotencyKey !== input.idempotencyKey ||
        execution.requestHash !== input.requestHash
      ) {
        throw new ConflictException(
          "Frozen product registration execution changed.",
        );
      }
      if (
        execution.ownerIdempotencyKey &&
        execution.ownerIdempotencyKey !== input.ownerIdempotencyKey
      ) {
        throw new ConflictException(
          "Product registration owner idempotency key conflicted.",
        );
      }
      if (!execution.ownerIdempotencyKey) {
        const bound = await tx.productRegistrationExecution.updateMany({
          where: {
            id: execution.id,
            organizationId: input.organizationId,
            ownerIdempotencyKey: null,
          },
          data: { ownerIdempotencyKey: input.ownerIdempotencyKey },
        });
        if (bound.count !== 1) {
          throw new ConflictException(
            "Product registration execution changed.",
          );
        }
      }
      if (
        execution.providerOutcome === "succeeded" &&
        execution.providerSubmissionId &&
        execution.externalListingId
      ) {
        return {
          mode: "replay" as const,
          leaseToken: null,
          providerSubmissionId: execution.providerSubmissionId,
          externalListingId: execution.externalListingId,
        };
      }
      if (execution.providerOutcome === "uncertain") {
        const now = new Date();
        const leaseIsLive =
          execution.leaseToken &&
          execution.leaseClaimedAt &&
          now.getTime() - execution.leaseClaimedAt.getTime() <
            PROVIDER_RECONCILIATION_LEASE_MS;
        // A concurrent same-key caller must never steal an active owner's
        // finalization fence. It can only observe pending reconciliation.
        if (leaseIsLive) {
          return { mode: "reconcile" as const, leaseToken: null };
        }
        const leaseToken = randomUUID();
        const claimed = await tx.productRegistrationExecution.updateMany({
          where: {
            id: execution.id,
            organizationId: input.organizationId,
            providerOutcome: "uncertain",
            status: { in: ["executing", "reconciling"] },
          },
          data: {
            status: "reconciling",
            leaseToken,
            leaseClaimedAt: now,
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException(
            "Product registration execution changed.",
          );
        return { mode: "reconcile" as const, leaseToken };
      }
      if (
        execution.status !== "prepared" ||
        execution.providerOutcome !== "not_attempted"
      ) {
        throw new ConflictException(
          "Product registration execution cannot create a provider listing.",
        );
      }
      const leaseToken = randomUUID();
      const claimed = await tx.productRegistrationExecution.updateMany({
        where: {
          id: execution.id,
          organizationId: input.organizationId,
          status: "prepared",
          providerOutcome: "not_attempted",
          leaseToken: execution.leaseToken,
        },
        data: {
          status: "executing",
          providerOutcome: "uncertain",
          leaseToken,
          leaseClaimedAt: new Date(),
          startedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException("Product registration execution changed.");
      return { mode: "create" as const, leaseToken };
    });
  }

  async finalizeProviderWrite(input: {
    organizationId: string;
    executionId: string;
    leaseToken: string;
    providerSubmissionId: string | null;
    externalListingId: string;
    result: unknown;
  }): Promise<void> {
    const updated = await this.prisma.productRegistrationExecution.updateMany({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        leaseToken: input.leaseToken,
        providerOutcome: "uncertain",
        status: { in: ["executing", "reconciling"] },
      },
      data: {
        status: "succeeded",
        providerOutcome: "succeeded",
        providerSubmissionId: input.providerSubmissionId,
        externalListingId: input.externalListingId,
        resultJson: input.result as Prisma.InputJsonValue,
        completedAt: new Date(),
        leaseToken: null,
        leaseClaimedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Product registration execution changed.");
  }

  async markProviderWriteUncertain(input: {
    organizationId: string;
    executionId: string;
    leaseToken: string;
    message: string;
  }): Promise<void> {
    const updated = await this.prisma.productRegistrationExecution.updateMany({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        leaseToken: input.leaseToken,
        providerOutcome: "uncertain",
        status: "executing",
      },
      data: {
        status: "reconciling",
        lastErrorCode: "provider_uncertain",
        lastErrorMessage: input.message.slice(0, 1_000),
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Product registration execution changed.");
  }

  async markProviderWriteDefinitiveFailure(input: {
    organizationId: string;
    executionId: string;
    leaseToken: string;
    message: string;
  }): Promise<void> {
    const updated = await this.prisma.productRegistrationExecution.updateMany({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        leaseToken: input.leaseToken,
        providerOutcome: "uncertain",
        status: "executing",
      },
      data: {
        status: "failed",
        providerOutcome: "definitive_failure",
        completedAt: new Date(),
        leaseToken: null,
        leaseClaimedAt: null,
        lastErrorCode: "provider_definitive_failure",
        lastErrorMessage: input.message.slice(0, 1_000),
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Product registration execution changed.");
  }

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
    if (!account) throw new NotFoundException("Marketplace account not found.");
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
      throw new ConflictException(
        `Sellpia SKU '${input.sellerSku}' resolved to multiple active channel listings.`,
      );
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

  async preflightExactProductLinks(input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: KidItemFirstOptionLink[];
  }): Promise<void> {
    await assertExactProductGraph(this.prisma, input);
  }

  async resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
    },
  ) {
    const tx = transaction as Prisma.TransactionClient;
    const externalId = input.externalListingId.trim();
    if (!externalId)
      throw new BadRequestException(
        "Marketplace listing identity is required.",
      );
    let exactLinks: KidItemFirstRegistrationLinks;
    try {
      exactLinks = normalizeKidItemFirstRegistrationLinks(
        {
          masterProductId: input.masterProductId,
          optionLinks: input.optionLinks,
        },
        input.submissionKey,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "Invalid KidItem-first product links.",
      );
    }
    await lockProductMapping(tx, input.organizationId);
    const [account, candidate] = await Promise.all([
      tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          status: "active",
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
    ]);
    if (!account) throw new NotFoundException("Marketplace account not found.");
    if (!candidate)
      throw new NotFoundException("Sourcing candidate not found.");
    await assertExactProductGraph(tx, {
      organizationId: input.organizationId,
      ...exactLinks,
    });
    const optionLinks = exactLinks.optionLinks;

    const existingIdentity = await tx.channelListing.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: account.id,
        externalId,
      },
      select: { id: true },
    });
    if (existingIdentity) {
      const locked = await lockChannelListingRow(tx, {
        organizationId: input.organizationId,
        channelListingId: existingIdentity.id,
        activeOnly: false,
        catalogMatchingEligibleOnly: false,
      });
      if (!locked) {
        throw new ConflictException(
          "Marketplace listing changed concurrently.",
        );
      }
    }
    const existing = existingIdentity
      ? await tx.channelListing.findFirst({
          where: {
            id: existingIdentity.id,
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
            isActive: true,
            masterProductId: true,
          },
        })
      : null;
    if (existing) {
      const activeDeletion = await tx.channelListingDeletionOperation.findFirst(
        {
          where: {
            organizationId: input.organizationId,
            channelAccountId: account.id,
            channelListingId: existing.id,
            // A completed provider deletion is also a hard fence: registration
            // finalization must never resurrect a listing that WING deleted.
            OR: [
              { status: { in: ["prepared", "executing", "reconciling"] } },
              { providerOutcome: "succeeded" },
            ],
          },
          select: { id: true },
        },
      );
      if (activeDeletion) {
        throw new ConflictException(
          "Marketplace listing has an active deletion operation and cannot be reactivated.",
        );
      }
    }
    if (
      existing?.sourceCandidateId &&
      existing.sourceCandidateId !== candidate.id
    ) {
      throw new ConflictException(
        "Marketplace listing already belongs to another source candidate.",
      );
    }
    if (
      existing?.masterProductId &&
      exactLinks.masterProductId &&
      existing.masterProductId !== exactLinks.masterProductId
    ) {
      throw new ConflictException(
        "Marketplace listing is linked to another MasterProduct.",
      );
    }
    if (!existing) {
      const created = await tx.channelListing.create({
        data: {
          organizationId: input.organizationId,
          sourceCandidateId: candidate.id,
          channelAccountId: account.id,
          externalId,
          displayName: input.displayName,
          status: "active",
          isActive: true,
          masterProductId: exactLinks.masterProductId,
        },
        select: {
          id: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          externalId: true,
          status: true,
        },
      });
      await upsertExactOptionLinks(
        tx,
        input.organizationId,
        created.id,
        optionLinks,
      );
      // Creating an active listing changes the frozen listing identity even
      // when the registration carries no option links or MasterProduct link.
      await advanceProductMappingGeneration(tx, input.organizationId);
      return {
        listingId: created.id,
        channelAccountId: created.channelAccountId!,
        channel: created.channelAccount.channel,
        externalId: created.externalId,
        status: created.status,
      };
    }

    const listingMappingChanged =
      !existing.isActive
      || Boolean(
        exactLinks.masterProductId
        && existing.masterProductId !== exactLinks.masterProductId,
      );
    const updated = await tx.channelListing.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        OR: [{ sourceCandidateId: null }, { sourceCandidateId: candidate.id }],
      },
      data: {
        sourceCandidateId: candidate.id,
        displayName: input.displayName,
        status: "active",
        isActive: true,
        ...(exactLinks.masterProductId
          ? { masterProductId: exactLinks.masterProductId }
          : {}),
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Marketplace listing changed concurrently.");
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
    if (!listing?.channelAccountId)
      throw new ConflictException("Marketplace listing account is missing.");
    const optionMappingChanged = await upsertExactOptionLinks(
      tx,
      input.organizationId,
      listing.id,
      optionLinks,
    );
    if (listingMappingChanged || optionMappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return {
      listingId: listing.id,
      channelAccountId: listing.channelAccountId,
      channel: listing.channelAccount.channel,
      externalId: listing.externalId,
      status: listing.status,
    };
  }

  async resolveProductRegistrationWithOwnerReceipt(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
      ownerCapabilityKey:
        | "channels.register_confirmed_listing"
        | "channels.submit_coupang_listing";
      ownerIdempotencyKey: string;
      ownerRequestHash: string;
    },
  ) {
    if (
      !isInvocationOwnerKey(input.ownerIdempotencyKey) ||
      !/^[a-f0-9]{64}$/.test(input.ownerRequestHash)
    ) {
      throw new ConflictException(
        "Channels registration owner receipt is invalid.",
      );
    }
    const tx = transaction as Prisma.TransactionClient;
    const lockKey = [
      "channels-registration-owner-receipt",
      input.organizationId,
      input.ownerCapabilityKey,
      input.ownerIdempotencyKey,
    ].join(":");
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"`,
    );
    const receipt =
      await tx.channelRegistrationOwnerIdempotencyReceipt.findFirst({
        where: {
          organizationId: input.organizationId,
          capabilityKey: input.ownerCapabilityKey,
          ownerIdempotencyKey: input.ownerIdempotencyKey,
        },
        select: { requestHash: true, resultJson: true },
      });
    if (receipt) {
      if (receipt.requestHash !== input.ownerRequestHash) {
        throw new ConflictException(
          "Channels registration owner idempotency key conflicted.",
        );
      }
      return receiptListingResult(receipt.resultJson);
    }

    const resolved = await this.resolveProductRegistration(tx, input);
    const result = {
      listingId: resolved.listingId,
      channelAccountId: resolved.channelAccountId,
      channel: resolved.channel,
      externalId: resolved.externalId,
      status: resolved.status,
    };
    await tx.channelRegistrationOwnerIdempotencyReceipt.create({
      data: {
        organizationId: input.organizationId,
        capabilityKey: input.ownerCapabilityKey,
        ownerIdempotencyKey: input.ownerIdempotencyKey,
        requestHash: input.ownerRequestHash,
        resultJson: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }
}

function isInvocationOwnerKey(value: string): boolean {
  return /^capability-invocation:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function receiptListingResult(value: Prisma.JsonValue): {
  listingId: string;
  channelAccountId: string;
  channel: string;
  externalId: string;
  status: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConflictException(
      "Channels registration owner receipt is invalid.",
    );
  }
  const result = value as Record<string, Prisma.JsonValue>;
  if (
    typeof result.listingId !== "string" ||
    typeof result.channelAccountId !== "string" ||
    typeof result.channel !== "string" ||
    typeof result.externalId !== "string" ||
    (result.status !== null && typeof result.status !== "string")
  ) {
    throw new ConflictException(
      "Channels registration owner receipt is invalid.",
    );
  }
  return {
    listingId: result.listingId,
    channelAccountId: result.channelAccountId,
    channel: result.channel,
    externalId: result.externalId,
    status: result.status,
  };
}

async function upsertExactOptionLinks(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listingId: string,
  links: KidItemFirstOptionLink[],
): Promise<boolean> {
  let mappingChanged = false;
  for (const link of links) {
    const externalOptionId = link.externalOptionId;
    const existing = await tx.channelListingOption.findMany({
      where: {
        organizationId,
        listingId,
        OR: [
          { externalOptionId },
          { sellerSku: link.providerOptionKey, isActive: true },
        ],
      },
      select: {
        id: true,
        externalOptionId: true,
        isActive: true,
        inventoryComponents: {
          select: { sellpiaInventorySkuId: true, quantity: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    if (
      existing.some(
        (option) =>
          option.inventoryComponents.length > 0 &&
          (option.inventoryComponents.length !== 1 ||
            option.inventoryComponents[0]!.sellpiaInventorySkuId !==
              link.sellpiaInventorySkuId ||
            option.inventoryComponents[0]!.quantity !== link.quantity),
      )
    ) {
      throw new ConflictException(
        "Marketplace option already has a different inventory recipe.",
      );
    }
    const target =
      existing.find((option) => option.externalOptionId === externalOptionId) ??
      existing[0];
    if (!target) {
      const createdOption = await tx.channelListingOption.create({
        data: {
          organizationId,
          listingId,
          externalOptionId,
          sellerSku: link.providerOptionKey,
          isActive: true,
        },
        select: { id: true },
      });
      await tx.channelListingOptionInventoryComponent.create({
        data: {
          organizationId,
          channelListingOptionId: createdOption.id,
          sellpiaInventorySkuId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        },
      });
      mappingChanged = true;
      continue;
    }
    const updated = await tx.channelListingOption.updateMany({
      where: {
        id: target.id,
        organizationId,
        listingId,
      },
      data: {
        sellerSku: link.providerOptionKey,
        isActive: true,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "Marketplace option changed while confirming its inventory recipe.",
      );
    }
    mappingChanged ||= !target.isActive;
    if (target.inventoryComponents.length === 0) {
      await tx.channelListingOptionInventoryComponent.create({
        data: {
          organizationId,
          channelListingOptionId: target.id,
          sellpiaInventorySkuId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        },
      });
      mappingChanged = true;
    }
  }
  return mappingChanged;
}

async function assertExactProductGraph(
  client: Pick<
    Prisma.TransactionClient,
    "masterProduct" | "sellpiaInventorySku"
  >,
  input: {
    organizationId: string;
    masterProductId?: string;
    optionLinks: ReadonlyArray<{
      sellpiaInventorySkuId: string;
      quantity: number;
    }>;
  },
): Promise<void> {
  if (!input.masterProductId) {
    if (input.optionLinks.length > 0) {
      throw new BadRequestException(
        "KidItem-first option links require a MasterProduct identity.",
      );
    }
    return;
  }
  const masterProduct = await client.masterProduct.findFirst({
    where: {
      id: input.masterProductId,
      organizationId: input.organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!masterProduct) {
    throw new BadRequestException(
      "KidItem-first MasterProduct is inactive, missing, or belongs to another organization.",
    );
  }
  if (input.optionLinks.length === 0) return;
  if (
    input.optionLinks.some(
      (link) => !Number.isSafeInteger(link.quantity) || link.quantity <= 0,
    )
  ) {
    throw new BadRequestException(
      "Every option inventory quantity must be a positive integer.",
    );
  }
  const skuIds = [
    ...new Set(input.optionLinks.map((link) => link.sellpiaInventorySkuId)),
  ];
  const skus = await client.sellpiaInventorySku.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      id: { in: skuIds },
    },
    select: { id: true },
  });
  if (new Set(skus.map((sku) => sku.id)).size !== skuIds.length) {
    throw new BadRequestException(
      "Every KidItem-first inventory SKU must be active and belong to the organization.",
    );
  }
}
