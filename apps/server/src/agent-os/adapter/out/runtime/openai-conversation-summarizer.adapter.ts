import { Injectable } from '@nestjs/common';
import type { AgentConversationSummarizer } from '../../../application/service/agent-conversation-model-view.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { OpenAiResponsesOperatorRuntimeAdapter } from './openai-responses-operator-runtime.adapter';

const SUMMARY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: { summary: { type: 'string' } },
} as const;

@Injectable()
export class OpenAiConversationSummarizerAdapter
  implements AgentConversationSummarizer
{
  constructor(private readonly responses: OpenAiResponsesOperatorRuntimeAdapter) {}

  async summarize(
    input: Parameters<AgentConversationSummarizer['summarize']>[0],
  ): Promise<string> {
    const result = await this.responses.decide({
      model: input.modelIdentity,
      outputSchema: SUMMARY_OUTPUT_SCHEMA,
      prompt: [
        'Summarize only the supplied canonical conversation turns.',
        'Do not invoke tools, infer authority, or add business facts.',
        `Summary prompt hash: ${input.promptHash}`,
        `Target tokens: ${input.targetTokens}`,
        JSON.stringify(input.turns),
      ].join('\n'),
    });
    try {
      const parsed = JSON.parse(result.rawOutput) as { summary?: unknown };
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        return parsed.summary.trim();
      }
    } catch {
      // Normalize to one stable boundary error below.
    }
    throw new AgentOsRuntimeError(
      'AGENT_CONTEXT_SUMMARY_INVALID',
      'The configured summarizer returned an invalid bounded summary.',
    );
  }
}
