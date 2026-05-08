import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailAgentOutputBridge } from '../thumbnail-agent-output.bridge';
import { AI_AGENT_SOURCE_TYPES } from '../../../domain/agent-output';
import type { AgentRunFinalizedEvent } from '../../../../agent-os/application/event/agent-run-events';
import type { ThumbnailAgentOutputSinkPort } from '../../port/out/thumbnail-agent-output-sink.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';

const VALID_OUTPUT = {
  candidates: [
    {
      url: 'https://cdn.example.com/img-1.png',
      filename: 'img-1.png',
      mimeType: 'image/png',
      fileSize: 12345,
    },
  ],
};

function makeBridge() {
  const sink: ThumbnailAgentOutputSinkPort = {
    applySuccess: vi.fn().mockResolvedValue(undefined),
    applyFailure: vi.fn().mockResolvedValue(undefined),
  };
  const bridge = new ThumbnailAgentOutputBridge(sink);
  return { bridge, sink };
}

function makeEvent(
  overrides: Partial<AgentRunFinalizedEvent> = {},
): AgentRunFinalizedEvent {
  return {
    organizationId: ORG,
    requestId: REQUEST,
    runId: RUN,
    status: 'succeeded',
    output: VALID_OUTPUT,
    ...overrides,
  };
}

describe('ThumbnailAgentOutputBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes a valid succeeded output to the sink', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(makeEvent());
    expect(sink.applySuccess).toHaveBeenCalledTimes(1);
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        requestId: REQUEST,
        runId: RUN,
        sourceResourceId: null,
      }),
    );
  });

  it('rejects empty candidates as agent_output_invalid', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({ output: { candidates: [] } }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
  });

  it('rejects unknown URL scheme', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({
        output: { candidates: [{ url: 'ftp://example.com/img.png' }] },
      }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
  });

  it('ignores failed events from other domains', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({
        status: 'failed',
        output: undefined,
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      }),
    );
    expect(sink.applyFailure).not.toHaveBeenCalled();
  });

  it('routes failed events with our source-type envelope', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({
        status: 'failed',
        output: {
          __envelope: {
            sourceType: AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE,
            sourceResourceId: 'tg-7777',
          },
        },
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      }),
    );
    expect(sink.applyFailure).toHaveBeenCalledTimes(1);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'runtime_not_configured',
        sourceResourceId: 'tg-7777',
      }),
    );
  });
});
