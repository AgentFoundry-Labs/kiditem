@Controller('sourcing/workspace')
export class SourcingWorkspaceController {
  constructor(private readonly recommendations: SourcingRecommendationService) {}

  @Post('recommendations/refresh')
  refresh(@CurrentOrganization() organizationId: string) {
    return this.recommendations.refresh({ organizationId });
  }
}
