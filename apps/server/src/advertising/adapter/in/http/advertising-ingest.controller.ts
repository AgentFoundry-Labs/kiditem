import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { AdvertisingCompetitorCatalogBatchSchema } from '@kiditem/shared/sourcing';
import { AdCollectService } from '../../../application/service/ad-collect.service';
import { AdSyncService } from '../../../application/service/ad-sync.service';
import { CompetitorCatalogOperationService } from '../../../application/service/competitor-catalog-operation.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CollectAdsDto,
  CreateScrapeTargetDto,
  ExtensionSyncDto,
  MarkScrapedDto,
} from './dto';

@Controller('ads')
export class AdvertisingIngestController {
  constructor(
    private readonly adCollectService: AdCollectService,
    private readonly adSyncService: AdSyncService,
    private readonly competitorCatalogOperation: CompetitorCatalogOperationService,
  ) {}

  @Post('collect')
  startCollection(@Body() body: CollectAdsDto, @CurrentOrganization() organizationId: string) {
    return this.adCollectService.startCollection(body.period, organizationId);
  }

  @Get('collect/status')
  getCollectStatus(@CurrentOrganization() organizationId: string) {
    return this.adCollectService.getStatus(organizationId);
  }

  @Post('extension/sync')
  extensionSync(@Body() body: ExtensionSyncDto, @CurrentOrganization() organizationId: string) {
    return this.adSyncService.sync(body, organizationId);
  }

  @Post('competitors/browser-operations/:runId/catalogs')
  ingestCompetitorCatalogOperation(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const batch = AdvertisingCompetitorCatalogBatchSchema.safeParse(rawBody);
    if (!batch.success) {
      throw new BadRequestException('invalid_competitor_catalog_batch');
    }
    const attemptToken = z.string().uuid().safeParse(rawAttemptToken);
    if (!attemptToken.success) {
      throw new BadRequestException('invalid_operation_attempt_token');
    }
    return this.competitorCatalogOperation.ingest({
      organizationId,
      operationRunId: runId,
      attemptToken: attemptToken.data,
      batch: batch.data,
    });
  }

  @Get('extension/status')
  extensionStatus(@CurrentOrganization() organizationId: string) {
    return this.adSyncService.getExtensionStatus(organizationId);
  }

  @Get('scrape-targets')
  getScrapeTargets(@CurrentOrganization() organizationId: string) {
    return this.adSyncService.getScrapeTargets(organizationId);
  }

  @Post('scrape-targets')
  handleScrapeTarget(
    @Body() body: MarkScrapedDto | CreateScrapeTargetDto,
    @CurrentOrganization() organizationId: string,
  ) {
    if ('action' in body && (body as MarkScrapedDto).action === 'markScraped') {
      return this.adSyncService.markScraped((body as MarkScrapedDto).id, organizationId);
    }

    const createBody = body as CreateScrapeTargetDto;
    return this.adSyncService.createScrapeTarget(
      createBody.url,
      createBody.label,
      createBody.category,
      organizationId,
    );
  }

  @Delete('scrape-targets/:id')
  deleteScrapeTarget(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.adSyncService.deleteScrapeTarget(id, organizationId);
  }
}
