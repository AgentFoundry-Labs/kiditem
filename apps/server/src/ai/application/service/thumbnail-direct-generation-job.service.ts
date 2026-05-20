import { Inject, Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import {
  ThumbnailGenerateDirectInputSchema,
  type ThumbnailGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
  type ThumbnailDirectOutputSinkPort,
} from '../port/out/sink/thumbnail-direct-output-sink.port';
import { ThumbnailDirectGenerationExecutorService } from './thumbnail-direct-generation-executor.service';

@Injectable()
export class ThumbnailDirectGenerationJobService {
  private readonly logger = new Logger(ThumbnailDirectGenerationJobService.name);

  constructor(
    private readonly executor: ThumbnailDirectGenerationExecutorService,
    @Inject(THUMBNAIL_DIRECT_OUTPUT_SINK_PORT)
    private readonly sink: ThumbnailDirectOutputSinkPort,
  ) {}

  schedule(input: {
    organizationId: string;
    generationId: string;
    payload: ThumbnailGenerateDirectInput | Record<string, unknown>;
  }): void {
    setImmediate(() => {
      this.process(input).catch((err) => {
        this.logger.error(
          `thumbnail direct AI job crashed (${input.generationId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });
  }

  async process(input: {
    organizationId: string;
    generationId: string;
    payload: ThumbnailGenerateDirectInput | Record<string, unknown>;
  }): Promise<void> {
    const directJobId = this.directJobId(input.generationId);
    try {
      const parsed = ThumbnailGenerateDirectInputSchema.parse(input.payload);
      const output = await this.executor.execute({
        organizationId: input.organizationId,
        generationInput: parsed,
        model: process.env.AI_IMAGE_MODEL?.trim() || undefined,
      });
      await this.sink.applySuccess({
        organizationId: input.organizationId,
        requestId: directJobId,
        runId: undefined,
        sourceResourceId: input.generationId,
        output,
      });
    } catch (err) {
      const normalized = normalizeDirectAiError(err);
      await this.sink.applyFailure({
        organizationId: input.organizationId,
        requestId: directJobId,
        runId: undefined,
        sourceResourceId: input.generationId,
        errorCode: normalized.errorCode,
        errorMessage: normalized.errorMessage,
      });
    }
  }

  private directJobId(generationId: string): string {
    return `direct-ai:thumbnail:${generationId}`;
  }
}

function normalizeDirectAiError(err: unknown): {
  errorCode: string;
  errorMessage: string;
} {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return {
      errorCode: 'direct_ai_input_invalid',
      errorMessage: issue
        ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
        : 'Direct thumbnail AI input failed schema validation.',
    };
  }
  return {
    errorCode: 'direct_ai_execution_failed',
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}
