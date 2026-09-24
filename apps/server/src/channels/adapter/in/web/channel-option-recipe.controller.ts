import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Get,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import { ChannelOptionRecipeCandidateQueryDto, ReplaceChannelOptionRecipeDto } from './dto/channel-option-recipe.dto';
import { CHANNEL_OPTION_RECIPE_CANDIDATE_PORT, type ChannelOptionRecipeCandidatePort } from "../../../application/port/in/listing/channel-option-recipe-candidate.port";

@Controller('channels')
export class ChannelOptionRecipeController {
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
    @Inject(CHANNEL_OPTION_RECIPE_CANDIDATE_PORT) private readonly candidates: ChannelOptionRecipeCandidatePort,
  ) {}

  @Put('options/:channelListingOptionId/inventory-components')
  replaceRecipe(
    @CurrentOrganization() organizationId: string,
    @Param('channelListingOptionId', new ParseUUIDPipe()) channelListingOptionId: string,
    @Body() body: ReplaceChannelOptionRecipeDto,
  ) {
    return this.recipes.replaceRecipe({
      organizationId,
      channelListingOptionId,
      components: body.components,
      expectedComponents: body.expectedComponents,
    });
  }

  @Get('recipe-component-candidates')
  listCandidates(
    @CurrentOrganization() organizationId: string,
    @Query() query: ChannelOptionRecipeCandidateQueryDto,
  ) {
    return this.candidates.search(organizationId, query);
  }
}
