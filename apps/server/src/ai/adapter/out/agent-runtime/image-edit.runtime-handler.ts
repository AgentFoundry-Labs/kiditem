import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import {
  PublicUrlError,
  assertHttpUrl,
  assertPublicHttpUrl,
} from '../../../../common/security/public-url';
import {
  IMAGE_EDIT_AGENT_TYPE,
  ImageEditAgentInputSchema,
  ImageEditAgentOutputSchema,
  type ImageEditAgentOutput,
} from '../../../domain/agent-output';
import {
  IMAGE_EDIT_MEDIA_PORT,
  type ImageEditMediaPort,
} from '../../../application/port/out/provider/image-edit-media.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';

@Injectable()
export class ImageEditRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  private readonly logger = new Logger(ImageEditRuntimeHandler.name);

  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    @Inject(IMAGE_EDIT_MEDIA_PORT)
    private readonly imageEditMedia: ImageEditMediaPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly imageStorage: ImageStoragePort,
  ) {}

  onModuleInit(): void {
    this.registry.register(IMAGE_EDIT_AGENT_TYPE, this);
  }

  async execute(ctx: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    if (!ctx.model || ctx.model.length === 0) {
      throw new AgentOsRuntimeError(
        'model_required',
        'image_edit runtime requires an explicit model.',
      );
    }

    const parsed = ImageEditAgentInputSchema.safeParse(ctx.input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AgentOsRuntimeError(
        'agent_input_invalid',
        issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'image_edit input failed schema validation.',
      );
    }

    this.assertSafeImageSources(parsed.data);

    const result = await this.imageEditMedia.editImage({
      organizationId: ctx.organizationId,
      model: ctx.model,
      preset: parsed.data.preset,
      imageUrl: parsed.data.image_url,
      imageUrls: parsed.data.image_urls,
      userPrompt: parsed.data.user_prompt,
    });
    const output = this.validateOutput({ image_url: result.imageUrl });
    this.logger.debug(
      `image_edit run=${ctx.runId} preset=${parsed.data.preset} output=${result.storageKey ?? result.imageUrl}`,
    );

    return {
      output,
      provider: 'gemini-image',
    };
  }

  private validateOutput(candidate: unknown): ImageEditAgentOutput {
    const validated = ImageEditAgentOutputSchema.safeParse(candidate);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      throw new AgentOsRuntimeError(
        'agent_output_invalid',
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
        throw new AgentOsRuntimeError(
          'agent_input_invalid',
          `${path}: ${error.message}`,
        );
      }
      throw error;
    }
  }

}
