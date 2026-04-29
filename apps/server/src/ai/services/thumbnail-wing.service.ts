import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import { WingAutomationRunner } from '../adapters/wing-automation-runner';
import { parseDataImageUrl } from '../domain/thumbnail-image-source';
import {
  pickRegistrationImageUrl,
  pickWingProductName,
  toRegistrationResult,
  toVerificationResult,
  type WingRegistrationResult,
  type WingVerificationResult,
} from '../mappers/thumbnail-wing.mapper';
import { ThumbnailWingPersistence } from '../persistence/thumbnail-wing.persistence';
import { ThumbnailImageFetcherService } from './thumbnail-image-fetcher.service';

@Injectable()
export class ThumbnailWingService {
  private readonly logger = new Logger(ThumbnailWingService.name);

  constructor(
    private readonly persistence: ThumbnailWingPersistence,
    private readonly imageFetcher: ThumbnailImageFetcherService,
    private readonly automationRunner: WingAutomationRunner,
  ) {}

  async registerToWing(generationId: string, companyId: string): Promise<WingRegistrationResult> {
    const gen = await this.persistence.findGenerationWithCandidates(generationId, companyId);
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${generationId} not found`);

    const selectedUrl = pickRegistrationImageUrl(gen);
    if (!selectedUrl) {
      throw new NotFoundException('Generation not found or no selected image');
    }

    const master = await this.persistence.findRegistrableMaster(gen.masterId, companyId);
    if (!master) throw new NotFoundException(`MasterProduct ${gen.masterId} not found`);

    const productName = pickWingProductName(master);
    if (!productName) {
      throw new BadRequestException('쿠팡 등록 상품명을 찾을 수 없습니다');
    }

    const attempt = await this.persistence.createRegistrationAttempt(generationId, companyId);

    try {
      const imagePath = await this.materializeImage(selectedUrl, generationId);
      const screenshotPath = `/tmp/wing-upload-${generationId}.png`;

      this.logger.log(`Wing 자동화 시작: ${productName}`);
      const automation = await this.automationRunner.runWingUpload({
        productName,
        imagePath,
        screenshotPath,
      });
      await this.persistence.updateRegistrationAttemptOrThrow(attempt.id, companyId, {
        status: automation.success ? 'uploaded' : 'failed',
        errorMessage: automation.success ? null : automation.error ?? 'Unknown error',
        screenshotUrl: automation.success ? screenshotPath : null,
        finishedAt: new Date(),
      });

      return toRegistrationResult(automation, screenshotPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.persistence.updateRegistrationAttemptOrThrow(attempt.id, companyId, {
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      });
      throw err;
    }
  }

  async batchRegister(
    generationIds: string[],
    companyId: string,
  ): Promise<{ results: Array<WingRegistrationResult & { id: string }> }> {
    const results: Array<WingRegistrationResult & { id: string }> = [];
    for (const id of generationIds) {
      try {
        const result = await this.registerToWing(id, companyId);
        results.push({ id, ...result });
      } catch (err) {
        results.push({
          id,
          success: false,
          screenshotPath: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results };
  }

  async clearRegistrationError(id: string, companyId: string): Promise<{ ok: true }> {
    await this.persistence.ensureGenerationExists(id, companyId);
    await this.persistence.deleteFailedRegistrationAttempts(id, companyId);
    return { ok: true };
  }

  async verifyRegistration(id: string, companyId: string): Promise<WingVerificationResult> {
    const gen = await this.persistence.findGenerationWithLatestAttempt(id, companyId);
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const latest = gen.registrationAttempts[0] ?? null;
    if (latest) {
      await this.persistence.updateRegistrationAttemptOrThrow(latest.id, companyId, {
        finishedAt: new Date(),
      });
    }

    return toVerificationResult(latest, gen);
  }

  checkPlaywriterStatus(): Promise<{ connected: boolean; error?: string }> {
    return this.automationRunner.checkPlaywriterStatus();
  }

  private async materializeImage(source: string, generationId: string): Promise<string> {
    const dataUrl = parseDataImageUrl(source);
    if (dataUrl) {
      this.imageFetcher.assertSupportedMime(dataUrl.mimeType);
      const ext = this.imageFetcher.extForMime(dataUrl.mimeType);
      const destPath = `/tmp/wing-upload-input-${generationId}.${ext}`;
      await fs.promises.writeFile(destPath, Buffer.from(dataUrl.base64, 'base64'));
      return destPath;
    }

    const fetched = await this.imageFetcher.fetchTrustedStorageImage(source);
    const ext = this.imageFetcher.extForMime(fetched.mimeType);
    const destPath = `/tmp/wing-upload-input-${generationId}.${ext}`;
    await fs.promises.writeFile(destPath, fetched.buffer);
    return destPath;
  }
}
