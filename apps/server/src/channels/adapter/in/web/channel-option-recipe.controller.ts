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
import { ChannelOptionRecipeCandidateService } from '../../../application/service/channel-option-recipe-candidate.service';

@Controller('channels')
export class ChannelOptionRecipeController {
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
    private readonly candidates: ChannelOptionRecipeCandidateService,
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
