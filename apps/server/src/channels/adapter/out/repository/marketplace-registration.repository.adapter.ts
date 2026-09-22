import { applyPreparedRecipeToOptions } from '../persistence/registered-option-recipes';
import type { PreparedRegistrationRecipe } from '../../../domain/registration-item-code';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from "../../../../common/product-mapping-generation";
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
} from "../../../application/port/in/channel-option-recipe.port";
import {
  normalizeKidItemFirstRegistrationLinks,
  type KidItemFirstOptionLink,
  type KidItemFirstRegistrationLinks,
} from "../../../domain/kiditem-first-registration-links";
import { readListingProductIds } from '../../../read/listing-product-summary.reader';
import { lockChannelListingRow } from "./channel-listing-row-lock";
import type { MarketplaceRegistrationRepositoryPort } from "../../../application/port/out/repository/channel-listing.repository.port";

@Injectable()
export class MarketplaceRegistrationRepositoryAdapter implements MarketplaceRegistrationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipeMutations?: ChannelOptionRecipePort,
  ) {}

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
    if (input.optionLinks.length > 0 && !input.masterProductId) {
      throw new BadRequestException(
        "KidItem-first option links require a MasterProduct identity.",
      );
    }
    if (!input.masterProductId) return;
    if (!this.recipeMutations) {
      throw new Error("Products recipe mutation owner is unavailable");
    }
    if (input.optionLinks.length === 0) {
      await this.recipeMutations.validateRecipeTargets({
        organizationId: input.organizationId,
        expectedMasterProductId: input.masterProductId,
        components: [],
      });
      return;
    }
    for (const link of input.optionLinks) {
      await this.recipeMutations.validateRecipeTargets({
        organizationId: input.organizationId,
        expectedMasterProductId: input.masterProductId,
        components: [{
          masterProductId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        }],
      });
    }
  }

  async resolveProductRegistration(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      submissionKey: string;
      preparedRecipe?: PreparedRegistrationRecipe;
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
    const existingListingProductId = existing
      ? (await readListingProductIds(tx, {
        organizationId: input.organizationId,
        listingIds: [existing.id],
      })).get(existing.id) ?? null
      : null;
    if (
      existing?.sourceCandidateId &&
      existing.sourceCandidateId !== candidate.id
    ) {
      throw new ConflictException(
        "Marketplace listing already belongs to another source candidate.",
      );
    }
    if (
      existingListingProductId &&
      exactLinks.masterProductId &&
      existingListingProductId !== exactLinks.masterProductId
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
        },
        select: {
          id: true,
          channelAccountId: true,
          channelAccount: { select: { channel: true } },
          externalId: true,
          status: true,
        },
      });
      const optionResult = await upsertExactOptionLinks(
        tx,
        input.organizationId,
        created.id,
        optionLinks,
        exactLinks.masterProductId,
      );
      const recipeResult = optionResult.mutations.length > 0
        ? await requireRecipeMutations(this.recipeMutations).applyPreservingRecipesInTransaction(
          tx,
          { organizationId: input.organizationId, mutations: optionResult.mutations },
        )
        : {
          changedOptionCount: 0,
          matchedListingCount: 0,
          conflictingChannelListingOptionIds: [],
          mappingChanged: false,
        };
      assertNoRecipeConflicts(recipeResult.conflictingChannelListingOptionIds);
      // Creating an active listing changes the frozen listing identity even
      // when the registration carries no option links or MasterProduct link.
      if (!recipeResult.mappingChanged) {
        await advanceProductMappingGeneration(tx, input.organizationId);
      }
      if (input.preparedRecipe) await applyPreparedRecipeToOptions(tx, requireRecipeMutations(this.recipeMutations), {
        organizationId: input.organizationId, channelListingId: created.id, recipe: input.preparedRecipe,
      });
      return {
        listingId: created.id,
        channelAccountId: created.channelAccountId!,
        channel: created.channelAccount.channel,
        externalId: created.externalId,
        status: created.status,
      };
    }

    const listingMappingChanged = !existing.isActive;
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
    const optionResult = await upsertExactOptionLinks(
      tx,
      input.organizationId,
      listing.id,
      optionLinks,
      exactLinks.masterProductId,
    );
    const recipeResult = optionResult.mutations.length > 0
      ? await requireRecipeMutations(this.recipeMutations).applyPreservingRecipesInTransaction(
        tx,
        { organizationId: input.organizationId, mutations: optionResult.mutations },
      )
      : {
        changedOptionCount: 0,
        matchedListingCount: 0,
        conflictingChannelListingOptionIds: [],
        mappingChanged: false,
      };
    assertNoRecipeConflicts(recipeResult.conflictingChannelListingOptionIds);
    if ((listingMappingChanged || optionResult.mappingChanged)
      && !recipeResult.mappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    if (input.preparedRecipe) await applyPreparedRecipeToOptions(tx, requireRecipeMutations(this.recipeMutations), {
      organizationId: input.organizationId, channelListingId: listing.id, recipe: input.preparedRecipe,
    });
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
      preparedRecipe?: PreparedRegistrationRecipe;
      externalListingId: string;
      displayName: string;
      masterProductId?: string;
      optionLinks?: Array<{
        externalOptionId: string;
        sellpiaInventorySkuId: string;
        quantity: number;
      }>;
      ownerCapabilityKey: "channels.register_confirmed_listing";
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
      // queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
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
  expectedMasterProductId: string | undefined,
): Promise<{
  mappingChanged: boolean;
  mutations: ChannelOptionRecipeMutation[];
}> {
  let mappingChanged = false;
  const mutations: ChannelOptionRecipeMutation[] = [];
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
          select: { masterProductId: true, quantity: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    if (
      existing.some(
        (option) =>
          option.inventoryComponents.length > 0 &&
          (option.inventoryComponents.length !== 1 ||
            option.inventoryComponents[0]!.masterProductId !==
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
      mutations.push({
        channelListingOptionId: createdOption.id,
        expectedMasterProductId,
        components: [{
          masterProductId: link.sellpiaInventorySkuId,
          quantity: link.quantity,
        }],
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
    mutations.push({
      channelListingOptionId: target.id,
      expectedMasterProductId,
      components: [{
        masterProductId: link.sellpiaInventorySkuId,
        quantity: link.quantity,
      }],
    });
  }
  return { mappingChanged, mutations };
}

function assertNoRecipeConflicts(channelListingOptionIds: readonly string[]): void {
  if (channelListingOptionIds.length > 0) {
    throw new ConflictException(
      "Marketplace option already has a different inventory recipe.",
    );
  }
}

function requireRecipeMutations(
  recipeMutations: ChannelOptionRecipePort | undefined,
): ChannelOptionRecipePort {
  if (!recipeMutations) {
    throw new Error("Products recipe mutation owner is unavailable");
  }
  return recipeMutations;
}
