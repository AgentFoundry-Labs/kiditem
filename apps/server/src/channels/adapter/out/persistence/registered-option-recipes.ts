import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { readPreparedRegistrationRecipes } from './registration-operation-facts';
import { preparedRegistrationRecipe, type PreparedRegistrationRecipe } from '../../../domain/registration/registration-item-code';
import type { ChannelOptionRecipePort } from '../../../application/port/in/channel-option-recipe.port';

/** Attach only real catalog options. A listing ID alone is not an external option identity. */
export async function applyPreparedRecipeToOptions(
  transaction: OwnerTransaction,
  recipes: ChannelOptionRecipePort,
  input: { organizationId: string; channelListingId: string; recipe: PreparedRegistrationRecipe },
): Promise<void> {
  const tx = ownerTransactionClient(transaction);
  const options = await tx.channelListingOption.findMany({
    where: { organizationId: input.organizationId, listingId: input.channelListingId, sellerSku: input.recipe.kidItemCode },
    select: { id: true },
  });
  if (options.length === 0) return;
  await recipes.applyPreservingRecipesInTransaction(transaction, {
    organizationId: input.organizationId,
    mutations: options.map(({ id }) => ({
      channelListingOptionId: id,
      expectedMasterProductId: input.recipe.masterProductId,
      preparedKidItemCode: input.recipe.kidItemCode,
      components: [{ masterProductId: input.recipe.masterProductId, quantity: input.recipe.quantity }],
    })),
  });
}

/** Catalog publication completes links from successful registration operations (hash-checked by the reader). */
export async function applyRegisteredOptionRecipes(
  transaction: OwnerTransaction,
  recipes: ChannelOptionRecipePort,
  input: { organizationId: string; channelListingIds: readonly string[] },
): Promise<void> {
  const tx = ownerTransactionClient(transaction);
  const facts = await readPreparedRegistrationRecipes(tx, input);
  const seen = new Set<string>();
  for (const fact of facts) {
    const recipe = preparedRegistrationRecipe(fact.snapshot);
    if (!recipe) continue;
    const key = `${fact.channelListingId}:${recipe.kidItemCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await applyPreparedRecipeToOptions(transaction, recipes, {
      organizationId: input.organizationId, channelListingId: fact.channelListingId, recipe,
    });
  }
}
