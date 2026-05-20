import { Inject, Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import {
  DetailPageGenerateDirectInputSchema,
  type DetailPageGenerateDirectInput,
} from '../../domain/direct-generation';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  type DetailPageDirectOutputSinkPort,
} from '../port/out/sink/detail-page-direct-output-sink.port';
import { DetailPageDirectGenerationExecutorService } from './detail-page-direct-generation-executor.service';

@Injectable()
export class DetailPageDirectGenerationJobService {
  private readonly logger = new Logger(DetailPageDirectGenerationJobService.name);

  constructor(
    private readonly executor: DetailPageDirectGenerationExecutorService,
    @Inject(DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT)
    private readonly sink: DetailPageDirectOutputSinkPort,
  ) {}

  schedule(input: {
    organizationId: string;
    generationId: string;
    payload: DetailPageGenerateDirectInput | Record<string, unknown>;
  }): void {
    setImmediate(() => {
      this.process(input).catch((err) => {
        this.logger.error(
          `detail-page direct AI job crashed (${input.generationId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });
  }

  async process(input: {
    organizationId: string;
    generationId: string;
    payload: DetailPageGenerateDirectInput | Record<string, unknown>;
  }): Promise<void> {
    const directJobId = this.directJobId(input.generationId);
    try {
      const parsed = DetailPageGenerateDirectInputSchema.parse(input.payload);
      const textModel = process.env.AI_TEXT_MODEL?.trim() ?? '';
      const output = await this.executor.execute({
        organizationId: input.organizationId,
        generationInput: parsed,
        textModel,
        modelPlan: {
          image: process.env.AI_IMAGE_MODEL?.trim() || undefined,
          vision: process.env.AI_IMAGE_ANALYSIS_MODEL?.trim() || undefined,
        },
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
    return `direct-ai:detail-page:${generationId}`;
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
        : 'Direct detail-page AI input failed schema validation.',
    };
  }
  return {
    errorCode: 'direct_ai_execution_failed',
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}
