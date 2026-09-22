import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelOptionRecipePort } from '../../../../application/port/in/channel-option-recipe.port';
import type { ChannelOptionRecipeCandidateService } from '../../../../application/service/listing/channel-option-recipe-candidate.service';
import { ChannelOptionRecipeController } from '../channel-option-recipe.controller';
import {
  ChannelOptionRecipeCandidateQueryDto,
  ReplaceChannelOptionRecipeDto,
} from '../dto/channel-option-recipe.dto';

const organizationId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const masterProductId = '00000000-0000-4000-8000-000000000003';

describe('ChannelOptionRecipeController', () => {
  it('publishes the organization-scoped Channels recipe route', () => {
    expect(Reflect.getMetadata('path', ChannelOptionRecipeController)).toBe('channels');
    const handler = ChannelOptionRecipeController.prototype.replaceRecipe;
    expect(Reflect.getMetadata('path', handler)).toBe(
      'options/:channelListingOptionId/inventory-components',
    );
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata('path', ChannelOptionRecipeController.prototype.listCandidates))
      .toBe('recipe-component-candidates');
    expect(Reflect.getMetadata('method', ChannelOptionRecipeController.prototype.listCandidates))
      .toBe(RequestMethod.GET);
  });

  it('passes the authenticated organization and canonical product components to the port', async () => {
    const recipes: Pick<ChannelOptionRecipePort, 'replaceRecipe'> = {
      replaceRecipe: vi.fn().mockResolvedValue({ masterProductId }),
    };
    const candidates: Pick<ChannelOptionRecipeCandidateService, 'search'> = {
      search: vi.fn(),
    };
    const controller = new ChannelOptionRecipeController(
      recipes as ChannelOptionRecipePort,
      candidates as ChannelOptionRecipeCandidateService,
    );
    const body: ReplaceChannelOptionRecipeDto = {
      components: [{ masterProductId, quantity: 2 }],
    };

    await expect(controller.replaceRecipe(organizationId, optionId, body))
      .resolves.toEqual({ masterProductId });
    expect(recipes.replaceRecipe).toHaveBeenCalledWith({
      organizationId,
      channelListingOptionId: optionId,
      components: body.components,
    });

    const query: ChannelOptionRecipeCandidateQueryDto = {
      search: 'blue',
      limit: 10,
      stockStatus: 'all',
    };
    await controller.listCandidates(organizationId, query);
    expect(candidates.search).toHaveBeenCalledWith(organizationId, query);
  });
});
