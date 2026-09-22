import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelRecipeFactQueries } from '../../../application/port/in/channel-option-recipe.port';
import { readListingProductIds } from './listing-product-summary.reader';
import { allocateKidItemCode } from '../../../../common/kid-item-code';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import type {
  ChannelOptionRecipeRepositoryPort,
} from '../../../application/port/out/persistence/channel-option-recipe.repository.port';
import type {
  ChannelOptionRecipeMutation,
  ChannelRecipeComponentInput,
} from '../../../application/port/in/channel-option-recipe.port';
import { readPreparedRegistrationRecipes } from '../repository/registration-execution.reader';
import { preparedRegistrationRecipe } from '../../../domain/registration/registration-item-code';
import { hashRegistrationSubmissionPayload } from '../../../domain/registration/registration-submission-payload';

const channelIntegrity = new ChannelIntegrityAdapter();

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class ChannelOptionRecipeRepositoryAdapter
implements ChannelOptionRecipeRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
  ) {}

  readListingProductSummaries(transaction: Parameters<ChannelRecipeFactQueries['readListingProductSummaries']>[0], input: Parameters<ChannelRecipeFactQueries['readListingProductSummaries']>[1]) {
    return readListingProductIds(ownerTransactionClient(transaction), input);
  }

  async readConfirmedCompositions(transaction: Parameters<ChannelRecipeFactQueries['readConfirmedCompositions']>[0], input: Parameters<ChannelRecipeFactQueries['readConfirmedCompositions']>[1]) {
    if ([input.accountIds, input.optionIds, input.listingIds].some(ids => ids?.length === 0)) return [];
    const rows = await ownerTransactionClient(transaction).channelListingOption.findMany({
      where: { organizationId: input.organizationId,
        ...(input.optionIds ? { id: { in: [...input.optionIds] } } : {}),
        ...(input.listingIds ? { listingId: { in: [...input.listingIds] } } : {}),
        ...(input.activeOnly ? { isActive: true } : {}),
        listing: { organizationId: input.organizationId,
          ...(input.accountIds ? { channelAccountId: { in: [...input.accountIds] } } : {}),
          ...(input.activeOnly ? { isActive: true } : {}) } },
      select: { id: true, listingId: true, listing: { select: { channelAccountId: true } },
        inventoryComponents: { where: { organizationId: input.organizationId },
          select: { masterProductId: true, quantity: true }, orderBy: { masterProductId: 'asc' } } },
      orderBy: { id: 'asc' },
    });
    return rows.map(row => ({ optionId: row.id, listingId: row.listingId,
      accountId: row.listing.channelAccountId, components: row.inventoryComponents }));
  }

  async findListingsBySourceProducts(transaction: Parameters<ChannelRecipeFactQueries['findListingsBySourceProducts']>[0], input: Parameters<ChannelRecipeFactQueries['findListingsBySourceProducts']>[1]) {
    if (input.masterProductIds.length === 0) return [];
    const tx = ownerTransactionClient(transaction);
    const rows = await tx.channelListing.findMany({
      where: { organizationId: input.organizationId, ...(input.activeOnly ? { isActive: true } : {}),
        options: { some: { organizationId: input.organizationId,
          inventoryComponents: { some: { organizationId: input.organizationId, masterProductId: { in: [...input.masterProductIds] } } } } } },
      select: { id: true },
    });
    const summaries = await readListingProductIds(tx, { organizationId: input.organizationId, listingIds: rows.map(row => row.id) });
    const requested = new Set(input.masterProductIds);
    return rows.flatMap(row => {
      const masterProductId = summaries.get(row.id) ?? null;
      return masterProductId !== null && requested.has(masterProductId) ? [{ listingId: row.id, masterProductId }] : [];
    });
  }

  async replaceConfirmedCompositionInTransaction(transaction: OwnerTransaction, input: {
    organizationId: string; channelListingOptionId: string; salesProductOptionId: string;
    kidItemCode: string; components: readonly ChannelRecipeComponentInput[];
  }): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    const commonOption = await tx.salesProductOption.findFirst({
      where: { id: input.salesProductOptionId, organizationId: input.organizationId, optionCode: input.kidItemCode },
      select: { id: true, components: { select: { masterProductId: true, quantity: true } } },
    });
    if (!commonOption || !sameRecipe(commonOption.components, input.components)) {
      throw new BadRequestException('Confirmed composition does not match its frozen common option identity');
    }
    await validateRecipeTargetsInTransaction(tx, input, this.productTransactionalRead);
    const option = await tx.channelListingOption.findFirst({
      where: { id: input.channelListingOptionId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!option) throw new NotFoundException('Channel listing option was not found');
    await tx.channelListingOptionInventoryComponent.deleteMany({
      where: { organizationId: input.organizationId, channelListingOptionId: input.channelListingOptionId },
    });
    if (input.components.length > 0) await tx.channelListingOptionInventoryComponent.createMany({
      data: input.components.map(component => ({ ...component, organizationId: input.organizationId, channelListingOptionId: input.channelListingOptionId })),
    });
    await tx.channelListingOption.update({
      where: { id: input.channelListingOptionId, organizationId: input.organizationId },
      data: { salesProductOptionId: input.salesProductOptionId, kidItemCode: input.kidItemCode },
    });
    await advanceProductMappingGeneration(tx, input.organizationId);
  }

  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ChannelRecipeComponentInput[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, input.organizationId);
      await validateRecipeTargetsInTransaction(
        tx,
        input,
        this.productTransactionalRead,
      );
      const option = await tx.channelListingOption.findFirst({
        where: {
          id: input.channelListingOptionId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          listingId: true,
          kidItemCode: true,
          inventoryComponents: {
            where: { organizationId: input.organizationId },
            select: { masterProductId: true, quantity: true },
          },
        },
      });
      if (!option) throw new NotFoundException('Channel listing option was not found');
      const recipeChanged = !sameRecipe(option.inventoryComponents, input.components);
      if (recipeChanged) {
        await tx.channelListingOptionInventoryComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelListingOptionId: input.channelListingOptionId,
          },
        });
        if (input.components.length > 0) {
          await tx.channelListingOptionInventoryComponent.createMany({
            data: input.components.map((component) => ({
              organizationId: input.organizationId,
              channelListingOptionId: input.channelListingOptionId,
              masterProductId: component.masterProductId,
              quantity: component.quantity,
            })),
          });
        }
      }
      const codeChanged = await this.synchronizeOptionCode(
        tx, input.organizationId, option, input.components,
      );
      const masterProductId = (await readListingProductIds(tx, {
        organizationId: input.organizationId, listingIds: [option.listingId],
      })).get(option.listingId) ?? null;
      if (recipeChanged || codeChanged) {
        await advanceProductMappingGeneration(tx, input.organizationId);
      }
      return { masterProductId };
    }, TRANSACTION_OPTIONS);
  }

  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ChannelRecipeComponentInput[];
  }): Promise<void> {
    return this.prisma.$transaction(
      (tx) => validateRecipeTargetsInTransaction(
        tx,
        input,
        this.productTransactionalRead,
      ),
      TRANSACTION_OPTIONS,
    );
  }

  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ChannelOptionRecipeMutation[];
  }) {
    return this.prisma.$transaction(
      (tx) => this.applyPreservingRecipesInTransaction(ownerTransaction(tx), input),
      TRANSACTION_OPTIONS,
    );
  }

  async applyPreservingRecipesInTransaction(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      mutations: readonly ChannelOptionRecipeMutation[];
    },
  ) {
    if (input.mutations.length === 0) return emptyResult();
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    const optionIds = input.mutations.map((mutation) => mutation.channelListingOptionId);
    const options = await tx.channelListingOption.findMany({
      where: { organizationId: input.organizationId, id: { in: optionIds } },
      select: {
        id: true,
        listingId: true,
        kidItemCode: true,
        inventoryComponents: {
          where: { organizationId: input.organizationId },
          select: { masterProductId: true, quantity: true },
        },
      },
    });
    if (options.length !== optionIds.length) {
      throw new NotFoundException('Channel listing option was not found');
    }
    const previousProducts = await readListingProductIds(tx, {
      organizationId: input.organizationId, listingIds: [...new Set(options.map((option) => option.listingId))],
    });
    const optionById = new Map(options.map((option) => [option.id, option]));
    const allComponentIds = input.mutations.flatMap((mutation) =>
      mutation.components.map((component) => component.masterProductId));
    const expectedMasterProductIds = [...new Set(input.mutations.flatMap((mutation) =>
      mutation.expectedMasterProductId ? [mutation.expectedMasterProductId] : []))];
    const targetIds = [...new Set([...allComponentIds, ...expectedMasterProductIds])];
    const availableMasterProductIds = await loadRecipeTargets(
      tx,
      input.organizationId,
      targetIds,
      this.productTransactionalRead,
    );
    const missingRegisteredOptions = new Set<string>();
    for (const mutation of input.mutations) {
      if (mutation.expectedMasterProductId && mutation.components.some((component) =>
        component.masterProductId !== mutation.expectedMasterProductId)) {
        throw new BadRequestException(
          'Recipe components do not resolve to the expected canonical MasterProduct',
        );
      }
      const missingTarget = mutation.components.some((component) =>
        !availableMasterProductIds.has(component.masterProductId))
        || Boolean(mutation.expectedMasterProductId
          && !availableMasterProductIds.has(mutation.expectedMasterProductId));
      if (!missingTarget) continue;
      if (!mutation.preparedKidItemCode || !mutation.expectedMasterProductId) {
        throw new BadRequestException(
          'One or more MasterProduct components do not belong to this organization',
        );
      }
      // A historical registration cannot recreate a deleted source identity.
      missingRegisteredOptions.add(mutation.channelListingOptionId);
    }
    if (missingRegisteredOptions.size > 0) {
      const facts = await readPreparedRegistrationRecipes(tx, {
        organizationId: input.organizationId,
        channelListingIds: [...new Set(options.filter((option) =>
          missingRegisteredOptions.has(option.id)).map((option) => option.listingId))],
      });
      for (const mutation of input.mutations) {
        if (!missingRegisteredOptions.has(mutation.channelListingOptionId)) continue;
        const option = optionById.get(mutation.channelListingOptionId)!;
        const historicalRegistration = facts.some((fact) => {
          if (fact.channelListingId !== option.listingId || !fact.submissionPayloadJson) return false;
          const hash = hashRegistrationSubmissionPayload(fact.submissionPayloadJson, channelIntegrity.sha256);
          if (hash !== fact.submissionPayloadHash || hash !== fact.requestHash) return false;
          const recipe = preparedRegistrationRecipe(fact.submissionPayloadJson);
          return recipe !== null
            && recipe.kidItemCode === mutation.preparedKidItemCode
            && recipe.masterProductId === mutation.expectedMasterProductId
            && sameRecipe(mutation.components, [{ masterProductId: recipe.masterProductId, quantity: recipe.quantity }]);
        });
        if (!historicalRegistration) {
          throw new BadRequestException('Missing product requires a matching successful frozen registration');
        }
      }
    }

    const conflicts: string[] = [];
    let codeChanged = false;
    const applied: typeof input.mutations[number][] = [];
    const listingIds = new Set<string>();
    for (const mutation of input.mutations) {
      const option = optionById.get(mutation.channelListingOptionId)!;
      if (mutation.preparedKidItemCode && option.kidItemCode !== null
        && option.kidItemCode !== mutation.preparedKidItemCode) {
        conflicts.push(mutation.channelListingOptionId);
        continue;
      }
      if (missingRegisteredOptions.has(option.id)) {
        // Keep existing recipes/codes intact; an as-yet unlinked option still retains its issued code.
        if (option.kidItemCode === null && option.inventoryComponents.length === 0) {
          await tx.channelListingOption.updateMany({
            where: { id: option.id, organizationId: input.organizationId },
            data: { kidItemCode: mutation.preparedKidItemCode },
          });
          codeChanged = true;
        }
        conflicts.push(option.id);
        continue;
      }
      if (option.inventoryComponents.length > 0) {
        if (!sameRecipe(option.inventoryComponents, mutation.components)) {
          conflicts.push(mutation.channelListingOptionId);
          continue;
        }
        listingIds.add(option.listingId);
        continue;
      }
      if (mutation.components.length === 0) continue;
      applied.push(mutation);
      listingIds.add(option.listingId);
    }

    if (applied.length > 0) {
      await tx.channelListingOptionInventoryComponent.createMany({
        data: applied.flatMap((mutation) => mutation.components.map((component) => ({
          organizationId: input.organizationId,
          channelListingOptionId: mutation.channelListingOptionId,
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        }))),
      });
    }

    for (const mutation of input.mutations) {
      if (conflicts.includes(mutation.channelListingOptionId)) continue;
      const option = optionById.get(mutation.channelListingOptionId)!;
      if (mutation.preparedKidItemCode && option.kidItemCode === null) {
        await tx.channelListingOption.updateMany({
          where: { id: option.id, organizationId: input.organizationId },
          data: { kidItemCode: mutation.preparedKidItemCode },
        });
        option.kidItemCode = mutation.preparedKidItemCode;
        codeChanged = true;
      }
      // A frozen registration already issued the common option's identity.
      // Initial source linking must not replace that KID with the source code.
      if (!mutation.preparedKidItemCode) {
        codeChanged = await this.synchronizeOptionCode(
          tx, input.organizationId, option, mutation.components,
        ) || codeChanged;
      }
    }
    const currentProducts = await readListingProductIds(tx, {
      organizationId: input.organizationId, listingIds: [...listingIds],
    });
    const matchedListingCount = [...listingIds].filter((id) =>
      previousProducts.get(id) == null && currentProducts.get(id) != null).length;
    const mappingChanged = applied.length > 0 || codeChanged;
    if (mappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return {
      changedOptionCount: applied.length,
      matchedListingCount,
      conflictingChannelListingOptionIds: conflicts.sort(),
      mappingChanged,
    };
  }

  private async synchronizeOptionCode(
    tx: Prisma.TransactionClient,
    organizationId: string,
    option: { id: string; kidItemCode: string | null },
    components: readonly ChannelRecipeComponentInput[],
  ): Promise<boolean> {
    if (components.length === 0) return false;
    const singleton = components.length === 1 && components[0]!.quantity === 1;
    let code = option.kidItemCode;
    if (singleton) {
      const identities = await this.productTransactionalRead.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'ids', values: [components[0]!.masterProductId] } },
      );
      if (identities.length !== 1) throw new BadRequestException('MasterProduct was not found');
      code = identities[0]!.code;
      if (code === option.kidItemCode) return false;
    } else {
      const sharedSource = code === null ? []
        : await this.productTransactionalRead.readSourceIdentities(
          { client: tx },
          { organizationId, selector: { kind: 'codes', values: [code] } },
        );
      if (code !== null && sharedSource.length === 0) return false;
      code = await allocateKidItemCode(tx);
    }
    const result = await tx.channelListingOption.updateMany({
      where: { id: option.id, organizationId },
      data: { kidItemCode: code },
    });
    if (result.count !== 1) throw new NotFoundException('Channel listing option was not found');
    return true;
  }

  async clearListingRecipesInTransaction(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ) {
    const tx = ownerTransactionClient(transaction);
    await lockProductMapping(tx, input.organizationId);
    const listing = await tx.channelListing.findFirst({
      where: {
        id: input.channelListingId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        options: {
          where: { organizationId: input.organizationId },
          select: {
            id: true,
            inventoryComponents: {
              where: { organizationId: input.organizationId },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!listing) throw new NotFoundException('Channel listing was not found');
    const changedOptionIds = listing.options
      .filter((option) => option.inventoryComponents.length > 0)
      .map((option) => option.id);
    if (changedOptionIds.length > 0) {
      await tx.channelListingOptionInventoryComponent.deleteMany({
        where: {
          organizationId: input.organizationId,
          channelListingOptionId: { in: changedOptionIds },
        },
      });
    }
    const mappingChanged = changedOptionIds.length > 0;
    if (mappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return {
      changedOptionCount: changedOptionIds.length,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [],
      mappingChanged,
    };
  }


}

function emptyResult() {
  return {
    changedOptionCount: 0,
    matchedListingCount: 0,
    conflictingChannelListingOptionIds: [],
    mappingChanged: false,
  };
}

async function validateRecipeTargetsInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ChannelRecipeComponentInput[];
  },
  productTransactionalRead: ProductTransactionalReadPort,
): Promise<void> {
  const componentIds = input.components.map((component) => component.masterProductId);
  const targetIds = [...new Set([
    ...componentIds,
    ...(input.expectedMasterProductId ? [input.expectedMasterProductId] : []),
  ])];
  const availableMasterProductIds = await loadRecipeTargets(
    transaction,
    input.organizationId,
    targetIds,
    productTransactionalRead,
  );
  if (targetIds.some((id) => !availableMasterProductIds.has(id))) {
    throw new BadRequestException(
      'One or more MasterProduct components do not belong to this organization',
    );
  }
  if (input.expectedMasterProductId
    && (!availableMasterProductIds.has(input.expectedMasterProductId)
      || input.components.some((component) =>
        component.masterProductId !== input.expectedMasterProductId
        || !availableMasterProductIds.has(component.masterProductId)))) {
    throw new BadRequestException(
      'Recipe components do not resolve to the expected canonical MasterProduct',
    );
  }
}

async function loadRecipeTargets(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  masterProductIds: readonly string[],
  productTransactionalRead: ProductTransactionalReadPort,
): Promise<Set<string>> {
  const ids = [...new Set(masterProductIds)];
  if (ids.length === 0) return new Set();
  const identities = await productTransactionalRead.readSourceIdentities(
    { client: transaction },
    {
      organizationId,
      selector: { kind: 'ids', values: ids },
    },
  );
  const availableMasterProductIds = new Set(
    identities.map((identity) => identity.masterProductId),
  );
  return availableMasterProductIds;
}

function sameRecipe(
  current: readonly ChannelRecipeComponentInput[],
  replacement: readonly ChannelRecipeComponentInput[],
): boolean {
  if (current.length !== replacement.length) return false;
  const bySku = new Map(current.map((component) => [
    component.masterProductId,
    component.quantity,
  ]));
  return replacement.every((component) =>
    bySku.get(component.masterProductId) === component.quantity);
}
