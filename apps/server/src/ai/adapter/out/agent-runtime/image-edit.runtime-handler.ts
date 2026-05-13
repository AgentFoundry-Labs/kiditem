import {
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
  IMAGE_EDIT_AGENT_TYPE,
  ImageEditAgentInputSchema,
  ImageEditAgentOutputSchema,
  type ImageEditAgentOutput,
} from '../../../domain/agent-output';

const DEFAULT_PYTHON_AGENT_BASE_URL = 'http://localhost:8001';

@Injectable()
export class ImageEditRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  private readonly logger = new Logger(ImageEditRuntimeHandler.name);

  constructor(private readonly registry: AgentRuntimeHandlerRegistry) {}

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

    const output = await this.callPythonAgent(parsed.data);
    this.logger.debug(
      `image_edit run=${ctx.runId} preset=${parsed.data.preset} output=${output.image_url.length} chars`,
    );

    return {
      output,
      provider: 'python-http',
    };
  }

  private async callPythonAgent(
    input: Record<string, unknown>,
  ): Promise<ImageEditAgentOutput> {
    const baseUrl = (
      process.env.PYTHON_AGENTS_BASE_URL
        || process.env.PYTHON_AGENTS_URL
        || DEFAULT_PYTHON_AGENT_BASE_URL
    ).replace(/\/+$/, '');

    let response: Response;
    let text = '';
    try {
      response = await fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_type: IMAGE_EDIT_AGENT_TYPE,
          input,
        }),
        signal: AbortSignal.timeout(190_000),
      });
      text = await response.text();
    } catch (error) {
      throw new AgentOsRuntimeError(
        'python_agent_unreachable',
        `Python image_edit agent is unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw new AgentOsRuntimeError(
        'python_agent_failed',
        this.extractPythonErrorMessage(text) ?? `Python image_edit agent failed with HTTP ${response.status}.`,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new AgentOsRuntimeError(
        'python_agent_invalid_response',
        `Python image_edit agent returned non-JSON response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const candidate = this.readOutputEnvelope(data);
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

  private readOutputEnvelope(data: unknown): unknown {
    if (data && typeof data === 'object' && 'output' in data) {
      return (data as { output: unknown }).output;
    }
    return data;
  }

  private extractPythonErrorMessage(text: string): string | null {
    if (!text.trim()) return null;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      return typeof parsed.detail === 'string' ? parsed.detail : null;
    } catch {
      return text.slice(0, 500);
    }
  }
}
