import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAgentOutputBridge } from '../detail-page-agent-output.bridge';
import { AI_AGENT_SOURCE_TYPES } from '../../../domain/agent-output';
import type { AgentRunFinalizedEvent } from '../../../../agent-os/application/event/agent-run-events';
import type { DetailPageAgentOutputSinkPort } from '../../port/out/detail-page-agent-output-sink.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';

const VALID_BOLD_VERTICAL_OUTPUT = {
  templateId: 'bold-vertical',
  result: {
    hook: {
      subtext: '여름 필수템',
      text: '더블샷',
      titleSub: '슈퍼워터건',
      description: '아이가 신나게 노는\n여름의 시작',
      imageIndex: 0,
      bannerImageIndex: 1,
    },
    section: { name: '더블샷', title: '슈퍼워터건', subtitle: '핵심 포인트' },
    keyPoints: [
      { title: '튼튼한 본체', description: '오래 쓰는 재질', imageIndex: 2 },
      { title: '먼 사거리', description: '경쟁 제품 대비 김', imageIndex: 3 },
      { title: '간편 충전', description: '한 번에 오래 발사', imageIndex: 4 },
    ],
    size: { subtitle: '아이 손 사이즈', imageIndices: [5] },
    color: { subtitle: '비비드 4색', imageIndices: [6, 7] },
    usage: { subtitle: '쉽고 안전한 사용법', imageIndices: [8] },
    detailImageIndices: [9, 10],
    productInfo: [
      { key: '제품명', value: '더블샷 슈퍼워터건' },
      { key: '사이즈', value: '24cm' },
      { key: '재질', value: 'ABS' },
    ],
  },
  imageUrls: ['https://example.com/0.jpg'],
};

function makeBridge() {
  const sink: DetailPageAgentOutputSinkPort = {
    applySuccess: vi.fn().mockResolvedValue(undefined),
    applyFailure: vi.fn().mockResolvedValue(undefined),
  };
  const bridge = new DetailPageAgentOutputBridge(sink);
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
    output: VALID_BOLD_VERTICAL_OUTPUT,
    ...overrides,
  };
}

describe('DetailPageAgentOutputBridge', () => {
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
    expect(sink.applyFailure).not.toHaveBeenCalled();
  });

  it('rejects invalid succeeded output and forwards as agent_output_invalid', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({ output: { templateId: 'bold-vertical', result: {} } }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(sink.applyFailure).toHaveBeenCalledTimes(1);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
  });

  it('extracts sourceResourceId from output __envelope when present', async () => {
    const { bridge, sink } = makeBridge();
    const output = {
      ...VALID_BOLD_VERTICAL_OUTPUT,
      __envelope: { sourceResourceId: 'cg-1234' },
    };
    await bridge.onAgentRunFinalized(makeEvent({ output }));
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceResourceId: 'cg-1234' }),
    );
  });

  it('ignores failed events from other domains (no envelope source type)', async () => {
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

  it('handles failed events that carry our source type envelope', async () => {
    const { bridge, sink } = makeBridge();
    await bridge.onAgentRunFinalized(
      makeEvent({
        status: 'failed',
        output: {
          __envelope: {
            sourceType: AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE,
            sourceResourceId: 'cg-9999',
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
        sourceResourceId: 'cg-9999',
      }),
    );
  });

  it('does not throw if the sink rejects', async () => {
    const sink: DetailPageAgentOutputSinkPort = {
      applySuccess: vi.fn().mockRejectedValue(new Error('downstream gone')),
      applyFailure: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new DetailPageAgentOutputBridge(sink);
    await expect(
      bridge.onAgentRunFinalized(makeEvent()),
    ).resolves.toBeUndefined();
  });
});
