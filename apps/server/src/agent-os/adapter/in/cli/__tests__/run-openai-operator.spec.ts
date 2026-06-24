import { describe, expect, it } from 'vitest';
import {
  formatRunOpenAiOperatorResult,
  parseRunOpenAiOperatorArgs,
  validateRunOpenAiOperatorEnv,
} from '../run-openai-operator';

describe('run-openai-operator CLI helpers', () => {
  it('parses organization, conversation, request, and worker flags', () => {
    expect(
      parseRunOpenAiOperatorArgs([
        '--organization-id',
        'org-1',
        '--conversation-id=conversation-1',
        '--request-id',
        'request-operator-1',
        '--worker-id=operator-openai-test',
      ]),
    ).toEqual({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-operator-1',
      workerId: 'operator-openai-test',
    });
  });

  it('fails before boot when the OpenAI key or explicit model is missing', () => {
    expect(() =>
      validateRunOpenAiOperatorEnv({
        OPENAI_API_KEY: '',
        AGENT_OS_OPENAI_RESPONSES_MODEL: 'gpt-5.1',
      }),
    ).toThrow('OPENAI_API_KEY is required for the OpenAI Operator harness.');
    expect(() =>
      validateRunOpenAiOperatorEnv({
        OPENAI_API_KEY: 'sk-test',
        AGENT_OS_OPENAI_RESPONSES_MODEL: '',
      }),
    ).toThrow(
      'AGENT_OS_OPENAI_RESPONSES_MODEL is required for the OpenAI Operator harness.',
    );
  });

  it('formats the inspectable execution result with OpenAI runtime metadata', () => {
    const formatted = formatRunOpenAiOperatorResult({
      conversationId: 'conversation-1',
      model: 'gpt-5.1',
      result: {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
      },
    });

    expect(JSON.parse(formatted)).toEqual({
      runtime: 'openai_responses',
      model: 'gpt-5.1',
      executed: true,
      requestId: 'request-operator-1',
      runId: 'run-operator-1',
      reason: null,
      errorCode: null,
      inspectPath: '/agent-os?conversationId=conversation-1',
    });
  });
});
