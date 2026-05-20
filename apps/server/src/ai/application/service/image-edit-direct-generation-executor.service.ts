import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PublicUrlError,
  assertHttpUrl,
  assertPublicHttpUrl,
} from '../../../common/security/public-url';
import {
  ImageEditDirectInputSchema,
  ImageEditDirectOutputSchema,
  type ImageEditDirectOutput,
} from '../../domain/direct-generation';
import {
  IMAGE_EDIT_MEDIA_PORT,
  type ImageEditMediaPort,
} from '../port/out/provider/image-edit-media.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';

class DirectAiGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DirectAiGenerationError';
  }
}

export interface ImageEditDirectGenerationCommand {
  organizationId: string;
  model: string;
  input: unknown;
  logId?: string | null;
}

@Injectable()
export class ImageEditDirectGenerationExecutorService {
  private readonly logger = new Logger(ImageEditDirectGenerationExecutorService.name);

  constructor(
    @Inject(IMAGE_EDIT_MEDIA_PORT)
    private readonly imageEditMedia: ImageEditMediaPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async execute(
    command: ImageEditDirectGenerationCommand,
  ): Promise<ImageEditDirectOutput> {
    if (!command.model || command.model.length === 0) {
      throw new DirectAiGenerationError(
        'model_required',
        'image_edit execution requires an explicit model.',
      );
    }

    const parsed = ImageEditDirectInputSchema.safeParse(command.input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new DirectAiGenerationError(
        'direct_ai_input_invalid',
        issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'image_edit input failed schema validation.',
      );
    }

    this.assertSafeImageSources(parsed.data);

    const result = await this.imageEditMedia.editImage({
      organizationId: command.organizationId,
      model: command.model,
      preset: parsed.data.preset,
      imageUrl: parsed.data.image_url,
      imageUrls: parsed.data.image_urls,
      userPrompt: parsed.data.user_prompt,
    });
    const output = this.validateOutput({ image_url: result.imageUrl });
    this.logger.debug(
      `image_edit direct=${command.logId ?? '(inline)'} preset=${parsed.data.preset} output=${result.storageKey ?? result.imageUrl}`,
    );
    return output;
  }

  private validateOutput(candidate: unknown): ImageEditDirectOutput {
    const validated = ImageEditDirectOutputSchema.safeParse(candidate);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      throw new DirectAiGenerationError(
        'direct_ai_output_invalid',
        issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'image_edit output failed schema validation.',
      );
    }
    return validated.data;
  }

  private assertSafeImageSources(input: Record<string, unknown>): void {
    const imageUrl = input.image_url;
    if (typeof imageUrl === 'string') {
      this.assertSafeImageSource(imageUrl, 'image_url');
    }

    const imageUrls = input.image_urls;
    if (Array.isArray(imageUrls)) {
      imageUrls.forEach((value, index) => {
        if (typeof value === 'string') {
          this.assertSafeImageSource(value, `image_urls.${index}`);
        }
      });
    }
  }

  private assertSafeImageSource(value: string, path: string): void {
    if (value.startsWith('data:image/')) return;
    try {
      if (this.imageStorage.extractKey(value)) {
        assertHttpUrl(value);
        return;
      }
      assertPublicHttpUrl(value);
    } catch (error) {
      if (error instanceof PublicUrlError) {
        throw new DirectAiGenerationError(
          'direct_ai_input_invalid',
          `${path}: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
