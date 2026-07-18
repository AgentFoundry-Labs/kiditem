import type { ChannelRecipeSuggestionContext } from './channel-recipe-suggestion-context.repository.port';
import type { ChannelRecipeAutomationProductTopology } from '../../../../domain/channel-recipe-automation-product-group';

export const CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT = Symbol(
  'CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT',
);

export type ChannelRecipeAutomationContext = {
  productVariantId: string;
  masterProductId: string;
  selectedChannelListingOptionIds: string[];
  allLinkedOptions: ChannelRecipeSuggestionContext['options'];
  existingComponents: ChannelRecipeSuggestionContext['existingComponents'];
};

export type ChannelRecipeAutomationAccountContext = {
  products: ChannelRecipeAutomationProductTopology[];
  variants: ChannelRecipeAutomationContext[];
};

export interface ChannelRecipeAutomationContextRepositoryPort {
  listContexts(
    organizationId: string,
    channelAccountId: string,
  ): Promise<ChannelRecipeAutomationAccountContext>;
}
