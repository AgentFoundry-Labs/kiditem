import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import {
  WING_AUTOMATION_PORT,
  type WingAutomationPort,
} from '../port/out/wing-automation.port';
import {
  IMAGE_FETCH_PORT,
  type ImageFetchPort,
} from '../port/out/image-fetch.port';
import {
  THUMBNAIL_WING_REPOSITORY_PORT,
  type ThumbnailWingRepositoryPort,
} from '../port/out/thumbnail-wing.repository.port';
import { MAX_FETCH_BYTES, parseDataImageUrl } from '../../domain/thumbnail-image-source';
import {
  pickRegistrationImageUrl,
  pickWingProductName,
  toRegistrationResult,
  toVerificationResult,
  type WingRegistrationResult,
  type WingVerificationResult,
} from '../../mapper/thumbnail-wing.mapper';

@Injectable()
export class ThumbnailWingService {
  private readonly logger = new Logger(ThumbnailWingService.name);

  constructor(
    @Inject(THUMBNAIL_WING_REPOSITORY_PORT)
    private readonly repository: ThumbnailWingRepositoryPort,
    @Inject(IMAGE_FETCH_PORT)
    private readonly imageFetcher: ImageFetchPort,
    @Inject(WING_AUTOMATION_PORT)
    private readonly automationRunner: WingAutomationPort,
  ) {}

  async prepareWingRegistration(
    generationId: string,
    organizationId: string,
  ): Promise<WingRegistrationPrepareResult> {
    const target = await this.resolveRegistrationTarget(generationId, organizationId);
    const image = await this.loadImagePayload(target.selectedUrl, generationId);
    const attempt = await this.repository.createRegistrationAttempt(generationId, organizationId);

    return {
      attemptId: attempt.id,
      generationId,
      productName: target.productName,
      image,
    };
  }

  async completeWingRegistration(
    generationId: string,
    organizationId: string,
    command: WingRegistrationCompleteCommand,
  ): Promise<WingRegistrationResult> {
    const screenshotPath = command.success ? command.screenshotUrl ?? null : null;
    const errorMessage = command.success ? null : command.error ?? 'Wing upload failed';
    await this.repository.updateRegistrationAttemptOrThrow(
      command.attemptId,
      organizationId,
      {
        status: command.success ? 'uploaded' : 'failed',
        errorMessage,
        screenshotUrl: screenshotPath,
        externalId: command.success ? command.externalId ?? null : null,
        finishedAt: new Date(),
      },
      generationId,
    );

    return {
      success: command.success,
      screenshotPath,
      ...(command.success ? {} : { error: errorMessage ?? 'Wing upload failed' }),
    };
  }

  async registerToWing(generationId: string, organizationId: string): Promise<WingRegistrationResult> {
    this.assertLocalServerAutomationAllowed();
    const target = await this.resolveRegistrationTarget(generationId, organizationId);

    const attempt = await this.repository.createRegistrationAttempt(generationId, organizationId);

    try {
      const imagePath = await this.materializeImage(target.selectedUrl, generationId);
      const screenshotPath = `/tmp/wing-upload-${generationId}.png`;

      this.logger.log(`Wing 자동화 시작: ${target.productName}`);
      const automation = await this.automationRunner.runWingUpload({
        productName: target.productName,
        imagePath,
        screenshotPath,
      });
      await this.repository.updateRegistrationAttemptOrThrow(attempt.id, organizationId, {
        status: automation.success ? 'uploaded' : 'failed',
        errorMessage: automation.success ? null : automation.error ?? 'Unknown error',
        screenshotUrl: automation.success ? screenshotPath : null,
        finishedAt: new Date(),
      });

      return toRegistrationResult(automation, screenshotPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repository.updateRegistrationAttemptOrThrow(attempt.id, organizationId, {
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      });
      throw err;
    }
  }

  async batchRegister(
    generationIds: string[],
    organizationId: string,
  ): Promise<{ results: Array<WingRegistrationResult & { id: string }> }> {
    const results: Array<WingRegistrationResult & { id: string }> = [];
    for (const id of generationIds) {
      try {
        const result = await this.registerToWing(id, organizationId);
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

  async clearRegistrationError(id: string, organizationId: string): Promise<{ ok: true }> {
    await this.repository.ensureGenerationExists(id, organizationId);
    await this.repository.deleteFailedRegistrationAttempts(id, organizationId);
    return { ok: true };
  }

  async verifyRegistration(id: string, organizationId: string): Promise<WingVerificationResult> {
    const gen = await this.repository.findGenerationWithLatestAttempt(id, organizationId);
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const latest = gen.registrationAttempts[0] ?? null;
    if (latest) {
      await this.repository.updateRegistrationAttemptOrThrow(latest.id, organizationId, {
        finishedAt: new Date(),
      });
    }

    return toVerificationResult(latest, gen);
  }

  checkPlaywriterStatus(): Promise<{ connected: boolean; error?: string }> {
    if (this.isServerAutomationBlocked()) {
      return Promise.resolve({
        connected: false,
        error: '스테이징/운영 Wing 등록은 Chrome 확장 프로그램으로만 실행할 수 있습니다.',
      });
    }
    return this.automationRunner.checkPlaywriterStatus();
  }

  private async resolveRegistrationTarget(
    generationId: string,
    organizationId: string,
  ): Promise<{ productName: string; selectedUrl: string }> {
    const gen = await this.repository.findGenerationWithCandidates(generationId, organizationId);
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${generationId} not found`);

    const selectedUrl = pickRegistrationImageUrl(gen);
    if (!selectedUrl) {
      throw new NotFoundException('Generation not found or no selected image');
    }
    if (!gen.masterId) {
      throw new BadRequestException('소싱 후보 썸네일은 상품 승격 후 등록할 수 있습니다');
    }

    const master = await this.repository.findRegistrableMaster(gen.masterId, organizationId);
    if (!master) throw new NotFoundException(`MasterProduct ${gen.masterId} not found`);

    const productName = pickWingProductName(master);
    if (!productName) {
      throw new BadRequestException('쿠팡 등록 상품명을 찾을 수 없습니다');
    }

    return { productName, selectedUrl };
  }

  private async loadImagePayload(
    source: string,
    generationId: string,
  ): Promise<WingRegistrationPrepareResult['image']> {
    const dataUrl = parseDataImageUrl(source);
    if (dataUrl) {
      this.imageFetcher.assertSupportedMime(dataUrl.mimeType);
      const buffer = Buffer.from(dataUrl.base64, 'base64');
      this.assertImageSize(buffer.length);
      const ext = this.imageFetcher.extForMime(dataUrl.mimeType);
      return {
        dataUrl: source,
        filename: `${generationId}.${ext}`,
        mimeType: dataUrl.mimeType,
      };
    }

    const fetched = await this.imageFetcher.fetchTrustedStorageImage(source);
    this.assertImageSize(fetched.buffer.length);
    const ext = this.imageFetcher.extForMime(fetched.mimeType);
    return {
      dataUrl: `data:${fetched.mimeType};base64,${fetched.buffer.toString('base64')}`,
      filename: `${generationId}.${ext}`,
      mimeType: fetched.mimeType,
    };
  }

  private assertImageSize(bytes: number): void {
    if (bytes > MAX_FETCH_BYTES) {
      throw new BadRequestException('image too large');
    }
  }

  private assertLocalServerAutomationAllowed(): void {
    if (!this.isServerAutomationBlocked()) return;
    throw new ServiceUnavailableException(
      '스테이징/운영 Wing 등록은 Chrome 확장 프로그램으로만 실행할 수 있습니다.',
    );
  }

  private isServerAutomationBlocked(): boolean {
    return process.env.NODE_ENV === 'production';
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

export interface WingRegistrationPrepareResult {
  attemptId: string;
  generationId: string;
  productName: string;
  image: {
    dataUrl: string;
    filename: string;
    mimeType: string;
  };
}

export interface WingRegistrationCompleteCommand {
  attemptId: string;
  success: boolean;
  error?: string;
  externalId?: string;
  screenshotUrl?: string;
}
