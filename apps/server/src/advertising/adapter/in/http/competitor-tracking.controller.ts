import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentOrganization } from "../../../../auth/decorators/current-organization.decorator";
import { CompetitorTrackingService } from "../../../application/service/competitor-tracking.service";
import {
  AutoConfigureCompetitorTrackersDto,
  CompetitorOverviewQueryDto,
} from "./dto";

@Controller("ads/competitors")
export class CompetitorTrackingController {
  constructor(
    private readonly competitorTrackingService: CompetitorTrackingService,
  ) {}

  @Get()
  getOverview(
    @Query() query: CompetitorOverviewQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.competitorTrackingService.getOverview(
      organizationId,
      query.days ?? 30,
      query.limit ?? 20,
    );
  }

  @Post("trackers/auto")
  autoConfigureTrackers(
    @Body() body: AutoConfigureCompetitorTrackersDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.competitorTrackingService.autoConfigureTrackers(
      organizationId,
      body.maxKeywords ?? 12,
    );
  }

  @Get("seller-targets")
  getSellerTargets(
    @Query() query: CompetitorOverviewQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.competitorTrackingService.getSellerTargets(
      organizationId,
      query.days ?? 30,
      query.limit ?? 20,
    );
  }

  @Get("product-detail-targets")
  getProductDetailTargets(
    @Query() query: CompetitorOverviewQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.competitorTrackingService.getProductDetailTargets(
      organizationId,
      query.days ?? 30,
      query.limit ?? 120,
    );
  }
}
